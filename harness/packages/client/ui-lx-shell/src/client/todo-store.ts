/**
 * User-todos panel state: the open flag, the anchor rectangle captured from
 * the clicked entry, and the list mirrored from the shell's persisted store
 * (userData/todos.json via the `window.lx` bridge). The apply body owns the
 * bridge calls; this store carries only the render-facing mirror so the
 * panel stays a pure-props component.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** The clicked entry's viewport rectangle; the panel anchors to it. */
export interface TodoAnchor {
  readonly left: number
  readonly top: number
  readonly bottom: number
}

/** Render-facing user-todos panel state. */
export interface TodoPanelState {
  /** Whether the panel is open. */
  open: boolean
  /** The clicked entry's rectangle (the overlay panel anchors to it). */
  anchor: TodoAnchor
  /** The mirrored list, oldest first (the shell's canonical order). */
  items: readonly TodoItem[]
  /** Whether the initial load is still in flight. */
  loading: boolean
}

/** One user to-do entry as mirrored from the shell. */
export interface TodoItem {
  /** Stable identity for list keys and targeted mutations. */
  readonly id: string
  /** The user's text, verbatim. */
  readonly text: string
  /** Whether the item is checked off. */
  readonly done: boolean
  /** Creation time (epoch ms). */
  readonly createdAt: number
  /** Completion time, present once done. */
  readonly doneAt?: number
}

/** Declared action shape giving the exported factory a stable return type. */
export type TodoPanelActions = {
  open: (draft: TodoPanelState, anchor: TodoAnchor) => void
  close: (draft: TodoPanelState) => void
  /** Replace the whole list after a bridge read or mutation. */
  setItems: (draft: TodoPanelState, items: readonly TodoItem[]) => void
  /** Mark the initial load settled (or restarted). */
  setLoading: (draft: TodoPanelState, loading: boolean) => void
}

/**
 * Factory for the user-todos panel store. Declared at register in
 * {@link ../index.ts} — one instance per shell (module-level handles are
 * forbidden).
 * @returns the store handle (snapshot source + bound actions).
 */
export function createTodoPanelStore(): EngineStoreHandle<TodoPanelState, TodoPanelActions> {
  return defineStore({
    init: (): TodoPanelState => ({
      open: false,
      anchor: { left: 0, top: 0, bottom: 0 },
      items: [],
      loading: false,
    }),
    actions: {
      open: (d, anchor) => {
        d.open = true
        d.anchor = anchor
      },
      close: (d) => { d.open = false },
      setItems: (d, items) => { d.items = items },
      setLoading: (d, loading) => { d.loading = loading },
    },
  })
}
