/**
 * The vision controls shared by both model-list editors: the row chip and the
 * capacity-panel switch. Both mirror one fact — whether the row declares
 * image input — and each editor owns its field name and toggle semantics;
 * these components render the state. Decorative motion is gated by the shared
 * motion-allowed reading; the switch's thumb slide stays a CSS transition
 * because a control answers press-by-press.
 */
import type { ReactNode } from 'react'
import { gsap } from 'gsap'
import { motionAllowed } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './ModelsSection.module.css'

/** Inline eye glyph — the primitives icon set ships no vision mark. */
function EyeGlyph(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z"
        fill="none" stroke="currentColor" strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** Shared props of both vision controls. */
export interface ModelVisionControlProps {
  /** Whether the row currently declares image input. */
  on: boolean
  /** The localized control label (announced through the accessible name). */
  label: string
  /** Disable the toggle. */
  disabled: boolean
  /** Flip the row's declaration. */
  onToggle: () => void
}

/**
 * Render the row's vision chip: a quiet pill that tints when the row accepts
 * image input, with a short gsap pop on click so the flip reads as a
 * deliberate press.
 * @param props - press state, label, disabled flag, and the flip action.
 * @returns the toggle chip.
 */
export function ModelVisionChip({ on, label, disabled, onToggle }: ModelVisionControlProps): ReactNode {
  return (
    <button
      type="button"
      className={on ? `${styles['visionChip']} ${styles['visionChipOn']}` : styles['visionChip']}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        onToggle()
        if (motionAllowed()) {
          gsap.fromTo(event.currentTarget, { scale: 0.9 }, { scale: 1, duration: 0.18, ease: 'power2.out' })
        }
      }}
    >
      <EyeGlyph />
      <span>{label}</span>
    </button>
  )
}

/**
 * Render the capacity panel's vision switch: a labeled `role="switch"`
 * mirroring the row chip — the explicit, legible form of the same
 * declaration. The thumb slides on a CSS transform transition (a control
 * answers press-by-press; gsap stays with the decorative effects).
 * @param props - press state, label, disabled flag, and the flip action.
 * @returns the switch.
 */
export function ModelVisionSwitch({ on, label, disabled, onToggle }: ModelVisionControlProps): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={on ? `${styles['switch']} ${styles['switchOn']}` : styles['switch']}
      onClick={onToggle}
    >
      <span className={styles['switchThumb']} />
    </button>
  )
}
