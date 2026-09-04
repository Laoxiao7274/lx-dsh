// @vitest-environment jsdom
/** LxTodosTreeRow: expandable per-workspace todo lines — counts, open anchor. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  currentTodoWorkspace, LxTodosTreeRow, totalOpenCount, type LxTodosTreeRowProps,
} from '../src/client/LxTodosTreeRow.tsx'
import { createTodoPanelStore, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

const WORKSPACES = [
  { workspaceId: 'w1', sessionIds: ['s1'], title: 'alpha' },
  { workspaceId: 'w2', sessionIds: ['s2', 's3'], title: 'beta' },
  { workspaceId: undefined, sessionIds: ['s4'], title: 'ungrouped' },
]

function mountRow(
  store: ReturnType<ReturnType<typeof createTodoPanelStore>['create']>,
  options: { open?: ReturnType<typeof vi.fn>, current?: string } = {},
) {
  const props = {
    open: options.open ?? vi.fn(),
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    useSessions: (selector: (s: { current: string | undefined }) => unknown) => selector({ current: options.current }),
    useWorkspaces: (selector: (s: { items: typeof WORKSPACES }) => unknown) => selector({ items: WORKSPACES }),
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxTodosTreeRowProps
  render(<LxTodosTreeRow {...props} />)
}

describe('currentTodoWorkspace', () => {
  it('finds the workspace owning the current session', () => {
    const context = currentTodoWorkspace({ current: 's2' }, WORKSPACES)
    expect(context).toEqual({ key: 'w2', title: 'beta' })
  })

  it('falls back to the default bucket without a current session or owner', () => {
    expect(currentTodoWorkspace({ current: undefined }, [])).toEqual({ key: '', title: undefined })
    expect(currentTodoWorkspace({ current: 'sX' }, WORKSPACES)).toEqual({ key: '', title: undefined })
  })

  it('skips ungrouped buckets (no workspace id)', () => {
    const context = currentTodoWorkspace({ current: 's4' }, WORKSPACES)
    expect(context).toEqual({ key: '', title: undefined })
  })
})

describe('totalOpenCount', () => {
  it('sums across buckets', () => {
    expect(totalOpenCount({})).toBe(0)
    expect(totalOpenCount({ a: 2, b: 3 })).toBe(5)
  })
})

describe('LxTodosTreeRow', () => {
  it('badges only the current workspace count on the header', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 1, w2: 2 })
    mountRow(store, { current: 's2' })
    // beta (w2) is current → badge 2, not the sum 3.
    const header = screen.getByRole('treeitem', { name: /待办|Todos/ })
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByText('3')).toBeNull()
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('expands into one count line per workspace and opens that bucket', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 1, w2: 2 })
    const open = vi.fn()
    mountRow(store, { open, current: 's1' })
    fireEvent.click(screen.getByRole('treeitem', { name: /待办|Todos/ }))
    // One line per real workspace; the ungrouped bucket renders no line
    // while its count is 0.
    const lines = screen.getAllByRole('treeitem').filter(item => item.textContent?.match(/alpha|beta/))
    expect(lines).toHaveLength(2)
    // alpha's line opens bucket w1 even though beta's session is current.
    fireEvent.click(lines[0])
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ left: expect.any(Number) }),
      { key: 'w1', title: 'alpha' },
    )
  })

  it('renders the default bucket line only while it holds entries', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ '': 2, w1: 1 })
    const open = vi.fn()
    mountRow(store, { open, current: 's1' })
    fireEvent.click(screen.getByRole('treeitem', { name: /待办|Todos/ }))
    const ungrouped = screen.getAllByRole('treeitem').find(item => item.textContent?.includes('Ungrouped') || item.textContent?.includes('未分组'))
    expect(ungrouped).toBeTruthy()
    fireEvent.click(ungrouped as HTMLElement)
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ left: expect.any(Number) }),
      { key: '', title: undefined },
    )
  })
})
