/** Registration and read flow: the turn-tail chain entry wins at priority
 * -100, artifact opens route through the read remote into the bound store
 * actions, and disposing the fiber detaches the contributions. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { ArtifactRow } from '../src/client/ArtifactRow.tsx'
import { ArtifactPanel } from '../src/client/ArtifactPanel.tsx'
import { artifactTabKey, createArtifactPanelStore, type ArtifactTab } from '../src/client/artifact-store.ts'

// Node has no object URLs; the browser-only branch under test needs one.
const createObjectURL = URL.createObjectURL
const revokeObjectURL = URL.revokeObjectURL
URL.createObjectURL = () => `blob:${crypto.randomUUID()}`
URL.revokeObjectURL = () => {}
afterEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
})

/** One read result the fake remote answers with. */
type ReadReply =
  | { ok: true, value: { kind: 'text', text: string, byteSize: number } }
  | { ok: true, value: { kind: 'bytes', mediaType: string, data: string, byteSize: number } }
  | { ok: false, error: { code: string, message: string } }

/** The slot declarations ui-chat and ui-layout own in the real shell. */
function declare(slots: SlotRegistry): void {
  void slots.register(
    {
      name: 'root',
      children: {
        'conversation.chat.turnTail': { kind: 'chain', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
}

/** A sessions + remote bench: the list snapshot carries the cwd; reads answer as configured. */
async function bench(read: (request: { sessionId: string, path: string, as: string }) => ReadReply) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ byId: { s1: { cwd: 'C:/work/proj' } } }) },
  } as never)
  const calls = { reads: [] as { sessionId: string, path: string, as: string }[], opens: [] as string[] }
  const sessionFace = {
    readWorkspaceFile: async (request: { sessionId: string, path: string, as: string }): Promise<ReadReply> => {
      calls.reads.push(request)
      return read(request)
    },
    openWorkspacePath: async (request: { path: string }) => {
      calls.opens.push(request.path)
      return { ok: true as const, value: { opened: true as const } }
    },
  }
  ctx.provide('remote', { $host: { isLoopback: true }, session: sessionFace } as never)
  ctx.provide('remote.session', sessionFace as never)
  const slots = ctx.get('slots') as SlotRegistry
  declare(slots)
  /** Load the plugin and return its disposable fiber. */
  const load = async () => await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, slots, calls, load }
}

const TEXT_EMPTY: ReadReply = { ok: true, value: { kind: 'text', text: '', byteSize: 0 } }

/** The registered row entry, or undefined. */
function rowEntry(slots: SlotRegistry) {
  return slots.entries('conversation.chat.turnTail').find(e => e.component === ArtifactRow)
}

/** The registered panel entry, or undefined. */
function panelEntry(slots: SlotRegistry) {
  return slots.entries('shell.overlay').find(e => e.component === ArtifactPanel)
}

/** Bind the panel's store instance the way the renderer would, sealing the shared actions. */
function bindPanel(slots: SlotRegistry) {
  const panel = panelEntry(slots)!
  const instance = (panel.store as ReturnType<typeof createArtifactPanelStore>).create()
  const injectFace = panel.inject as unknown as (actions: typeof instance.actions) => Record<string, unknown>
  const face = injectFace(instance.actions)
  return { instance, face }
}

/** The row's injected face (open write + thumbnail hook). */
function rowFace(slots: SlotRegistry) {
  const row = rowEntry(slots)!
  const inject = row.inject as unknown as () => {
    open: (sessionId: string, path: string) => void
    hooks: { thumbnails: { getSnapshot: () => Record<string, string> } }
  }
  return inject()
}

/** The turn owner the chain select sees: turn data keyed 'deliverables'. */
function ownerOf(paths: readonly string[]) {
  return {
    turn: {
      data: {
        get: (key: string) => key === 'deliverables'
          ? { produced: paths.map((path, index) => ({ seq: index, path })) }
          : undefined,
      },
    },
    seq: Number.POSITIVE_INFINITY,
  }
}

