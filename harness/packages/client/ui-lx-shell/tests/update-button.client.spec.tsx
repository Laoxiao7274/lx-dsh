// @vitest-environment jsdom
/** LxUpdateButton: the brand-row green pill, its dialog, and the install write. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { LxUpdateButton, type LxUpdateButtonProps } from '../src/client/LxUpdateButton.tsx'
import { en, type LxShellKey } from '../src/client/locales.ts'
import { createUpdaterRowStore, type LxUpdateStatus } from '../src/client/store.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

const statusOf = (over: Partial<LxUpdateStatus>): LxUpdateStatus => ({
  checking: false, available: false, version: null, progress: null, error: null,
  notes: null, currentVersion: '0.2.1', ...over,
})

function mount(status: LxUpdateStatus | null, progress: number | null = null, downloaded: string | null = null) {
  const store = createUpdaterRowStore().create()
  if (status !== null) store.actions.sync(status)
  if (progress !== null) store.actions.progress(progress)
  if (downloaded !== null) store.actions.downloaded(downloaded)
  const install = vi.fn()
  const props = {
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
    install,
  } as unknown as LxUpdateButtonProps
  render(<LxUpdateButton {...props} />)
  return { install }
}

describe('LxUpdateButton', () => {
  it('renders nothing while the updater reports no update', () => {
    mount(statusOf({ available: false }))
    expect(document.querySelector('button')).toBeNull()
  })

  it('shows the pill when a version is available and opens the dialog', () => {
    mount(statusOf({ available: true, version: '9.9.9', notes: '• fixed things' }))
    const pill = screen.getByRole('button', { name: en['dialog.title'] })
    expect(pill.textContent).toBe(en['brand.update'])
    fireEvent.click(pill)
    // Version rows and the changelog render from the synced status.
    expect(screen.getByText(en['dialog.currentVersion'])).toBeTruthy()
    expect(screen.getByText('0.2.1')).toBeTruthy()
    expect(screen.getByText('9.9.9')).toBeTruthy()
    expect(screen.getByText('• fixed things')).toBeTruthy()
    expect(screen.getByText(en['dialog.later'])).toBeTruthy()
  })

  it('shows the percent while downloading', () => {
    mount(statusOf({ available: true, version: '9.9.9' }), 42)
    expect(screen.getByRole('button', { name: en['dialog.title'] }).textContent).toBe('42%')
  })

  it('the staged pill applies the update and still opens the dialog', () => {
    const { install } = mount(statusOf({ available: true, version: '9.9.9' }), null, '9.9.9')
    fireEvent.click(screen.getByRole('button', { name: en['updater.installNow'] }))
    expect(install).toHaveBeenCalledOnce()
    expect(screen.getByText(en['dialog.newVersion'])).toBeTruthy()
  })
})
