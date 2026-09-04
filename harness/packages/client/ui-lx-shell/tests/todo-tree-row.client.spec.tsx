// @vitest-environment jsdom
/** LxTodosTreeRow: the leading workspace-tree row — badge count, open anchor. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxTodosTreeRow, type LxTodosTreeRowProps } from '../src/client/LxTodosTreeRow.tsx'
import { createTodoPanelStore, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

function mountRow(store: ReturnType<ReturnType<typeof createTodoPanelStore>['create']>, open = vi.fn()) {
  const props = {
    open,
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxTodosTreeRowProps
  render(<LxTodosTreeRow {...props} />)
  return { open }
}

describe('LxTodosTreeRow', () => {
  it('renders as a treeitem titled 待办 with no badge while empty', () => {
    const store = createTodoPanelStore().create()
    mountRow(store)
    const row = screen.getByRole('treeitem')
    expect(row.textContent).toContain(en['todo.title'])
    expect(screen.queryByText('1')).toBeNull()
  })

  it('shows the open count badge', () => {
    const store = createTodoPanelStore().create()
    store.actions.setItems([
      { id: 'a', text: 'one', done: false, createdAt: 1 },
      { id: 'b', text: 'two', done: true, createdAt: 2, doneAt: 3 },
    ])
    mountRow(store)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('hands its rectangle to the open write', () => {
    const store = createTodoPanelStore().create()
    const open = vi.fn()
    mountRow(store, open)
    fireEvent.click(screen.getByRole('treeitem'))
    expect(open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      left: expect.any(Number),
      top: expect.any(Number),
      bottom: expect.any(Number),
    }))
  })
})