describe('ui-artifact-preview apply', () => {
  it('declares the services it needs', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'remote', 'remote.session'])
  })

  it('registers the row and panel and elects the row before the official chips', async () => {
    const b = await bench(() => TEXT_EMPTY)
    const fiber = await b.load()
    try {
      const row = rowEntry(b.slots)
      expect(row).toBeTruthy()
      expect(row?.options.priority).toBe(-100)
      expect(panelEntry(b.slots)).toBeTruthy()
      const select = row?.select as (owner: unknown) => unknown
      expect(select(ownerOf(['a.md', 'b.mp4']))).toMatchObject([
        { kind: 'video' }, { kind: 'markdown' },
      ])
      expect(select(ownerOf([]))).toBeNull()
      expect(select({ turn: { data: { get: () => undefined } }, seq: 1 })).toBeNull()
    } finally {
      await fiber.dispose()
    }
  })

  it('opens a tab, resolves the session cwd, reads once, and settles the store', async () => {
    const b = await bench(() => ({ ok: true, value: { kind: 'text', text: '# hi', byteSize: 4 } }))
    const fiber = await b.load()
    try {
      const bound = bindPanel(b.slots)
      const face = rowFace(b.slots)
      face.open('s1', 'docs/a.md')
      expect(b.calls.reads).toEqual([{ sessionId: 's1', path: 'C:/work/proj/docs/a.md', as: 'text' }])
      await new Promise(resolve => { setTimeout(resolve, 0) })
      const snap = bound.instance.getSnapshot()
      expect(snap.tabs).toHaveLength(1)
      expect(snap.activeKey).toBe(artifactTabKey('s1' as never, 'C:/work/proj/docs/a.md'))
      expect(snap.reads[artifactTabKey('s1' as never, 'C:/work/proj/docs/a.md')])
        .toMatchObject({ status: 'ready', text: '# hi' })
      // Same artifact again: focused, not re-read.
      face.open('s1', 'docs/a.md')
      expect(b.calls.reads).toHaveLength(1)
    } finally {
      await fiber.dispose()
    }
  })

  it('reads media as bytes and publishes the image thumbnail', async () => {
    const b = await bench(() =>
      ({ ok: true, value: { kind: 'bytes', mediaType: 'image/png', data: 'AQL6', byteSize: 3 } }))
    const fiber = await b.load()
    try {
      bindPanel(b.slots)
      const face = rowFace(b.slots)
      face.open('s1', 'shot.png')
      expect(b.calls.reads).toEqual([{ sessionId: 's1', path: 'C:/work/proj/shot.png', as: 'bytes' }])
      await new Promise(resolve => { setTimeout(resolve, 0) })
      expect(Object.keys(face.hooks.thumbnails.getSnapshot()))
        .toEqual([artifactTabKey('s1' as never, 'C:/work/proj/shot.png')])
    } finally {
      await fiber.dispose()
    }
  })

  it('settles read failures into the error read state', async () => {
    const b = await bench(() => ({ ok: false, error: { code: 'workspace/not-found', message: 'ENOENT' } }))
    const fiber = await b.load()
    try {
      const bound = bindPanel(b.slots)
      const face = rowFace(b.slots)
      face.open('s1', 'gone.md')
      await new Promise(resolve => { setTimeout(resolve, 0) })
      expect(bound.instance.getSnapshot().reads[artifactTabKey('s1' as never, 'C:/work/proj/gone.md')])
        .toMatchObject({ status: 'error', code: 'workspace/not-found' })
    } finally {
      await fiber.dispose()
    }
  })

  it('never reads binary artifacts and settles their fallback directly', async () => {
    const b = await bench(() => TEXT_EMPTY)
    const fiber = await b.load()
    try {
      const bound = bindPanel(b.slots)
      const face = rowFace(b.slots)
      face.open('s1', 'model.ckpt')
      expect(b.calls.reads).toEqual([])
      expect(bound.instance.getSnapshot().reads[artifactTabKey('s1' as never, 'C:/work/proj/model.ckpt')])
        .toMatchObject({ status: 'fallback' })
    } finally {
      await fiber.dispose()
    }
  })

  it('hands external opens to the session opener with the folder form', async () => {
    const b = await bench(() => TEXT_EMPTY)
    const fiber = await b.load()
    try {
      const { face } = bindPanel(b.slots)
      const tab: ArtifactTab = { sessionId: 's1' as never, path: 'C:/work/proj/x.md', name: 'x.md', kind: 'markdown' }
      const panelFace = face as unknown as {
        openExternal: (tab: ArtifactTab) => void
        locateFolder: (tab: ArtifactTab) => void
        copyPath: (path: string) => void
      }
      panelFace.openExternal(tab)
      panelFace.locateFolder(tab)
      panelFace.copyPath('C:/work/proj/x.md')
      expect(b.calls.opens).toEqual(['C:/work/proj/x.md', 'C:/work/proj'])
    } finally {
      await fiber.dispose()
    }
  })

  it('leaves no registrations after dispose', async () => {
    const b = await bench(() => TEXT_EMPTY)
    const fiber = await b.load()
    await fiber.dispose()
    expect(rowEntry(b.slots)).toBeUndefined()
    expect(panelEntry(b.slots)).toBeUndefined()
  })
})
