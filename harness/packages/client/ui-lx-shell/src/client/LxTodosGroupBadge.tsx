/**
 * LX-DSH user-todos group badge: the count pill rendered after a workspace
 * group header's title — the group's open todos stay visible even while
 * the group is collapsed. Clicking the pill opens that workspace's panel
 * without expanding the group (the click stops the header's toggle).
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import css from './LxTodosGroupBadge.module.css'
import type { TodoAnchor } from './todo-store.ts'
import type { createTodoPanelStore } from './todo-store.ts'

/** Full props of the user-todos group badge. */
export type LxTodosGroupBadgeProps = PropsRuntime<'sidebar.workspaces.groupBadge'>
  & PropsStore<ReturnType<typeof createTodoPanelStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Open the panel for this group's bucket, anchored to this badge. */
    open: (anchor: TodoAnchor, workspace: { key: string; title: string | undefined }) => void
  }

/**
 * Render the user-todos group badge.
 * @param props - slot runtime share (owner group), the panel store, the
 *   locale seat, and the open write.
 * @returns the count pill, or nothing at zero.
 */
export function LxTodosGroupBadge({ workspaceId, title, useStore, t, open }: LxTodosGroupBadgeProps): ReactNode {
  const openCount = useStore(s => s.counts[workspaceId ?? ''] ?? 0)
  if (openCount === 0) return null
  return (
    <button
      type="button"
      className={css.badge}
      aria-label={t('todo.title')}
      title={t('todo.title')}
      onClick={(e) => {
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        open({ left: rect.left, top: rect.bottom, bottom: rect.bottom }, { key: workspaceId ?? '', title })
      }}
    >
      {openCount > 99 ? '99+' : String(openCount)}
    </button>
  )
}
