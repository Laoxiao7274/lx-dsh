// @vitest-environment jsdom
/**
 * ClientSessions cross-window selection following: a storage event carrying
 * another same-origin window's persisted selection re-targets this client
 * through the same paths a user click takes; an unknown target stays pending
 * until its list row arrives, and nothing invalid ever reaches the manager.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { ClientSessions } from '../src/client/sessions/service.ts'
import {
  FakeApiClient,
  fakeRemote,
  ok,
  type RuntimeRemotes,
} from './fake-api.client.ts'

const sid = (s: string): SessionId => s as SessionId

interface Bench {
  ctx: Context
  api: FakeApiClient
  svc: ClientSessions
}

function bench(configureRemote?: (remote: RuntimeRemotes) => RuntimeRemotes): Bench {
  const ctx = new Context()
  const api = new FakeApiClient()
  const remote = fakeRemote(api)
  const svc = new ClientSessions(ctx, configureRemote?.(remote) ?? remote)
  return { ctx, api, svc }
}

/** Refresh the manager list from programmable rows and flush the microtask batch. */
async function feedList(b: Bench, rows: Array<{ id: string }>): Promise<void> {
  b.api.onList = () => Promise.resolve(ok({
    items: rows.map(r => ({
      sessionId: sid(r.id), updatedAt: 1, running: false, blank: false,
    })),
  }) as never)
  await b.svc.refresh()
  await Promise.resolve() // manager notifier flush
}

