/**
 * LX-DSH user-todos tree row: the leading row the workspace browser renders
 * above every workspace group (wide column only). Mirrors the project-row
 * anatomy (icon + title + trailing count badge) so the todos entry reads as
 * a sibling of the workspace folders; the rail keeps the footer entry.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import css from './LxTodosTreeRow.module.css'
import type { TodoAnchor } from './todo-store.ts'
import type { createTodoPanelStore } from './todo-store.ts'

/** Full props of the user-todos leading tree row. */
export type LxTodosTreeRowProps = PropsRuntime<'sidebar.workspaces.leading'>
  & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Open the panel anchored to this row's current rectangle. */
    open: (anchor: TodoAnchor) => void
  }

/**
 * Render the user-todos leading tree row.
 * @param props - slot runtime share, the panel store, the locale seat, and
 *   the open write (this row's rectangle in).
 * @returns the tree row with its reminder badge.
 */
export function LxTodosTreeRow({ useStore, t, open }: LxTodosTreeRowProps): ReactNode {
  const openCount = useStore(s => s.items.filter(item => !item.done).length)
  const panelOpen = useStore(s => s.open)
  return (
    <div
      className={css.row}
      role="treeitem"
      aria-selected={panelOpen || undefined}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        open({ left: rect.right, top: rect.top, bottom: rect.bottom })
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
        ? <span className={css.count} aria-label={t('todo.title')}>{openCount > 99 ? '99+' : String(openCount)}</span>
        : null}
    </div>
  )
}
