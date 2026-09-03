/**
 * The Appearance settings section: one column rendering this feature's item
 * contributions (scheme, skin, background). The section is feature-owned —
 * ui-theme declares both the nav entry and the `settings.appearance.item`
 * list its rows ride.
 */
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AppearanceSection.module.css'

/** Full component props: section owner share plus item render share. */
export type AppearanceSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsRenderSlots<'settings.appearance.item'>

/**
 * Render the Appearance section content column.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function AppearanceSection({ renderSlot }: AppearanceSectionComponentProps) {
  return (
    <div className={css.section}>
      {renderSlot('settings.appearance.item', {})}
    </div>
  )
}