/** Deliver another window's persisted-selection write as a storage event. */
function persistFromOtherWindow(rawValue: string, key = 'dsh.sessions.current'): void {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: rawValue }))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cross-window selection following', () => {
  it('adopts another window\'s persisted selection for a listed session', async () => {
    const b = bench()
    await feedList(b, [{ id: 's1' }, { id: 's2' }])
    b.svc.open(sid('s1'))

    persistFromOtherWindow('{"sessionId":"s2"}')

    expect(b.svc.list.getSnapshot().current).toBe(sid('s2'))
  })

  it('ignores an event whose selection equals the current one', async () => {
    const b = bench()
    await feedList(b, [{ id: 's1' }, { id: 's2' }])
    b.svc.open(sid('s2'))
    const before = b.svc.list.getSnapshot()

    persistFromOtherWindow('{"sessionId":"s2"}')

    expect(b.svc.list.getSnapshot()).toBe(before)
  })

  it('keeps an unknown target pending until its row arrives, then opens it', async () => {
    const b = bench()
    await feedList(b, [{ id: 's1' }])
    b.svc.open(sid('s1'))

    persistFromOtherWindow('{"sessionId":"s-new"}')
    expect(b.svc.list.getSnapshot().current).toBe(sid('s1'))

    b.svc.handleSessionAdded({
      sessionId: sid('s-new'), updatedAt: 2, running: false, blank: false,
    })
    await Promise.resolve()

    expect(b.svc.list.getSnapshot().current).toBe(sid('s-new'))
  })

  it('adopts an empty selection as a clear', async () => {
    const b = bench()
    await feedList(b, [{ id: 's1' }])
    b.svc.open(sid('s1'))

    persistFromOtherWindow('{}')

    expect(b.svc.list.getSnapshot().current).toBeUndefined()
  })

  it('follows a catalog address once its parent catalog is healthy', async () => {
    const b = bench()
    b.api.onSubagentList = (payload) => {
      if (payload !== sid('root')) return Promise.resolve(ok({ entries: [], parentAvailable: false }))
      return Promise.resolve(ok({
        entries: [{
          kind: 'child', id: sid('child'), mode: 'continuable', label: 'Child',
          activity: 'inactive', hasChildren: false,
        }] as never[],
        parentAvailable: true,
      }))
    }
    await feedList(b, [{ id: 's1' }, { id: 'root' }])
    b.svc.open(sid('s1'))

    persistFromOtherWindow(
      '{"sessionId":"child","subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"continuable"}}',
    )

    await vi.waitFor(() => { expect(b.svc.list.getSnapshot().current).toBe(sid('child')) })
    expect(b.svc.list.getSnapshot().currentAddress).toEqual({
      parentSessionId: sid('root'), childSessionId: sid('child'), mode: 'continuable',
    })

    // Equal addressed selection: an echo, nothing to follow.
    persistFromOtherWindow(
      '{"sessionId":"child","subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"continuable"}}',
    )
    expect(b.svc.list.getSnapshot().current).toBe(sid('child'))

    // Same child, different mode: both sides carry an address, they differ,
    // and the catalog here rejects the mismatched one.
    persistFromOtherWindow(
      '{"sessionId":"child","subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"one-shot"}}',
    )
    expect(b.svc.list.getSnapshot().current).toBe(sid('child'))
    expect(b.svc.list.getSnapshot().currentAddress).toEqual({
      parentSessionId: sid('root'), childSessionId: sid('child'), mode: 'continuable',
    })
  })

  it('stays pending when the catalog disagrees with the persisted address', async () => {
    const b = bench()
    b.api.onSubagentList = (payload) => {
      if (payload !== sid('root')) return Promise.resolve(ok({ entries: [], parentAvailable: false }))
      return Promise.resolve(ok({
        entries: [{
          kind: 'child', id: sid('child'), mode: 'one-shot', label: 'Child',
          activity: 'inactive', hasChildren: false,
        }] as never[],
        parentAvailable: true,
      }))
    }
    await feedList(b, [{ id: 's1' }, { id: 'root' }])
    b.svc.open(sid('s1'))

    persistFromOtherWindow(
      '{"sessionId":"child","subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"continuable"}}',
    )

    // The catalog pull landed (the entry is here), but its mode rejects the
    // address: the follow stays pending and the stage never moves.
    await vi.waitFor(() => {
      expect(b.svc.list.getSnapshot().subagentsByParent[sid('root')]?.state).toBe('ready')
    })
    expect(b.svc.list.getSnapshot().current).toBe(sid('s1'))
  })

  it('ignores values this store could not have written', async () => {
    const b = bench()
    await feedList(b, [{ id: 's1' }, { id: 's2' }])
    b.svc.open(sid('s1'))

    persistFromOtherWindow('not json')
    persistFromOtherWindow('"plain string"')
    persistFromOtherWindow('null')
    persistFromOtherWindow('{"sessionId":5}')
    persistFromOtherWindow('{"bogus":1}')
    persistFromOtherWindow('{"sessionId":"s1","subagentAddress":"x"}')
    persistFromOtherWindow(
      '{"sessionId":"s1","subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"wrong"}}',
    )
    persistFromOtherWindow(
      '{"sessionId":"s1","subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"one-shot","extra":1}}',
    )
    persistFromOtherWindow(
      '{"subagentAddress":{"parentSessionId":"root","childSessionId":"child","mode":"one-shot"}}',
    )
    persistFromOtherWindow('{"sessionId":"s2"}', 'other.key')
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'dsh.sessions.current', newValue: null,
    }))

    expect(b.svc.list.getSnapshot().current).toBe(sid('s1'))
  })

  it('stops following after the owning fiber is disposed', async () => {
    const ctx = new Context()
    const api = new FakeApiClient()
    const remote = fakeRemote(api)
    api.onList = () => Promise.resolve(ok({
      items: [
        { sessionId: sid('s1'), updatedAt: 1, running: false, blank: false },
        { sessionId: sid('s2'), updatedAt: 1, running: false, blank: false },
      ],
    }) as never)
    let svc: ClientSessions | undefined
    // The service rides a child fiber, so disposing it unregisters the
    // storage listener without tearing down the harness root context.
    const fiber = ctx.plugin((pluginCtx) => {
      svc = new ClientSessions(pluginCtx, remote)
    })
    await fiber
    if (svc === undefined) throw new Error('fixture ClientSessions was not constructed')
    await svc.refresh()
    await Promise.resolve()
    svc.open(sid('s1'))

    await ctx.fiber.dispose()
    persistFromOtherWindow('{"sessionId":"s2"}')

    // The listener is gone; nothing observes the event anymore.
    expect(svc.list.getSnapshot().current).toBe(sid('s1'))
  })
})
