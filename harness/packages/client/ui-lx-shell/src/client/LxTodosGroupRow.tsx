/**
 * LX-DSH user-todos group row: the first child of every workspace group in
 * the sidebar tree — the todos entry sits inside its own project's group,
 * beside that project's sessions. The row shows the group's open count and
 * opens that workspace's panel. Owner params carry the group identity, so
 * the same component serves every group (including the ungrouped bucket,
 * which maps to the default todos bucket).
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceGroupRowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import css from './LxTodosGroupRow.module.css'
import type { TodoAnchor } from './todo-store.ts'
import type { createTodoPanelStore } from './todo-store.ts'

/** Full props of the user-todos group row. */
export type LxTodosGroupRowProps = PropsRuntime<'sidebar.workspaces.groupRow'>
  & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Open the panel for this group's bucket, anchored to this row. */
    open: (anchor: TodoAnchor, workspace: { key: string; title: string | undefined }) => void
  }

/**
 * Render the user-todos group row.
 * @param props - slot runtime share (owner group), the panel store, the
 *   locale seat, and the open write.
 * @returns the group's first row with its count badge.
 */
export function LxTodosGroupRow({ workspaceId, title, useStore, t, open }: LxTodosGroupRowProps): ReactNode {
  const openCount = useStore(s => s.counts[workspaceId ?? ''] ?? 0)
  const panelOpen = useStore(s => s.open)
  const currentKey = useStore(s => s.workspaceKey)
  return (
    <div
      className={css.row}
      role="treeitem"
      aria-selected={panelOpen && currentKey === (workspaceId ?? '') || undefined}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        open({ left: rect.left, top: rect.top, bottom: rect.bottom }, { key: workspaceId ?? '', title })
      }}
    >
      <span className={css.iconSlot} aria-hidden>
        <svg viewBox="0 0 16 16" width={14} height={14}>
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

/** Owner-share type re-export for the register call site. */
export type { WorkspaceGroupRowOwnerProps }
