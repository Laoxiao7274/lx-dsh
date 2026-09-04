// @vitest-environment jsdom
/** LxTodosGroupBadge: the count pill after a workspace group header. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LxTodosGroupBadge, type LxTodosGroupBadgeProps } from '../src/client/LxTodosGroupBadge.tsx'
import { createTodoPanelStore, type TodoPanelState } from '../src/client/todo-store.ts'
import { en, type LxShellKey } from '../src/client/locales.ts'

afterEach(cleanup)

const COPY: Record<LxShellKey, string> = en

function mountBadge(
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
  } as unknown as LxTodosGroupBadgeProps
  render(<LxTodosGroupBadge {...props} />)
}

describe('LxTodosGroupBadge', () => {
  it('renders nothing at zero', () => {
    const store = createTodoPanelStore().create()
    const { container } = render(<div />)
    cleanup()
    mountBadge(store, { workspaceId: 'w1', title: 'alpha' })
    expect(screen.queryByRole('button')).toBeNull()
    void container
  })

  it('shows only its own group count and opens that bucket below itself', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ w1: 1, w2: 2 })
    const open = vi.fn()
    mountBadge(store, { workspaceId: 'w2', title: 'beta' }, open)
    expect(screen.getByText('2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number), bottom: expect.any(Number) }),
      { key: 'w2', title: 'beta' },
    )
  })

  it('caps at 99+ and maps the ungrouped group to the default bucket', () => {
    const store = createTodoPanelStore().create()
    store.actions.setCounts({ '': 120 })
    const open = vi.fn()
    mountBadge(store, { workspaceId: undefined, title: 'ungrouped' }, open)
    expect(screen.getByText('99+')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { key: '', title: 'ungrouped' },
    )
  })
})
