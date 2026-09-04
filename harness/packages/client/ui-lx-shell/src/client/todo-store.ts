/**
 * User-todos panel state: the open flag, the anchor rectangle captured from
 * the clicked entry, the workspace bucket being shown, and the list mirrored
 * from the shell's persisted store (userData/todos.json via the `window.lx`
 * bridge, one bucket per workspace). The apply body owns the bridge calls;
 * this store carries only the render-facing mirror so the panel stays a
 * pure-props component.
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
  /** The workspace bucket being shown ('' = the no-workspace default). */
  workspaceKey: string
  /** The shown workspace's display title (the panel header). */
  workspaceTitle: string | undefined
  /** The mirrored list, oldest first (the shell's canonical order). */
  items: readonly TodoItem[]
  /** Open (not-done) counts per workspace bucket, for the reminder badge. */
  counts: Readonly<Record<string, number>>
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
  open: (draft: TodoPanelState, anchor: TodoAnchor, workspaceKey: string, workspaceTitle: string | undefined) => void
  close: (draft: TodoPanelState) => void
  /** Retarget the shown bucket (a workspace switch while open). */
  setWorkspace: (draft: TodoPanelState, key: string, title: string | undefined) => void
  /** Replace the whole list after a bridge read or mutation. */
  setItems: (draft: TodoPanelState, items: readonly TodoItem[]) => void
  /** Replace the per-bucket open counts after a read or mutation. */
  setCounts: (draft: TodoPanelState, counts: Readonly<Record<string, number>>) => void
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
      workspaceKey: '',
      workspaceTitle: undefined,
      items: [],
      counts: {},
      loading: false,
    }),
    actions: {
      open: (d, anchor, workspaceKey, workspaceTitle) => {
        d.open = true
        d.anchor = anchor
        d.workspaceKey = workspaceKey
        d.workspaceTitle = workspaceTitle
      },
      close: (d) => { d.open = false },
      setWorkspace: (d, key, title) => {
        d.workspaceKey = key
        d.workspaceTitle = title
      },
      setItems: (d, items) => { d.items = items },
      setCounts: (d, counts) => { d.counts = counts },
      setLoading: (d, loading) => { d.loading = loading },
    },
  })
}
