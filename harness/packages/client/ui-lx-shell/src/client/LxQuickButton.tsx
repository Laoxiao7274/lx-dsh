/**
 * LX-DSH quick-answers footer action: the sidebar-foot entry that toggles the
 * quick-answers drawer. Wide renders the labelled row the settings trigger
 * mirrors; the collapsed rail renders the icon circle.
 */
import type { ReactNode } from 'react'
import { IconBoltOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './LxQuickButton.module.css'
import type { createQuickDrawerStore } from './quick-store.ts'

/** Full props of the quick-answers footer action occupant. */
export type LxQuickButtonProps = PropsRuntime<'sidebar.footer.action'>
  & SidebarFooterActionOwnerProps & PropsStore<ReturnType<typeof createQuickDrawerStore>>
  & PropsLocale<'settings.lxShell'> & {
    /** Set the drawer to this state (the component owns the current read). */
    toggle: (open: boolean) => void
  }

/**
 * Render the quick-answers entry at the sidebar foot.
 * @param props - slot runtime share, the drawer store, the column display
 *   state, the locale seat, and the toggle write (target state in).
 * @returns the footer button.
 */
export function LxQuickButton({ useStore, toggle, wide, t }: LxQuickButtonProps): ReactNode {
  const open = useStore(s => s.open)
  return (
    <button
      type="button"
      className={wide ? css.quick : `${css.quick} ${css.rail}`}
      aria-label={t('quick.title')}
      aria-pressed={open}
      title={t('quick.title')}
      onClick={() => { toggle(!open) }}
    >
      <IconBoltOutline16 size={16} className={css.icon} />
      {wide ? <span className={css.label}>{t('quick.label')}</span> : null}
    </button>
  )
}
