/**
 * LX-DSH user-todos tree row: the leading row the workspace browser renders
 * above every workspace group (wide column only). The row expands into one
 * line per workspace — each line shows that workspace's open count, so the
 * user sees every project's todos without opening the project — and
 * clicking a line opens that workspace's panel. The header badge shows the
 * CURRENT session's workspace count (not the global sum).
 */
import { useState, type ReactNode } from 'react'
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
    /** Open the panel for one workspace, anchored to its row. */
    open: (anchor: TodoAnchor, workspace: TodoWorkspaceContext) => void
  }

/** Minimal sessions projection the workspace derivation reads. */
interface SessionsProjection {
  readonly current: string | undefined
}

/** Minimal workspaces projection the tree and derivation read. */
export interface WorkspaceProjection {
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

/** Sum the per-bucket open counts (the un-expanded header's total). */
export function totalOpenCount(counts: Readonly<Record<string, number>>): number {
  let total = 0
  for (const value of Object.values(counts)) total += value
  return total
}

/** Sort rank: workspaces with open todos first, then by title. */
function workspaceRank(workspace: WorkspaceProjection, counts: Readonly<Record<string, number>>): number {
  return workspace.workspaceId !== undefined && (counts[workspace.workspaceId] ?? 0) > 0 ? 0 : 1
}

/**
 * Render the user-todos leading tree row with its expandable per-workspace
 * list.
 * @param props - slot runtime share, the panel store, the locale seat, and
 *   the open write (the clicked row's rectangle + workspace in).
 * @returns the tree row group.
 */
export function LxTodosTreeRow({ useStore, useSessions, useWorkspaces, t, open }: LxTodosTreeRowProps): ReactNode {
  const panelOpen = useStore(s => s.open)
  const counts = useStore(s => s.counts)
  const currentKey = useStore(s => s.workspaceKey)
  const current = useSessions(s => s.current)
  const items = useWorkspaces(s => s.items)
  const currentWorkspace = currentTodoWorkspace({ current }, items)
  const [expanded, setExpanded] = useState(false)

  // The header badge counts the CURRENT session's workspace only.
  const headerCount = counts[currentWorkspace.key] ?? 0

  // One line per real workspace (open-todo workspaces first, then title);
  // the default bucket renders as its own line when it holds entries.
  const lines: readonly WorkspaceProjection[] = [...items]
    .sort((left, right) =>
      workspaceRank(left, counts) - workspaceRank(right, counts)
      || left.title.localeCompare(right.title))

  const defaultCount = counts[''] ?? 0

  return (
    <div className={css.group}>
      <div
        className={css.row}
        role="treeitem"
        aria-expanded={expanded}
        aria-selected={panelOpen || undefined}
        onClick={() => { setExpanded(value => !value) }}
      >
        <span className={css.iconSlot} aria-hidden>
          <svg viewBox="0 0 16 16" width={16} height={16}>
            <path d="M5.5 3.5h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3.5 2.5v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M7.8 8.3l1.3 1.3 2-2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={css.chevron} data-open={expanded || undefined} aria-hidden>
          <svg viewBox="0 0 16 16" width={12} height={12}>
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={css.title}>{t('todo.title')}</span>
        {headerCount > 0
          ? <span className={css.count}>{headerCount > 99 ? '99+' : String(headerCount)}</span>
          : null}
      </div>
      {expanded && (
        <div className={css.lines} role="group">
          {lines.map(workspace => workspace.workspaceId === undefined ? null : (
            <div
              key={workspace.workspaceId}
              className={css.line}
              role="treeitem"
              aria-selected={panelOpen && currentKey === workspace.workspaceId || undefined}
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                open({ left: rect.left, top: rect.top, bottom: rect.bottom }, {
                  key: workspace.workspaceId as string,
                  title: workspace.title,
                })
              }}
            >
              <span className={css.lineTitle}>{workspace.title}</span>
              <span
                className={css.lineCount}
                data-empty={(counts[workspace.workspaceId] ?? 0) === 0 || undefined}
              >
                {counts[workspace.workspaceId] ?? 0}
              </span>
            </div>
          ))}
          {defaultCount > 0 && (
            <div
              className={css.line}
              role="treeitem"
              aria-selected={panelOpen && currentKey === '' || undefined}
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                open({ left: rect.left, top: rect.top, bottom: rect.bottom }, { key: '', title: undefined })
              }}
            >
              <span className={css.lineTitle}>{t('todo.defaultWorkspace')}</span>
              <span className={css.lineCount}>{defaultCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
