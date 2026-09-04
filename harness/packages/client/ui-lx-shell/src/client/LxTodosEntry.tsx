/**
 * LX-DSH user-todos footer action: the sidebar-foot entry that opens the
 * todos panel (the rail fallback — the per-group row hides on the rail).
 * Wide renders the labelled row; the collapsed rail renders the icon circle.
 * The badge sums the open items across every workspace bucket; the panel
 * opens for the CURRENT session's workspace.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './LxTodosEntry.module.css'
import type { TodoAnchor } from './todo-store.ts'
import type { createTodoPanelStore } from './todo-store.ts'

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
): { key: string; title: string | undefined } {
  const current = sessions.current
  if (current !== undefined) {
    const owner = workspaces.find(workspace => workspace.workspaceId !== undefined
      && workspace.sessionIds.includes(current))
    if (owner !== undefined) return { key: owner.workspaceId as string, title: owner.title }
  }
  return { key: '', title: undefined }
}

/** Sum the per-bucket open counts (the rail badge). */
export function totalOpenCount(counts: Readonly<Record<string, number>>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}

/** Full props of the user-todos footer action occupant. */
export type LxTodosEntryProps = PropsRuntime<'sidebar.footer.action'>
  & SidebarFooterActionOwnerProps & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Open the panel for the current workspace, anchored to this entry. */
    open: (anchor: TodoAnchor, workspace: { key: string; title: string | undefined }) => void
  }

/**
 * Render the user-todos entry at the sidebar foot.
 * @param props - slot runtime share, the panel store, the column display
 *   state, the locale seat, and the open write (rectangle + workspace in).
 * @returns the footer button with its reminder badge.
 */
export function LxTodosEntry({ useStore, useSessions, useWorkspaces, wide, t, open }: LxTodosEntryProps): ReactNode {
  const openCount = useStore(s => totalOpenCount(s.counts))
  const panelOpen = useStore(s => s.open)
  const current = useSessions(s => s.current)
  const items = useWorkspaces(s => s.items)
  const workspace = currentTodoWorkspace({ current }, items)
  return (
    <button
      type="button"
      className={wide ? css.entry : `${css.entry} ${css.rail}`}
      aria-label={t('todo.title')}
      aria-pressed={panelOpen}
      title={t('todo.title')}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        open({ left: rect.right, top: rect.top, bottom: rect.bottom }, workspace)
      }}
    >
      <span className={css.iconWrap}>
        <svg viewBox="0 0 16 16" width={16} height={16} className={css.icon} aria-hidden>
          <path d="M5.5 3.5h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 2.5v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7.8 8.3l1.3 1.3 2-2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {openCount > 0
          ? <span className={css.badge}>{openCount > 99 ? '99+' : String(openCount)}</span>
          : null}
      </span>
      {wide ? <span className={css.label}>{t('todo.title')}</span> : null}
    </button>
  )
}
