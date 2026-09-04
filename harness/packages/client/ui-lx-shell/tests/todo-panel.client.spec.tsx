// @vitest-environment jsdom
/** LxTodosPanel: the anchored popover — add, toggle, remove, close. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxTodosPanel, type LxTodosPanelProps } from '../src/client/LxTodosPanel.tsx'
import { createTodoPanelStore, type TodoItem, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

type StoreInstance = ReturnType<ReturnType<typeof createTodoPanelStore>['create']>

function mountPanel(
  store: StoreInstance,
  injected: Partial<Pick<LxTodosPanelProps, 'add' | 'remove' | 'toggle' | 'close'>> = {},
) {
  const props = {
    ...{
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
    },
    ...injected,
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxTodosPanelProps
  render(<LxTodosPanel {...props} />)
  return props as unknown as { add: (t: string) => void; remove: (id: string) => void; toggle: (id: string) => void; close: () => void }
}

const ITEMS: readonly TodoItem[] = [
  { id: 'a', text: '买牛奶', done: false, createdAt: 1 },
  { id: 'b', text: '交报告', done: true, createdAt: 2, doneAt: 3 },
]

describe('LxTodosPanel', () => {
  it('renders nothing while closed', () => {
    const store = createTodoPanelStore().create()
    const props = {
      add: vi.fn(), remove: vi.fn(), toggle: vi.fn(), close: vi.fn(),
      useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
      actions: store.actions,
      t: (key: string) => COPY[key as LxShellKey] ?? key,
    } as unknown as LxTodosPanelProps
    const { container } = render(<LxTodosPanel {...props} />)
    expect(container.firstChild).toBeNull()
  })

  it('anchors to the store-carried rectangle and titles the workspace', () => {
    const store = createTodoPanelStore().create()
    store.actions.open({ left: 120, top: 40, bottom: 74 }, 'w1', 'myt-agent')
    mountPanel(store)
    const dialog = screen.getByRole('dialog') as HTMLElement
    expect(dialog.style.left).toBe('120px')
    expect(dialog.style.top).toBe('40px')
    expect(dialog.textContent).toContain('myt-agent')
  })

  it('shows the empty hint when the list is empty', () => {
    const store = createTodoPanelStore().create()
    store.actions.open({ left: 0, top: 0, bottom: 0 }, '', undefined)
    mountPanel(store)
    expect(screen.getByText(en['todo.empty'])).toBeTruthy()
  })

  it('sends a typed line on Enter and clears the draft', () => {
    const store = createTodoPanelStore().create()
    store.actions.open({ left: 0, top: 0, bottom: 0 }, '', undefined)
    const { add } = mountPanel(store, { add: vi.fn() })
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '写周报' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(add).toHaveBeenCalledExactlyOnceWith('写周报')
    expect(input.value).toBe('')
  })

  it('blank Enter does not send', () => {
    const store = createTodoPanelStore().create()
    store.actions.open({ left: 0, top: 0, bottom: 0 }, '', undefined)
    const { add } = mountPanel(store, { add: vi.fn() })
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(add).not.toHaveBeenCalled()
  })

  it('renders open items before done ones and dispatches row actions', () => {
    const store = createTodoPanelStore().create()
    store.actions.open({ left: 0, top: 0, bottom: 0 }, '', undefined)
    store.actions.setItems(ITEMS)
    const { toggle, remove } = mountPanel(store, { toggle: vi.fn(), remove: vi.fn() })
    expect(screen.getByText('买牛奶')).toBeTruthy()
    expect(screen.getByText('交报告')).toBeTruthy()
    // Open row precedes the done row in DOM order.
    const rows = screen.getAllByRole('button', { name: en['todo.toggle'] })
    expect(rows).toHaveLength(2)
    const toggleRow = rows[0] as HTMLElement
    fireEvent.click(toggleRow)
    expect(toggle).toHaveBeenCalledExactlyOnceWith('a')
    const removeRow = screen.getAllByRole('button', { name: en['todo.remove'] })[1] as HTMLElement
    fireEvent.click(removeRow)
    expect(remove).toHaveBeenCalledExactlyOnceWith('b')
  })

  it('Escape and the backdrop close the panel', () => {
    const store = createTodoPanelStore().create()
    store.actions.open({ left: 0, top: 0, bottom: 0 }, '', undefined)
    const { close } = mountPanel(store, { close: vi.fn() })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(close).toHaveBeenCalledExactlyOnceWith()
    // Backdrop: the dialog's parent sibling layer catches outside clicks.
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement?.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(close).toHaveBeenCalledTimes(2)
  })
})
