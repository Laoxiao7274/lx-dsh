/** Trajectory toolbar: timeline mode segment, whole-list folds, and live search. */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import gsap from 'gsap'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconSearchOutline16, motionAllowed } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NS } from './locales.ts'
import css from './TrajectoryToolbar.module.css'

/** Timeline width/timing projection chosen from the segmented control. */
export type TrajectoryTimelineModeChoice = 'equal' | 'duration' | 'actual'

export interface TrajectoryToolbarProps {
  /** Active timeline mode. */
  mode: TrajectoryTimelineModeChoice
  /** Switch the timeline mode. */
  onModeChange: (mode: TrajectoryTimelineModeChoice) => void
  /** Whether every collapsible turn is currently folded. */
  allTurnsCollapsed: boolean
  /** Fold or expand every collapsible turn. */
  onToggleAllTurns: () => void
  /** Whether every collapsible assistant's tool calls are currently folded. */
  allAssistantsCollapsed: boolean
  /** Fold or expand tool calls under every collapsible assistant. */
  onToggleAllAssistants: () => void
  /** Current live ledger search query. */
  searchQuery: string
  /** Update the live ledger search query. */
  onSearchQueryChange: (query: string) => void
  /** Live match count rendered inside the search field, or null without a query. */
  matchCount: number | null
  /** Slot-owned entries pinned at the toolbar's right end after the search
   * field (e.g. the session-log export action), or null when the slot is
   * empty. Rendered by the caller's slot, so this component stays
   * action-agnostic. */
  trailing?: ReactNode | null
  /** Translate a toolbar dictionary key. */
  t: TranslateNS<typeof NS>
}

function ChevronFoldIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={css.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h11M2.5 11.5h11" />
      {expanded
        ? <path d="M6 13.3 4 11.5l2-1.8M10 2.7l2 1.8-2 1.8" />
        : <path d="M6 2.7 4 4.5l2 1.8M10 13.3l2-1.8-2-1.8" />}
    </svg>
  )
}

/**
 * Render the sticky trajectory toolbar.
 * @param props - timeline mode, whole-list fold state, and live search facts.
 * @returns the toolbar element.
 */
export function TrajectoryToolbar({
  mode,
  onModeChange,
  allTurnsCollapsed,
  onToggleAllTurns,
  allAssistantsCollapsed,
  onToggleAllAssistants,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  t,
  trailing,
}: TrajectoryToolbarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const input = inputRef.current
        if (input === null) return
        event.preventDefault()
        input.focus()
        input.select()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [])
  const innerRef = useRef<HTMLDivElement | null>(null)
  // Mount stagger: the toolbar clusters rise in sequence as the view takes
  // the stage. Owned gsap context, motion-gated.
  useEffect(() => {
    if (!motionAllowed()) return undefined
    const ctx = gsap.context(() => {
      const clusters = innerRef.current?.children
      if (clusters === undefined || clusters.length === 0) return
      gsap.from([...clusters], { opacity: 0, y: -6, duration: 0.22, stagger: 0.035, ease: 'power2.out' })
    })
    return () => { ctx.revert() }
  }, [])
  const modes: readonly { id: TrajectoryTimelineModeChoice; label: string }[] = [
    { id: 'equal', label: t('toolbar.modeEqual') },
    { id: 'duration', label: t('toolbar.modeDuration') },
    { id: 'actual', label: t('toolbar.modeActual') },
  ]
  return (
    <div className={css.root} role="toolbar" aria-label={t('toolbar.aria')}>
      <div ref={innerRef} className={css.inner}>
        <div className={css.modes} role="group" aria-label={t('toolbar.modes')}>
          {modes.map(candidate => (
            <button
              key={candidate.id}
              type="button"
              className={css.mode}
              aria-pressed={mode === candidate.id}
              title={candidate.label}
              onClick={() => { onModeChange(candidate.id) }}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <span className={css.divider} aria-hidden="true" />
        <button
          type="button"
          className={allTurnsCollapsed ? `${css.action} ${css.actionOn}` : css.action}
          aria-label={allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns')}
          aria-pressed={allTurnsCollapsed}
          title={allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns')}
          onClick={onToggleAllTurns}
        >
          <ChevronFoldIcon expanded={!allTurnsCollapsed} />
          {allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns')}
        </button>
        <button
          type="button"
          className={allAssistantsCollapsed ? `${css.action} ${css.actionOn}` : css.action}
          aria-label={allAssistantsCollapsed
            ? t('toolbar.expandCalls')
            : t('toolbar.collapseCalls')}
          aria-pressed={allAssistantsCollapsed}
          title={allAssistantsCollapsed ? t('toolbar.expandCalls') : t('toolbar.collapseCalls')}
          onClick={onToggleAllAssistants}
        >
          <ChevronFoldIcon expanded={!allAssistantsCollapsed} />
          {allAssistantsCollapsed ? t('toolbar.expandCalls') : t('toolbar.collapseCalls')}
        </button>
        <label className={css.search}>
          <IconSearchOutline16 size={11} className={css.searchIcon} />
          <input
            ref={inputRef}
            type="search"
            className={css.searchInput}
            aria-label={t('toolbar.search')}
            placeholder={t('toolbar.searchPlaceholder')}
            value={searchQuery}
            onChange={(event) => { onSearchQueryChange(event.target.value) }}
          />
          {matchCount !== null && (
            <span className={css.matchCount}>{matchCount}</span>
          )}
          {matchCount === null && searchQuery === '' && (
            <kbd className={css.kbd} aria-hidden="true">⌘F</kbd>
          )}
        </label>
        {trailing != null && <div className={css.trailing}>{trailing}</div>}
      </div>
    </div>
  )
}
