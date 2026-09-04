/**
 * LX-DSH user-todos tree row: the leading row the workspace browser renders
 * above every workspace group (wide column only). Mirrors the project-row
 * anatomy (icon + title + trailing count badge) so the todos entry reads as
 * a sibling of the workspace folders; the badge sums the open items across
 * every workspace bucket. Clicking opens the panel for the CURRENT session's
 * workspace (the no-workspace default bucket when none is current).
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import css from './LxTodosTreeRow.module.css'
import type { TodoAnchor } from './todo-store.ts'
import type { createTodoPanelStore } from './todo-store.ts'

/** The workspace context the panel opens for. */
export interface TodoWorkspaceContext {
  /** The workspace bucket key ('' = the no-workspace default). */
  key: string
  /** The workspace's display title, when one is current. */
  title: string | undefined
}

/** Full props of the user-todos leading tree row. */
export type LxTodosTreeRowProps = PropsRuntime<'sidebar.workspaces.leading'>
  & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Open the panel for the current workspace, anchored to this row. */
    open: (anchor: TodoAnchor, workspace: TodoWorkspaceContext) => void
  }

/** Minimal sessions projection the workspace derivation reads. */
interface SessionsProjection {
  readonly current: string | undefined
}

/** Minimal workspaces projection the workspace derivation reads. */
interface WorkspaceProjection {
  readonly workspaceId: string | undefined
  readonly sessionIds: readonly string[]
  readonly title: string
}

/**
 * Derive the workspace context of the current session: the bucket whose
 * workspace owns the current session, or the no-workspace default.
 * @param sessions - the sessions projection (current session id).
 * @param workspaces - the workspaces projection (owner + session ids).
 * @returns the bucket key and display title.
 */
export function currentTodoWorkspace(
  sessions: SessionsProjection,
  workspaces: readonly WorkspaceProjection[],
): TodoWorkspaceContext {
  const current = sessions.current
  if (current !== undefined) {
    const owner = workspaces.find(workspace => workspace.workspaceId !== undefined
      && workspace.sessionIds.includes(current))
    if (owner !== undefined) return { key: owner.workspaceId as string, title: owner.title }
  }
  return { key: '', title: undefined }
}

/** Sum the per-bucket open counts for the reminder badge. */
export function totalOpenCount(counts: Readonly<Record<string, number>>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}

/**
 * Render the user-todos leading tree row.
 * @param props - slot runtime share, the panel store, the locale seat, and
 *   the open write (this row's rectangle + workspace context in).
 * @returns the tree row with its reminder badge.
 */
export function LxTodosTreeRow({ useStore, useSessions, useWorkspaces, t, open }: LxTodosTreeRowProps): ReactNode {
  const panelOpen = useStore(s => s.open)
  const openCount = useStore(s => totalOpenCount(s.counts))
  const current = useSessions(s => s.current)
  const items = useWorkspaces(s => s.items)
  const workspace = currentTodoWorkspace({ current }, items)
  return (
    <div
      className={css.row}
      role="treeitem"
      aria-selected={panelOpen || undefined}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        open({ left: rect.right, top: rect.top, bottom: rect.bottom }, workspace)
      }}
    >
      <span className={css.iconSlot} aria-hidden>
        <svg viewBox="0 0 16 16" width={16} height={16}>
          <path d="M5.5 3.5h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 2.5v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7.8 8.3l1.3 1.3 2-2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={css.title}>{t('todo.title')}</span>
      {openCount > 0
        ? <span className={css.count}>{openCount > 99 ? '99+' : String(openCount)}</span>
        : null}
    </div>
  )
}
