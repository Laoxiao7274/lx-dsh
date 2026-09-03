// @vitest-environment jsdom
/** LxUpdaterRow behavior: state-driven detail line, check/install buttons. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { LxUpdaterRow, type UpdaterRowComponentProps } from '../src/client/LxUpdaterRow.tsx'
import { en, type LxShellKey } from '../src/client/locales.ts'
import { createUpdaterRowStore, type LxUpdateStatus } from '../src/client/store.ts'

afterEach(cleanup)

// The row renders through the shipped English dictionary; the key union keeps
// the fixture honest without duplicating the dictionary here.
const COPY: Record<LxShellKey, string> = en

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

function mount(status: LxUpdateStatus | null = null, progress: number | null = null, downloaded: string | null = null) {
  const store = createUpdaterRowStore().create()
  if (status !== null) store.actions.sync(status)
  if (progress !== null) store.actions.progress(progress)
  if (downloaded !== null) store.actions.downloaded(downloaded)
  const check = vi.fn()
  const install = vi.fn()
  const props = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
    check,
    install,
  } as unknown as UpdaterRowComponentProps
  render(<LxUpdaterRow {...props} />)
  return { store, check, install }
}

const statusOf = (over: Partial<LxUpdateStatus>): LxUpdateStatus => ({
  checking: false, available: false, version: null, progress: null, error: null, ...over,
})

describe('LxUpdaterRow', () => {
  it('renders the title and a check button, no detail before the first sync', () => {
    mount()
    expect(screen.getByText('Updates')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDefined()
    expect(screen.queryByText('Up to date')).toBeNull()
  })

  it('click drives check; a synced up-to-date status shows the detail line', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(b.check).toHaveBeenCalledOnce()
    act(() => { b.store.actions.sync(statusOf({ available: false })) })
    expect(screen.getByText('Up to date')).toBeDefined()
  })

  it('checking status disables the button and relabels it', () => {
    mount(statusOf({ checking: true }))
    const button = screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('an available status names the version', () => {
    mount(statusOf({ available: true, version: '1.2.3' }))
    expect(screen.getByText('New version 1.2.3 available')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDefined()
  })

  it('a download progress overlay shows the percent', () => {
    mount(statusOf({ available: true, version: '1.2.3' }), 45)
    expect(screen.getByText('Downloading 45%')).toBeDefined()
  })

  it('a staged update swaps the check button for install-now', () => {
    const b = mount(statusOf({ available: true, version: '1.2.3' }), null, '1.2.3')
    expect(screen.getByText('Version 1.2.3 is ready; installs on restart')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Install now' }))
    expect(b.install).toHaveBeenCalledOnce()
  })

  it('a failure names the message and keeps the check button', () => {
    mount(statusOf({ error: 'network down' }))
    expect(screen.getByText('Check failed: network down')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDefined()
  })
})
