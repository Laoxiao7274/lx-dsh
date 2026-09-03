// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { GeneralSectionComponentProps } from '../src/client/GeneralSection.tsx'
import { GeneralSection } from '../src/client/GeneralSection.tsx'
import { CloseLabel, HeaderContent, TriggerContent } from '../src/client/chrome.tsx'
import type { TriggerContentProps } from '../src/client/chrome.tsx'
import { SettingsDocumentAction } from '../src/client/SettingsDocumentAction.tsx'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { SettingsDocumentStore } from '../src/client/settings-document-store.ts'
import { RemoteAccessRow } from '../src/client/RemoteAccessRow.tsx'
import { RemoteAccessStore } from '../src/client/remote-access-store.ts'

/** Store over a real mirror derived from the same scripted context. */
function derivedDocumentStore(remote: object) {
  const ctx = { remote } as never
  return new SettingsDocumentStore(ctx, new SettingsDescribeMirror(ctx))
}
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

// The seat's key domain is settings ∪ common; the stub answers from the
// package dictionary and falls back to the key like the real chain.
const t: TriggerContentProps['t'] = key => (en as Record<string, string>)[key] ?? key

// Global standard kit stubs: none of these components consume the hooks.
const unusedHook = (() => { throw new Error('unused by settings-general components') }) as never
type AttentionSnapshot = Parameters<Parameters<TriggerContentProps['useSessionPendingInteraction']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionPendingInteraction: TriggerContentProps['useSessionPendingInteraction'] = selector => selector(noAttention)
const kit = { useSessions: unusedHook, useSessionPendingInteraction, useWorkspaces: unusedHook }

describe('chrome content', () => {
  it('TriggerContent renders the icon with the label in the wide column', () => {
    const { container } = render(<TriggerContent {...kit} wide t={t} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('TriggerContent drops the label in the rail state', () => {
    const { container } = render(<TriggerContent {...kit} wide={false} t={t} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('HeaderContent and CloseLabel render their translated text', () => {
    render(<HeaderContent {...kit} t={t} />)
    render(<CloseLabel {...kit} t={t} />)
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('Close')).toBeTruthy()
  })
})

describe('GeneralSection', () => {
  function mount() {
    const renderSlot = vi.fn(
      ((key: string) => <div data-testid={`slot-${key}`} />) as GeneralSectionComponentProps['renderSlot'],
    )
    const props: GeneralSectionComponentProps = { ...kit, renderSlot, close: vi.fn() }
    const view = render(<GeneralSection {...props} />)
    return { view, renderSlot }
  }

  it('renders the item slot as the section body', () => {
    const { renderSlot } = mount()
    expect(renderSlot).toHaveBeenCalledWith('settings.general.item', {})
    expect(screen.getByTestId('slot-settings.general.item')).toBeTruthy()
  })
})

describe('SettingsDocumentAction', () => {
  it('appears only for a file-backed provider and requests its Host-owned document', async () => {
    const openDocument = vi.fn(() => Promise.resolve({
      ok: true as const, value: { opened: true as const },
    }))
    const controller = derivedDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          ok: true as const,
          value: { writable: true, hasDocument: true, namespaces: [] },
        })),
        openSettingsDocument: openDocument,
      },
    })
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    const action = await screen.findByRole('button', { name: 'Open configuration file' })
    fireEvent.click(action)
    await waitFor(() => { expect(openDocument).toHaveBeenCalledWith() })
  })

  it('stays absent without a document and follows a mirror refresh to available', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: { writable: true, hasDocument: false, namespaces: [] } })
      .mockResolvedValueOnce({ ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } })
    const ctx = { remote: { settings: { describe, openSettingsDocument: vi.fn() } } } as never
    const mirror = new SettingsDescribeMirror(ctx)
    const controller = new SettingsDocumentStore(ctx, mirror)
    const first = render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(screen.queryByRole('button', { name: 'Open configuration file' })).toBeNull()
    first.unmount()
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    // A remount alone re-reads nothing; availability moves with the mirror's
    // own refresh (a document commit or reconnect in production).
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(describe).toHaveBeenCalledTimes(1)
    await mirror.load()
    expect(await screen.findByRole('button', { name: 'Open configuration file' })).toBeTruthy()
    expect(describe).toHaveBeenCalledTimes(2)
  })

  it('keeps the action available and reports a native-open failure', async () => {
    const controller = derivedDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          ok: true as const,
          value: { writable: true, hasDocument: true, namespaces: [] },
        })),
        openSettingsDocument: vi.fn(() => Promise.resolve({
          ok: false as const,
          error: new RemoteError('gateway/internal', 'xdg-open missing', {}),
        })),
      },
    })
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open configuration file' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open configuration file')
    expect(screen.getByRole('button', { name: 'Open configuration file' })).toBeTruthy()
  })
})

describe('RemoteAccessRow', () => {
  /** Scripted store over the same remote-shape context the apply world builds. */
  function accessStore(connectionInfo: () => Promise<unknown>): RemoteAccessStore {
    return new RemoteAccessStore({ remote: { settings: { connectionInfo } } } as never)
  }

  function mount(store: RemoteAccessStore) {
    render(<RemoteAccessRow
      {...kit}
      t={t}
      useRemoteAccess={bindSnapshotSelector(store.store)}
      toggleRemoteAccess={() => { store.toggle() }}
    />)
  }

  const FACTS = {
    ok: true as const,
    value: {
      url: 'http://127.0.0.1:3080',
      token: 'secret',
      lanAddresses: ['192.168.1.5'],
      loopbackOnly: false,
    },
  }

  it('hides the facts until the switch reveals them, loading on first reveal', async () => {
    let resolveFacts: (value: unknown) => void = () => {}
    const connectionInfo = vi.fn(() => new Promise<unknown>(resolve => { resolveFacts = resolve }))
    const store = accessStore(connectionInfo)
    mount(store)
    expect(screen.queryByText(/http:\/\/127/)).toBeNull()

    fireEvent.click(screen.getByRole('switch'))
    expect(connectionInfo).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Reading connection info…')).toBeTruthy()
    resolveFacts(FACTS)
    expect(await screen.findByText('http://127.0.0.1:3080')).toBeTruthy()
    expect(screen.getByText('secret')).toBeTruthy()
    expect(screen.getByText('http://192.168.1.5/')).toBeTruthy()
    // A collapse does not re-read; the next reveal reuses the loaded facts.
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByText(/http:\/\/127/)).toBeNull()
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByText('http://127.0.0.1:3080')).toBeTruthy()
    expect(connectionInfo).toHaveBeenCalledTimes(1)
  })

  it('surfaces the loopback posture and a failed read', async () => {
    const loopback = accessStore(() => Promise.resolve({
      ok: true as const,
      value: { url: 'http://127.0.0.1:3080', token: 'secret', lanAddresses: [], loopbackOnly: true },
    }))
    mount(loopback)
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByText(/listens on the loopback interface only/)).toBeTruthy()
    cleanup()

    const failed = accessStore(() => Promise.resolve({
      ok: false as const,
      error: new RemoteError('gateway/internal', 'offline', {}),
    }))
    mount(failed)
    fireEvent.click(screen.getByRole('switch'))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
