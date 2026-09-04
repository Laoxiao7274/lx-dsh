// @vitest-environment jsdom
/** LxTodosEntry: the sidebar-foot todos entry — badge count, open anchor. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxTodosEntry, type LxTodosEntryProps } from '../src/client/LxTodosEntry.tsx'
import { createTodoPanelStore, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

type StoreInstance = ReturnType<ReturnType<typeof createTodoPanelStore>['create']>

function mountEntry(store: StoreInstance, open = vi.fn()) {
  const props = {
    open,
    wide: true,
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxTodosEntryProps
  render(<LxTodosEntry {...props} />)
  return { open }
}

describe('LxTodosEntry', () => {
  it('shows no badge while nothing is open', () => {
    const store = createTodoPanelStore().create()
    mountEntry(store)
    expect(screen.queryByText('1')).toBeNull()
    expect(screen.getByRole('button', { name: en['todo.title'] })).toBeTruthy()
  })

  it('badges the open count and caps at 99+', () => {
    const store = createTodoPanelStore().create()
    store.actions.setItems([
      { id: 'a', text: 'one', done: false, createdAt: 1 },
      { id: 'b', text: 'two', done: true, createdAt: 2, doneAt: 3 },
      { id: 'c', text: 'three', done: false, createdAt: 4 },
    ])
    mountEntry(store)
    expect(screen.getByText('2')).toBeTruthy()

    // The stubbed useStore does not subscribe, so a second mount carries the
    // oversized list (open-count cap).
    const big = createTodoPanelStore().create()
    big.actions.setItems(Array.from({ length: 120 }, (_, i) => ({
      id: 'i' + String(i), text: 'x', done: false, createdAt: i,
    })))
    mountEntry(big)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('hands its rectangle to the open write', () => {
    const store = createTodoPanelStore().create()
    const open = vi.fn()
    mountEntry(store, open)
    fireEvent.click(screen.getByRole('button', { name: en['todo.title'] }))
    expect(open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      left: expect.any(Number),
      top: expect.any(Number),
      bottom: expect.any(Number),
    }))
  })
})
