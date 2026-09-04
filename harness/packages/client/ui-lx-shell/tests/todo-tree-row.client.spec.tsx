// @vitest-environment jsdom
/** LxTodosTreeRow: the leading workspace-tree row — badge, anchor, workspace. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  currentTodoWorkspace, LxTodosTreeRow, totalOpenCount, type LxTodosTreeRowProps,
} from '../src/client/LxTodosTreeRow.tsx'
import { createTodoPanelStore, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

function mountRow(store: ReturnType<ReturnType<typeof createTodoPanelStore>['create']>, open = vi.fn()) {
  const props = {
    open,
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    useSessions: (selector: (s: { current: string | undefined }) => unknown) => selector({ current: undefined }),
    useWorkspaces: (selector: (s: { items: unknown[] }) => unknown) => selector({ items: [] }),
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxTodosTreeRowProps
  render(<LxTodosTreeRow {...props} />)
  return { open }
}

describe('currentTodoWorkspace', () => {
  it('finds the workspace owning the current session', () => {
    const context = currentTodoWorkspace(
      { current: 's2' },
      [
        { workspaceId: 'w1', sessionIds: ['s1'], title: 'alpha' },
        { workspaceId: 'w2', sessionIds: ['s2', 's3'], title: 'beta' },
      ],
    )
    expect(context).toEqual({ key: 'w2', title: 'beta' })
  })

  it('falls back to the default bucket without a current session or owner', () => {
    expect(currentTodoWorkspace({ current: undefined }, [])).toEqual({ key: '', title: undefined })
    expect(currentTodoWorkspace({ current: 'sX' }, [
      { workspaceId: 'w1', sessionIds: ['s1'], title: 'alpha' },
    ])).toEqual({ key: '', title: undefined })
  })

  it('skips ungrouped buckets (no workspace id)', () => {
    const context = currentTodoWorkspace(
      { current: 's2' },
      [{ workspaceId: undefined, sessionIds: ['s1', 's2'], title: 'ungrouped' }],
    )
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
  it('renders as a treeitem titled 待办 with the summed badge', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 1, w2: 2 })
    mountRow(store)
    const row = screen.getByRole('treeitem')
    expect(row.textContent).toContain(en['todo.title'])
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('hands its rectangle and workspace context to the open write', () => {
    const store = createTodoPanelStore().create()
    const open = vi.fn()
    mountRow(store, open)
    fireEvent.click(screen.getByRole('treeitem'))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number), bottom: expect.any(Number) }),
      expect.objectContaining({ key: expect.any(String) }),
    )
  })
})
