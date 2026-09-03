/** Registration and bridge flow: surfaces present only under the shell bridge,
 * events feed the store through the bound actions, injected writes call the
 * bridge, and disposing the fiber detaches the subscriptions. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, SETTINGS_NS, type LxShellBridge, type UpdaterRowInjected } from '../src/client/index.ts'
import { LxUpdaterRow } from '../src/client/LxUpdaterRow.tsx'
import { createUpdaterRowStore, type LxUpdateStatus, type UpdaterRowState } from '../src/client/store.ts'
import { LxQuickButton } from '../src/client/LxQuickButton.tsx'
import { LxQuickDrawer } from '../src/client/LxQuickDrawer.tsx'

const STATUS: LxUpdateStatus = { checking: false, available: false, version: null, progress: null, error: null }

/** The slot declarations the settings shell, conversation header, sidebar, and layout own. */
function declare(slots: SlotRegistry): void {
  void slots.register(
    {
      name: 'root',
      children: {
        'settings.general.item': { kind: 'list', scope: 'root' },
        'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
}

/** Fake shell bridge: records subscriptions (with working unsubscribe) and the two write calls. */
function fakeBridge(initial: LxUpdateStatus = STATUS) {
  const subs = {
    status: [] as Array<(s: LxUpdateStatus) => void>,
    progress: [] as Array<(e: { percent: number }) => void>,
    downloaded: [] as Array<(e: { version: string }) => void>,
    error: [] as Array<(e: { message: string }) => void>,
  }
  const calls = { check: 0, install: 0, min: 0, max: 0, close: 0, plugins: 0 }
  const subscribe = <E>(list: E[], cb: E): (() => void) => {
    list.push(cb)
    return () => {
      const at = list.indexOf(cb)
      if (at >= 0) list.splice(at, 1)
    }
  }
  const updater: LxShellBridge['updater'] = {
    check: () => { calls.check++; return Promise.resolve(STATUS) },
    install: () => { calls.install++; return Promise.resolve(true) },
    status: () => Promise.resolve(initial),
    onStatus: cb => subscribe(subs.status, cb),
    onAvailable: () => () => {},
    onProgress: cb => subscribe(subs.progress, cb),
    onDownloaded: cb => subscribe(subs.downloaded, cb),
    onError: cb => subscribe(subs.error, cb),
  }
  const win = {
    min: () => { calls.min++ },
    max: () => { calls.max++ },
    close: () => { calls.close++ },
  }
  const bridge = { updater, win, plugins: { open: () => Promise.resolve({}) } } satisfies LxShellBridge
  return { bridge, subs, calls }
}

/** Install the global bridge handle; afterEach removes it. */
function withBridge(bridge: LxShellBridge): void {
  (globalThis as { lx?: unknown }).lx = bridge
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  // Minimal sessions/workspaces faces: the quick drawer's create/archive/
  // binding paths (a quick-session test never prompts, so binding stays unused).
  const calls = { created: [] as string[], archived: [] as string[] }
  ctx.provide('sessions', {
    create: async (opts: { agentPreset?: string }) => {
      const id = `quick-${calls.created.length + 1}` as never
      calls.created.push(opts.agentPreset ?? '')
      return id
    },
    binding: () => undefined,
  } as never)
  ctx.provide('workspaces', {
    archiveSession: async (id: string) => { calls.archived.push(id) },
  } as never)
  const slots = ctx.get('slots') as SlotRegistry
  declare(slots)
  return { ctx, slots, calls }
}

/** The registered row entry, or undefined. */
function rowEntry(slots: SlotRegistry) {
  return slots.entries('settings.general.item').find(e => e.component === LxUpdaterRow)
}

/**
 * Create the store instance the way the renderer would: the declared handle
 * creates the engine instance, and its actions seal the entry's inject face.
 * Events fired before this call hit the unbound arm and are dropped.
 */
function rowParts(slots: SlotRegistry) {
  const entry = rowEntry(slots)!
  const handle = entry.store as ReturnType<typeof createUpdaterRowStore>
  const instance = handle.create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => UpdaterRowInjected)(instance.actions)
  return { entry, instance: instance as { getSnapshot: () => UpdaterRowState }, face }
}

afterEach(() => {
  delete (globalThis as { lx?: unknown }).lx
})

describe('ui-lx-shell apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale'])
  })

  it('registers nothing when the shell bridge is absent', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(rowEntry(b.slots)).toBeUndefined()
  })

  it('registers the General row last (order 30) with its locale namespace', async () => {
    withBridge(fakeBridge().bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = rowEntry(b.slots)!
    expect(entry.options).toMatchObject({ id: 'lx-updater', order: 30 })
    expect(entry.locale).toBe(SETTINGS_NS)
    expect(entry.store).toBeDefined()
  })

  it('registers the quick-answers footer entry and drawer', async () => {
    withBridge(fakeBridge().bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const footer = b.slots.entries('sidebar.footer.action').find(e => e.component === LxQuickButton)
    expect(footer).toBeDefined()
    expect(footer!.options).toMatchObject({ id: 'lx-quick-answers' })
    const drawer = b.slots.entries('shell.overlay').find(e => e.component === LxQuickDrawer)
    expect(drawer).toBeDefined()
    expect(drawer!.options).toMatchObject({ id: 'lx-quick-drawer' })
  })

  it('expanding the quick entry creates the preset session', async () => {
    withBridge(fakeBridge().bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const footer = b.slots.entries('sidebar.footer.action').find(e => e.component === LxQuickButton)!
    const handle = footer.store as ReturnType<
      typeof import('../src/client/quick-store.ts').createQuickDrawerStore
    >
    const instance = handle.create()
    const face = footer.inject as unknown as (a: typeof instance.actions) => { toggle: (open: boolean) => void }
    const { toggle } = face(instance.actions)
    toggle(true)
    await vi.waitFor(() => {
      expect(b.calls.created).toEqual(['quick-answers'])
    })
  })

  it('inject-time status catch-up seals the init window', async () => {
    withBridge(fakeBridge({ ...STATUS, available: true, version: '2.0.0' }).bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const { instance } = rowParts(b.slots)
    await vi.waitFor(() => {
      expect(instance.getSnapshot().status?.version).toBe('2.0.0')
    })
  })

  it('registers the header chrome and both brand occupants', async () => {
    withBridge(fakeBridge().bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(1)
    expect(b.slots.entries('sidebar.brand.mark')).toHaveLength(1)
    expect(b.slots.entries('sidebar.brand.name')).toHaveLength(1)
    expect(b.slots.entries('conversation.hero.brand.mark')).toHaveLength(1)
    // The brand row's update pill carries the bridge-state mirror (a handle
    // mounts under one scope only); the chrome strip itself needs none.
    const brand = b.slots.entries('sidebar.brand.name')[0]!
    expect(brand.store).toBeDefined()
    expect(brand.store).not.toBe(rowEntry(b.slots)!.store)
    expect(brand.locale).toBe(SETTINGS_NS)
    const chrome = b.slots.entries('conversation.session.header.utilities')[0]!
    expect(chrome.store).toBeUndefined()
    expect(chrome.locale).toBe(SETTINGS_NS)
  })

  it('bridge events feed the store; downloaded clears the progress overlay', async () => {
    const { bridge, subs } = fakeBridge()
    withBridge(bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const { instance } = rowParts(b.slots)

    subs.status[0]!({ ...STATUS, checking: true })
    expect(instance.getSnapshot().status?.checking).toBe(true)

    subs.progress[0]!({ percent: 42 })
    expect(instance.getSnapshot().progress).toBe(42)

    subs.downloaded[0]!({ version: '9.9.9' })
    expect(instance.getSnapshot().downloaded).toBe('9.9.9')
    expect(instance.getSnapshot().progress).toBeNull()

    subs.error[0]!({ message: 'boom' })
    expect(instance.getSnapshot().status?.error).toBe('boom')
    expect(instance.getSnapshot().status?.checking).toBe(false)
  })

  it('injected check/install call the bridge and the check reply syncs', async () => {
    const { bridge, calls } = fakeBridge()
    withBridge(bridge)
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const { instance, face } = rowParts(b.slots)
    face.check()
    face.install()
    expect(calls.check).toBe(1)
    expect(calls.install).toBe(1)
    await vi.waitFor(() => {
      expect(instance.getSnapshot().status).toEqual(STATUS)
    })
  })

  it('disposing the plugin fiber detaches the bridge subscriptions', async () => {
    const { bridge, subs } = fakeBridge()
    withBridge(bridge)
    const b = await bench()
    const fiber = await b.ctx.plugin({ inject: [...inject], apply }).await()
    const { instance } = rowParts(b.slots)
    expect(subs.status).toHaveLength(1)
    await fiber.dispose()
    // The disposer ran: every bridge listener is detached, so later events
    // cannot reach the (withdrawn) row's store.
    expect(subs.status).toHaveLength(0)
    expect(subs.progress).toHaveLength(0)
    expect(instance.getSnapshot().status?.available).toBe(false)
  })
})
