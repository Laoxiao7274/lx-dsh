// @vitest-environment jsdom
/** LxTodosGroupRow: the first child of each workspace group — count + open. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxTodosGroupRow, type LxTodosGroupRowProps } from '../src/client/LxTodosGroupRow.tsx'
import { currentTodoWorkspace, totalOpenCount } from '../src/client/LxTodosEntry.tsx'
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
  owner: { workspaceId: string | undefined; title: string },
  open = vi.fn(),
) {
  const props = {
    ...owner,
    open,
    useStore: (selector: (s: TodoPanelState) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => COPY[key as LxShellKey] ?? key,
  } as unknown as LxTodosGroupRowProps
  render(<LxTodosGroupRow {...props} />)
}

describe('LxTodosGroupRow', () => {
  it('shows only its own group count, opening that bucket', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 1, w2: 2 })
    const open = vi.fn()
    mountRow(store, { workspaceId: 'w2', title: 'beta' }, open)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByText('1')).toBeNull()
    fireEvent.click(screen.getByRole('treeitem'))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number), bottom: expect.any(Number) }),
      { key: 'w2', title: 'beta' },
    )
  })

  it('renders no badge at zero', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 0 })
    mountRow(store, { workspaceId: 'w1', title: 'alpha' })
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByRole('treeitem').getAttribute('aria-selected')).toBeNull()
  })

  it('selects while its panel is open', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 1 })
    store.actions.open({ left: 0, top: 0, bottom: 0 }, 'w1', 'alpha')
    mountRow(store, { workspaceId: 'w1', title: 'alpha' })
    expect(screen.getByRole('treeitem').getAttribute('aria-selected')).toBe('true')
  })

  it('maps the ungrouped group to the default bucket', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ '': 3 })
    const open = vi.fn()
    mountRow(store, { workspaceId: undefined, title: 'ungrouped' }, open)
    expect(screen.getByText('3')).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem'))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { key: '', title: 'ungrouped' },
    )
  })
})

describe('currentTodoWorkspace (shared derivation)', () => {
  it('finds the owning workspace and falls back to the default bucket', () => {
    expect(currentTodoWorkspace({ current: 's2' }, WORKSPACES)).toEqual({ key: 'w2', title: 'beta' })
    expect(currentTodoWorkspace({ current: 'sX' }, WORKSPACES)).toEqual({ key: '', title: undefined })
    expect(currentTodoWorkspace({ current: 's4' }, WORKSPACES)).toEqual({ key: '', title: undefined })
    expect(currentTodoWorkspace({ current: undefined }, [])).toEqual({ key: '', title: undefined })
  })
})

describe('totalOpenCount', () => {
  it('sums across buckets', () => {
    expect(totalOpenCount({})).toBe(0)
    expect(totalOpenCount({ a: 2, b: 3 })).toBe(5)
  })
})
