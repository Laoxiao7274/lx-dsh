/**
 * User-todos panel state: the open flag plus the list mirrored from the
 * shell's persisted store (userData/todos.json via the `window.lx` bridge).
 * The apply body owns the bridge calls; this store carries only the
 * render-facing mirror so the panel stays a pure-props component.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { LxTodoItem } from './index.ts'

/** Render-facing user-todos panel state. */
export interface TodoPanelState {
  /** Whether the panel is open. */
  open: boolean
  /** The mirrored list, oldest first (the shell's canonical order). */
  items: readonly LxTodoItem[]
  /** Whether the initial load is still in flight. */
  loading: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
export type TodoPanelActions = {
  open: (draft: TodoPanelState) => void
  close: (draft: TodoPanelState) => void
  toggle: (draft: TodoPanelState) => void
  /** Replace the whole list after a bridge read or mutation. */
  setItems: (draft: TodoPanelState, items: readonly LxTodoItem[]) => void
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
    init: (): TodoPanelState => ({ open: false, items: [], loading: false }),
    actions: {
      open: (d) => { d.open = true },
      close: (d) => { d.open = false },
      toggle: (d) => { d.open = !d.open },
      setItems: (d, items) => { d.items = items },
      setLoading: (d, loading) => { d.loading = loading },
    },
  })
}
