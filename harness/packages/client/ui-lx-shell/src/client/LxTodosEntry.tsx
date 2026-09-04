/**
 * LX-DSH user-todos footer action: the sidebar-foot entry that opens the
 * todos panel. Wide renders the labelled row the settings trigger mirrors;
 * the collapsed rail renders the icon circle. A small badge on the icon
 * carries the open (not-done) count as the standing reminder.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './LxTodosEntry.module.css'
import type { TodoAnchorRect } from './LxTodosPanel.tsx'
import type { createTodoPanelStore } from './todo-store.ts'

/** Full props of the user-todos footer action occupant. */
export type LxTodosEntryProps = PropsRuntime<'sidebar.footer.action'>
  & SidebarFooterActionOwnerProps & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Open the panel anchored to this entry's current rectangle. */
    open: (anchor: TodoAnchorRect) => void
  }

/**
 * Render the user-todos entry at the sidebar foot.
 * @param props - slot runtime share, the panel store, the column display
 *   state, the locale seat, and the open write (this button's rectangle in).
 * @returns the footer button with its reminder badge.
 */
export function LxTodosEntry({ useStore, wide, t, open }: LxTodosEntryProps): ReactNode {
  const openCount = useStore(s => s.items.filter(item => !item.done).length)
  const panelOpen = useStore(s => s.open)
  return (
    <button
      type="button"
      className={wide ? css.entry : `${css.entry} ${css.rail}`}
      aria-label={t('todo.title')}
      aria-pressed={panelOpen}
      title={t('todo.title')}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        open({ left: rect.left, top: rect.top, bottom: rect.bottom })
      }}
    >
      <span className={css.iconWrap}>
        <svg viewBox="0 0 16 16" width={16} height={16} className={css.icon} aria-hidden>
          <path d="M5.5 3.5h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 2.5v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7.8 8.3l1.3 1.3 2-2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {openCount > 0
          ? <span className={css.badge} aria-hidden>{openCount > 99 ? '99+' : String(openCount)}</span>
          : null}
      </span>
      {wide ? <span className={css.label}>{t('todo.title')}</span> : null}
    </button>
  )
}
