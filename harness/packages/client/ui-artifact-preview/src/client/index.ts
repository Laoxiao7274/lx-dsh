/**
 * Artifact-preview plugin, browser half: registers the classified
 * produced-artifact row into the chat turn-tail chain (shadowing the
 * official chips row while composed) and the tabbed preview panel into
 * the shell overlay. All policy lives here — the two-lane classification,
 * the read routing per kind, the thumbnail cache, and read de-duplication
 * — so composing this plugin out of cordis.yml removes both surfaces
 * entirely. Store writes reach the registration's instance through the
 * panel's bound actions (the framework owns the instance; apply never
 * creates a second one).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-deliverables/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import { ArtifactPanel, type ArtifactPanelInjected } from './ArtifactPanel.tsx'
import { ArtifactRow, type ArtifactRowHooks } from './ArtifactRow.tsx'
import {
  artifactTabKey, createArtifactPanelStore, type ArtifactTab,
} from './artifact-store.ts'
import { artifactKind, basename, classifyArtifacts, type ClassifiedArtifact, readForm } from './classify.ts'
import { en, NS, zh, type ArtifactPreviewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Artifact-preview row and panel copy. */
    'artifactPreview': ArtifactPreviewKey
  }
}

/** Services required by the turn-tail row and the overlay panel. */
export const inject = ['slots', 'locale', 'sessions', 'remote', 'remote.session']

type PanelActions = BoundActions<ReturnType<typeof createArtifactPanelStore>>

/**
 * The side-panel mutex event: each right-anchored panel announces its own
 * expansion and collapses when another announces one. A window-level
 * convention (no cross-package state) — each panel's own entry reopens it,
 * so a lost announcement costs nothing.
 */
const SIDE_PANEL_EVENT = 'lx-side-panel'

/** Side-panel owners that join the mutex. */
type SidePanelOwner = 'artifact-preview' | 'lx-quick'

/**
 * Client plugin body: register the dictionaries, the turn-tail row, and the
 * overlay preview panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-artifact-preview: dictionaries')
  const panelStore = createArtifactPanelStore()
  const thumbnails = createSnapshotStore<Record<string, string>>({})
  let bound: PanelActions | undefined
  /** Tab keys whose first read already started (apply-side de-dup). */
  const started = new Set<string>()

  /** Session cwd for path resolution, from the live session list. */
  const sessionCwd = (sessionId: SessionId): string | undefined =>
    ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd

  /** Resolve a produced path against its Session workspace (Host syntax). */
  const resolvePath = (sessionId: SessionId, path: string): string => {
    if (/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(path)) return path
    const cwd = sessionCwd(sessionId)
    return cwd === undefined ? path : `${cwd.replace(/[\\/]+$/, '')}/${path}`
  }

  /** Decode a base64 read into a browser blob URL. */
  const blobUrl = (data: string, mediaType: string): string => {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return URL.createObjectURL(new Blob([bytes], { type: mediaType }))
  }

  /** Read one tab's file and settle its store read entry. */
  const readTab = (tab: ArtifactTab): void => {
    const actions = bound
    if (actions === undefined) return
    const key = artifactTabKey(tab.sessionId, tab.path)
    if (tab.kind === 'binary') {
      actions.setRead(key, { status: 'fallback' })
      return
    }
    actions.setRead(key, { status: 'loading' })
    void ctx.remote.session.readWorkspaceFile({
      sessionId: tab.sessionId,
      path: tab.path,
      as: readForm(tab.kind),
    }).then(result => {
      if (!result.ok) {
        actions.setRead(key, {
          status: 'error',
          code: result.error.code,
          message: result.error.message,
        })
        return
      }
      const value = result.value
      if (value.kind === 'text') {
        actions.setRead(key, {
          status: 'ready', text: value.text, byteSize: value.byteSize,
        })
        return
      }
      const url = blobUrl(value.data, value.mediaType)
      actions.setRead(key, {
        status: 'ready', url, byteSize: value.byteSize,
      })
      if (tab.kind === 'image') thumbnails.update(draft => { draft[key] = url })
    }).catch((error: unknown) => {
      actions.setRead(key, {
        status: 'error',
        code: 'gateway/internal',
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  /** Open (or focus) one artifact's preview tab and start its first read. */
  const openArtifact = (sessionId: SessionId, path: string): void => {
    const resolved = resolvePath(sessionId, path)
    const tab: ArtifactTab = {
      sessionId,
      path: resolved,
      name: basename(resolved),
      kind: artifactKind(resolved),
    }
    bound?.openTab(tab)
    announceExpanded()
    const key = artifactTabKey(tab.sessionId, tab.path)
    if (!started.has(key)) {
      started.add(key)
      readTab(tab)
    }
  }

  /** Announce this panel's expansion to the other side panels. */
  const announceExpanded = (): void => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(SIDE_PANEL_EVENT, {
      detail: { owner: 'artifact-preview', expanded: true },
    }))
  }

  /** Collapse when another side panel announces an expansion. */
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    const onOther = (event: Event): void => {
      const detail = (event as CustomEvent<{ owner: SidePanelOwner, expanded: boolean }>).detail
      if (detail?.owner === 'artifact-preview') return
      if (detail?.expanded === true) bound?.collapsePanel()
    }
    window.addEventListener(SIDE_PANEL_EVENT, onOther)
    return () => { window.removeEventListener(SIDE_PANEL_EVENT, onOther) }
  }, 'ui-artifact-preview: side panel mutex')

  ctx.effect(() => () => {
    for (const url of Object.values(thumbnails.getSnapshot())) URL.revokeObjectURL(url)
  }, 'ui-artifact-preview: thumbnail release')

  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    priority: -100,
    locale: NS,
    select: (owner: TurnTailOwnerProps): readonly ClassifiedArtifact[] | null => {
      const data = owner.turn.data.get('deliverables')
      if (data === undefined) return null
      const paths: string[] = []
      const seen = new Set<string>()
      for (const produced of data.produced) {
        if (produced.seq > owner.seq || seen.has(produced.path)) continue
        seen.add(produced.path)
        paths.push(produced.path)
      }
      return paths.length === 0 ? null : classifyArtifacts(paths)
    },
    inject: (): { open: (sessionId: SessionId, path: string) => void, hooks: ArtifactRowHooks } => ({
      open: openArtifact,
      hooks: { thumbnails },
    }),
  }, ArtifactRow))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'artifact-preview-panel',
    locale: NS,
    store: panelStore,
    inject: (actions): ArtifactPanelInjected => {
      bound = actions
      return {
        reload: (tab) => { readTab(tab) },
        openExternal: (tab) => {
          void ctx.remote.session.openWorkspacePath({ path: tab.path })
        },
        copyPath: (path) => { void navigator.clipboard?.writeText(path) },
        locateFolder: (tab) => {
          const folder = tab.path.replace(/[\\/][^\\/]+$/, '')
          void ctx.remote.session.openWorkspacePath({ path: folder })
        },
        markdownLabels: (bound: (key: ArtifactPreviewKey) => string): MarkdownLabels => ({
          code: { copyLabel: bound('view.copy'), copiedLabel: bound('view.copied') },
          footnotes: bound('view.footnotes'),
        }),
      }
    },
  }, ArtifactPanel))
}
