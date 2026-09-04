// @vitest-environment jsdom
/** ArtifactPanel: tab strip, body routing by kind, states, and status line. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ArtifactPanel, type ArtifactPanelProps } from '../src/client/ArtifactPanel.tsx'
import {
  artifactTabKey, createArtifactPanelStore, type ArtifactPanelState, type ArtifactTab,
} from '../src/client/artifact-store.ts'
import { en, type ArtifactPreviewKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<ArtifactPreviewKey, string> = en

type StoreInstance = ReturnType<ReturnType<typeof createArtifactPanelStore>['create']>

const TAB_MD: ArtifactTab = { sessionId: 's1' as never, path: '/w/a.md', name: 'a.md', kind: 'markdown' }
const TAB_CODE: ArtifactTab = { sessionId: 's1' as never, path: '/w/b.ts', name: 'b.ts', kind: 'code' }
const TAB_CSV: ArtifactTab = { sessionId: 's1' as never, path: '/w/c.csv', name: 'c.csv', kind: 'csv' }
const TAB_JSON: ArtifactTab = { sessionId: 's1' as never, path: '/w/d.json', name: 'd.json', kind: 'json' }
const TAB_IMG: ArtifactTab = { sessionId: 's1' as never, path: '/w/e.png', name: 'e.png', kind: 'image' }
const TAB_VIDEO: ArtifactTab = { sessionId: 's1' as never, path: '/w/f.mp4', name: 'f.mp4', kind: 'video' }
const TAB_AUDIO: ArtifactTab = { sessionId: 's1' as never, path: '/w/g.mp3', name: 'g.mp3', kind: 'audio' }
const TAB_WEB: ArtifactTab = { sessionId: 's1' as never, path: '/w/h.html', name: 'h.html', kind: 'web' }
const TAB_BIN: ArtifactTab = { sessionId: 's1' as never, path: '/w/i.ckpt', name: 'i.ckpt', kind: 'binary' }

function mountPanel(
  store: StoreInstance,
  injected: Partial<Pick<ArtifactPanelProps,
    'reload' | 'openExternal' | 'copyPath' | 'locateFolder' | 'markdownLabels'>> = {},
) {
  const props = {
    reload: vi.fn(),
    openExternal: vi.fn(),
    copyPath: vi.fn(),
    locateFolder: vi.fn(),
    markdownLabels: (t: (key: string) => string) => ({ code: { copyLabel: t('view.copy'), copiedLabel: t('view.copied') }, footnotes: t('view.footnotes') }),
    ...injected,
    useStore: (selector: (s: ArtifactPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => COPY[key as ArtifactPreviewKey] ?? key,
  } as unknown as ArtifactPanelProps
  render(<ArtifactPanel {...props} />)
}

describe('ArtifactPanel', () => {
  it('renders nothing while closed', () => {
    const store = createArtifactPanelStore().create()
    const { container } = render(
      <ArtifactPanel
        {...{
          useStore: (selector: (s: ArtifactPanelState) => unknown) => selector(store.getSnapshot()),
          actions: store.actions,
          t: (key: string) => COPY[key as ArtifactPreviewKey] ?? key,
          reload: vi.fn(), openExternal: vi.fn(), copyPath: vi.fn(), locateFolder: vi.fn(),
          markdownLabels: (t: (key: string) => string) => ({ code: { copyLabel: t('view.copy'), copiedLabel: t('view.copied') }, footnotes: t('view.footnotes') }),
        } as unknown as ArtifactPanelProps}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the empty state with the panel open and no tabs', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_MD)
    store.actions.closeTab(artifactTabKey(TAB_MD.sessionId, TAB_MD.path))
    mountPanel(store)
    expect(screen.getByText(en['state.empty.title'])).toBeTruthy()
  })

  it('renders the tab strip with the active tab marked', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_MD)
    store.actions.openTab(TAB_CODE)
    mountPanel(store)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent).join(' ')).toContain('a.md')
    const active = tabs.find(tab => tab.getAttribute('aria-selected') === 'true')
    expect(active?.textContent).toContain('b.ts')
  })

  it('closes a tab through the close button and focuses the neighbor', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_MD)
    store.actions.openTab(TAB_CODE)
    mountPanel(store)
    const codeTab = screen.getAllByRole('tab').find(tab => tab.textContent?.includes('b.ts'))
    fireEvent.click(codeTab?.querySelector('button') as HTMLButtonElement)
    const snap = store.getSnapshot()
    expect(snap.tabs).toHaveLength(1)
    expect(snap.activeKey).toBe(artifactTabKey(TAB_MD.sessionId, TAB_MD.path))
  })

  it('routes markdown text through the markdown view', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_MD)
    store.actions.setRead(artifactTabKey(TAB_MD.sessionId, TAB_MD.path), {
      status: 'ready', text: '# Title\n\nbody', byteSize: 12,
    })
    mountPanel(store)
    expect(document.body.textContent).toContain('body')
  })

  it('routes csv text into a table and json through the code view', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_CSV)
    store.actions.setRead(artifactTabKey(TAB_CSV.sessionId, TAB_CSV.path), {
      status: 'ready', text: 'h1,h2\n1,2', byteSize: 8,
    })
    mountPanel(store)
    expect(screen.getByRole('table').textContent).toContain('h1')
    cleanup()
    const other = createArtifactPanelStore().create()
    other.actions.openTab(TAB_JSON)
    other.actions.setRead(artifactTabKey(TAB_JSON.sessionId, TAB_JSON.path), {
      status: 'ready', text: '{"a":1}', byteSize: 7,
    })
    mountPanel(other)
    expect(document.querySelector('pre')?.textContent).toContain('"a": 1')
  })

  it('routes media reads into native elements on the dark stage', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_IMG)
    store.actions.setRead(artifactTabKey(TAB_IMG.sessionId, TAB_IMG.path), {
      status: 'ready', url: 'blob:img', byteSize: 3,
    })
    mountPanel(store)
    expect((screen.getByRole('img') as HTMLImageElement).src).toBe('blob:img')
    cleanup()
    const other = createArtifactPanelStore().create()
    other.actions.openTab(TAB_VIDEO)
    other.actions.setRead(artifactTabKey(TAB_VIDEO.sessionId, TAB_VIDEO.path), {
      status: 'ready', url: 'blob:vid', byteSize: 4,
    })
    mountPanel(other)
    expect(document.querySelector('video')?.getAttribute('src')).toBe('blob:vid')
    cleanup()
    const third = createArtifactPanelStore().create()
    third.actions.openTab(TAB_AUDIO)
    third.actions.setRead(artifactTabKey(TAB_AUDIO.sessionId, TAB_AUDIO.path), {
      status: 'ready', url: 'blob:aud', byteSize: 5,
    })
    mountPanel(third)
    expect(document.querySelector('audio')?.getAttribute('src')).toBe('blob:aud')
  })

  it('renders web reads into a sandboxed iframe', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_WEB)
    store.actions.setRead(artifactTabKey(TAB_WEB.sessionId, TAB_WEB.path), {
      status: 'ready', text: '<p>demo</p>', byteSize: 10,
    })
    mountPanel(store)
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toBe('<p>demo</p>')
  })

  it('shows the skeleton while loading and the error state after failure', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_MD)
    store.actions.setRead(artifactTabKey(TAB_MD.sessionId, TAB_MD.path), { status: 'loading' })
    const { container } = render(
      <ArtifactPanel
        {...{
          useStore: (selector: (s: ArtifactPanelState) => unknown) => selector(store.getSnapshot()),
          actions: store.actions,
          t: (key: string) => COPY[key as ArtifactPreviewKey] ?? key,
          reload: vi.fn(), openExternal: vi.fn(), copyPath: vi.fn(), locateFolder: vi.fn(),
          markdownLabels: (t: (key: string) => string) => ({ code: { copyLabel: t('view.copy'), copiedLabel: t('view.copied') }, footnotes: t('view.footnotes') }),
        } as unknown as ArtifactPanelProps}
      />,
    )
    expect(container.querySelector('[class*="skeleton"]')).toBeTruthy()
    cleanup()
    const failed = createArtifactPanelStore().create()
    failed.actions.openTab(TAB_MD)
    failed.actions.setRead(artifactTabKey(TAB_MD.sessionId, TAB_MD.path), {
      status: 'error', code: 'workspace/not-found', message: 'ENOENT',
    })
    mountPanel(failed)
    expect(screen.getByText(en['state.error.title'])).toBeTruthy()
    expect(screen.getByText('ENOENT')).toBeTruthy()
  })

  it('shows the too-large copy for the capped read error', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_VIDEO)
    store.actions.setRead(artifactTabKey(TAB_VIDEO.sessionId, TAB_VIDEO.path), {
      status: 'error', code: 'session/file-too-large', message: 'above cap',
    })
    mountPanel(store)
    expect(screen.getByText(en['state.tooLarge.title'])).toBeTruthy()
  })

  it('shows the binary fallback with the copy-path write', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_BIN)
    store.actions.setRead(artifactTabKey(TAB_BIN.sessionId, TAB_BIN.path), { status: 'fallback' })
    const { copyPath } = { copyPath: vi.fn() }
    mountPanel(store, { copyPath })
    expect(screen.getByText(en['state.binary.title'])).toBeTruthy()
    fireEvent.click(screen.getByText(en['state.binary.copyPath']))
    expect(copyPath).toHaveBeenCalledExactlyOnceWith('/w/i.ckpt')
  })

  it('wires the reload and external buttons to the focused tab', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_CODE)
    const reload = vi.fn()
    const openExternal = vi.fn()
    mountPanel(store, { reload, openExternal })
    fireEvent.click(screen.getByTitle(en['panel.reload']))
    expect(reload).toHaveBeenCalledExactlyOnceWith(TAB_CODE)
    fireEvent.click(screen.getByTitle(en['panel.external']))
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(TAB_CODE)
  })

  it('reports the ready status with the formatted byte size', () => {
    const store = createArtifactPanelStore().create()
    store.actions.openTab(TAB_IMG)
    store.actions.setRead(artifactTabKey(TAB_IMG.sessionId, TAB_IMG.path), {
      status: 'ready', url: 'blob:img', byteSize: 2048,
    })
    mountPanel(store)
    expect(screen.getByText(/2\.0 KiB/)).toBeTruthy()
  })
})
