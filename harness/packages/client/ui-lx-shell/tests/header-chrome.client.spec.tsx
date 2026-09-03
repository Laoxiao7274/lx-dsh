// @vitest-environment jsdom
/** LxHeaderChrome: the open-in-editor split button, its dropdown, and cwd gating. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxHeaderChrome, type LxHeaderChromeProps, type LxEditorTarget } from '../src/client/LxHeaderChrome.tsx'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

interface SessionListLike {
  byId: Record<string, { cwd?: string }>
}

function mount(options: {
  cwd?: string
  sessionId?: string
  openEditor?: (cwd: string, target: LxEditorTarget) => void
}): { openEditor: ReturnType<typeof vi.fn>; plugins: ReturnType<typeof vi.fn> } {
  const list: SessionListLike = { byId: {} }
  if (options.sessionId !== undefined && options.cwd !== undefined) {
    list.byId[options.sessionId] = { cwd: options.cwd }
  }
  const openEditor = options.openEditor === undefined ? undefined : vi.fn(options.openEditor)
  const plugins = vi.fn()
  const props = {
    t: (key: string) => COPY[key as LxShellKey] ?? key,
    useSessions: (selector: (sessions: SessionListLike) => unknown) => selector(list),
    sessionId: options.sessionId,
    min: vi.fn(),
    max: vi.fn(),
    close: vi.fn(),
    openPlugins: plugins,
    ...(openEditor === undefined ? {} : { openEditor }),
  } as unknown as LxHeaderChromeProps
  render(<LxHeaderChrome {...props} />)
  return { openEditor: openEditor ?? vi.fn(), plugins }
}

describe('LxHeaderChrome', () => {
  it('opens the picker menu on click and shows the default target', () => {
    mount({ cwd: 'C:\\work\\repo', sessionId: 's1', openEditor: () => {} })
    const picker = screen.getByRole('button', { name: en['chrome.editorMenu'] })
    expect(picker.textContent).toContain(en['chrome.editor.vscode'])
    fireEvent.click(picker)
    const menu = screen.getByRole('menu')
    expect(menu.textContent).toContain(en['chrome.editor.vscode'])
    expect(menu.textContent).toContain(en['chrome.editor.cursor'])
    expect(menu.textContent).toContain(en['chrome.editor.explorer'])
  })

  it('dispatches the chosen target and shows it as the current choice', () => {
    const { openEditor } = mount({ cwd: 'C:\\work\\repo', sessionId: 's1', openEditor: () => {} })
    fireEvent.click(screen.getByRole('button', { name: en['chrome.editorMenu'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: en['chrome.editor.cursor'] }))
    expect(openEditor).toHaveBeenCalledExactlyOnceWith('C:\\work\\repo', 'cursor')
    expect(screen.queryByRole('menu')).toBeNull()
    // The picker label follows the last choice.
    expect(screen.getByRole('button', { name: en['chrome.editorMenu'] }).textContent)
      .toContain(en['chrome.editor.cursor'])
  })

  it('marks the current target in the reopened menu', () => {
    const { openEditor } = mount({ cwd: 'C:\\work\\repo', sessionId: 's1', openEditor: () => {} })
    fireEvent.click(screen.getByRole('button', { name: en['chrome.editorMenu'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: en['chrome.editor.explorer'] }))
    expect(openEditor).toHaveBeenCalledExactlyOnceWith('C:\\work\\repo', 'explorer')
    fireEvent.click(screen.getByRole('button', { name: en['chrome.editorMenu'] }))
    const selected = screen.getByRole('menuitem', { name: en['chrome.editor.explorer'] })
    expect(selected.closest('[class*="selected"]')).not.toBeNull()
  })

  it('closes the dropdown on Escape without dispatching', () => {
    const { openEditor } = mount({ cwd: 'C:\\work\\repo', sessionId: 's1', openEditor: () => {} })
    fireEvent.click(screen.getByRole('button', { name: en['chrome.editorMenu'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(openEditor).not.toHaveBeenCalled()
  })

  it('disables the picker when the session has no cwd', () => {
    const { openEditor } = mount({ sessionId: 's1', openEditor: () => {} })
    const picker = screen.getByRole('button', { name: en['chrome.editorMenu'] }) as HTMLButtonElement
    expect(picker.disabled).toBe(true)
    fireEvent.click(picker)
    expect(openEditor).not.toHaveBeenCalled()
  })

  it('hides the picker when the shell has no editor bridge', () => {
    mount({ cwd: 'C:\\work\\repo', sessionId: 's1' })
    expect(screen.queryByRole('button', { name: en['chrome.editorMenu'] })).toBeNull()
  })

  it('keeps the plugin and window controls alongside', () => {
    const { plugins } = mount({ cwd: 'C:\\work\\repo', sessionId: 's1', openEditor: () => {} })
    fireEvent.click(screen.getByRole('button', { name: en['chrome.plugins'] }))
    expect(plugins).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: en['chrome.minimize'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: en['chrome.maximize'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: en['chrome.close'] })).toBeTruthy()
  })
})
