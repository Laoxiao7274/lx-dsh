// @vitest-environment jsdom
/** LxTodosEntry: the sidebar-foot todos entry — badge count, open anchor. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxTodosEntry, type LxTodosEntryProps } from '../src/client/LxTodosEntry.tsx'
import { createTodoPanelStore, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

function mountEntry(store: ReturnType<ReturnType<typeof createTodoPanelStore>['create']>, open = vi.fn()) {
  const props = {
    open,
    wide: true,
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    useSessions: (selector: (s: { current: string | undefined }) => unknown) => selector({ current: undefined }),
    useWorkspaces: (selector: (s: { items: unknown[] }) => unknown) => selector({ items: [] }),
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

  it('badges the total open count across buckets and caps at 99+', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ a: 2, b: 1 })
    mountEntry(store)
    expect(screen.getByText('3')).toBeTruthy()

    const big = createTodoPanelStore().create()
    big.actions.setCounts({ a: 60, b: 60 })
    mountEntry(big)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('hands its rectangle and workspace context to the open write', () => {
    const store = createTodoPanelStore().create()
    const open = vi.fn()
    mountEntry(store, open)
    fireEvent.click(screen.getByRole('button', { name: en['todo.title'] }))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number), bottom: expect.any(Number) }),
      expect.objectContaining({ key: expect.any(String), title: undefined }),
    )
  })
})
