/**
 * Artifact-preview panel state: the open flag, the ordered tabs (one per
 * opened artifact), the focused tab, and the per-tab read settlement the
 * apply body mirrors from the session read remote. Tabs survive row
 * re-renders and conversation switches; each tab owns the session identity
 * its path was produced in.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ArtifactKind } from './classify.ts'

/** Identity of one opened preview tab; `${sessionId}:${path}` is unique. */
export interface ArtifactTab {
  /** Owning session identity recorded at open time. */
  readonly sessionId: SessionId
  /** Produced path in Host syntax (already Session-workspace-resolved). */
  readonly path: string
  /** Basename shown in the tab and panel header. */
  readonly name: string
  /** Render kind pinned at open time. */
  readonly kind: ArtifactKind
}

/** Settled read outcome for one tab; the panel body renders from this. */
export type ArtifactRead =
  | { readonly status: 'loading' }
  | { readonly status: 'ready', readonly text?: string, readonly url?: string, readonly byteSize: number }
  | { readonly status: 'error', readonly code: string, readonly message: string }
  | { readonly status: 'fallback' }

/** Render-facing artifact-preview panel state. */
export interface ArtifactPanelState {
  /** Panel mode: expanded shows the panel body, collapsed shows the edge grip. */
  mode: 'expanded' | 'collapsed'
  /** Opened tabs in open order; the active tab renders last in the strip. */
  tabs: readonly ArtifactTab[]
  /** Focused tab identity; `null` only while no tab is open. */
  activeKey: string | null
  /** Settled read per tab key; absent until its first read settles. */
  reads: Readonly<Record<string, ArtifactRead>>
}

/** Declared action shape giving the factory a stable return type. */
export type ArtifactPanelActions = {
  openTab: (draft: ArtifactPanelState, tab: ArtifactTab) => void
  focusTab: (draft: ArtifactPanelState, key: string) => void
  closeTab: (draft: ArtifactPanelState, key: string) => void
  collapsePanel: (draft: ArtifactPanelState) => void
  expandPanel: (draft: ArtifactPanelState) => void
  setRead: (draft: ArtifactPanelState, key: string, read: ArtifactRead) => void
  clearRead: (draft: ArtifactPanelState, key: string) => void
}

/** Stable tab identity from its owning session and path. */
export function artifactTabKey(sessionId: SessionId, path: string): string {
  return `${sessionId}:${path}`
}

/**
 * Factory for the artifact-preview panel store. Declared at register in
 * {@link ./index.ts}; one instance per browser root (module-level handles
 * are forbidden).
 * @returns the store handle (snapshot source + bound actions).
 */
export function createArtifactPanelStore(): EngineStoreHandle<ArtifactPanelState, ArtifactPanelActions> {
  return defineStore({
    init: (): ArtifactPanelState => ({
      mode: 'collapsed',
      tabs: [],
      activeKey: null,
      reads: {},
    }),
    actions: {
      openTab: (draft, tab) => {
        const key = artifactTabKey(tab.sessionId, tab.path)
        if (!draft.tabs.some(existing => artifactTabKey(existing.sessionId, existing.path) === key)) {
          draft.tabs = [...draft.tabs, tab]
        }
        draft.activeKey = key
        draft.mode = 'expanded'
      },
      focusTab: (draft, key) => {
        if (draft.tabs.some(existing => artifactTabKey(existing.sessionId, existing.path) === key)) {
          draft.activeKey = key
          draft.mode = 'expanded'
        }
      },
      closeTab: (draft, key) => {
        const index = draft.tabs.findIndex(
          existing => artifactTabKey(existing.sessionId, existing.path) === key,
        )
        if (index === -1) return
        const next = draft.tabs.filter(
          existing => artifactTabKey(existing.sessionId, existing.path) !== key,
        )
        draft.tabs = next
        const reads = { ...draft.reads }
        delete reads[key]
        draft.reads = reads
        // Closing tabs never hides the panel (the close button owns that);
        // the strip runs empty and the body shows the empty state.
        if (draft.activeKey === key) {
          const neighbor = next[Math.min(index, next.length - 1)]
          draft.activeKey = neighbor === undefined ? null : artifactTabKey(neighbor.sessionId, neighbor.path)
        }
      },
      collapsePanel: (draft) => {
        draft.mode = 'collapsed'
      },
      expandPanel: (draft) => {
        draft.mode = 'expanded'
      },
      setRead: (draft, key, read) => {
        draft.reads = { ...draft.reads, [key]: read }
      },
      clearRead: (draft, key) => {
        const reads = { ...draft.reads }
        delete reads[key]
        draft.reads = reads
      },
    },
  })
}
