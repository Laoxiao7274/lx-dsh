/**
 * Quick-answers drawer: a right-anchored slide-in panel hosting a compact
 * ask-and-answer exchange against the quick-answers preset session. It rides
 * the shell overlay layer; the main conversation column and the current
 * session stay untouched (the quick session is never staged as current).
 * Answers render through the shared MarkdownText pipeline and reasoning
 * rides the same Think disclosure row the chat uses, so the drawer keeps
 * the chat's presentation (thinking, tool activity, markdown typography).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DisclosureRow, IconBoltOutline16, IconRefreshOutline14, IconSearchOutline16,
  IconThinkOutline14, MarkdownText, useStreamReveal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import css from './LxQuickDrawer.module.css'
import type { QuickTurn } from './quick-store.ts'
import type { createQuickDrawerStore } from './quick-store.ts'

/** Injected share (apply-closure callbacks; see {@link ../index.ts}). */
export interface LxQuickDrawerInjected {
  /** Send one question into the quick session. */
  ask: (text: string) => void
  /** Archive the quick session and start a fresh one. */
  reset: () => void
}

/** Full props of the quick-answers drawer. */
export type LxQuickDrawerProps = PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createQuickDrawerStore>>
  & PropsLocale<'settings.lxShell'> & LxQuickDrawerInjected

/**
 * Render the quick-answers drawer: the expanded slide-in panel, or nothing
 * while closed or collapsed (the footer button reopens it; collapse only
 * hides, never discards the session).
 * @param props - slot runtime share, the drawer store, the locale seat, and
 *   the ask/reset writes.
 * @returns the drawer or nothing.
 */
export function LxQuickDrawer({ useStore, actions, t, ask, reset }: LxQuickDrawerProps): ReactNode {
  const mode = useStore(s => s.mode)
  const state = useStore(s => s)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastTurnCount = useRef(0)
  // Stable per locale revision (t identity changes on switch): a fresh object
  // per render would rebuild MarkdownText's streaming cache every chunk.
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('quick.copy'), copiedLabel: t('quick.copied') },
    footnotes: t('quick.footnotes'),
  }), [t])

  // Focus the composer on expand.
  useEffect(() => {
    if (mode === 'expanded') inputRef.current?.focus()
  }, [mode])

  // Keep the newest exchange in view: answer growth and new turns.
  useEffect(() => {
    const list = listRef.current
    if (list === null) return
    const turns = state.turns
    const grew = turns.length !== lastTurnCount.current
    lastTurnCount.current = turns.length
    if (grew || (turns.length > 0 && turns[turns.length - 1]?.running === true)) {
      list.scrollTop = list.scrollHeight
    }
  }, [state.turns])

  if (mode !== 'expanded') return null

  const submit = (): void => {
    const input = inputRef.current
    if (input === null) return
    const text = input.value.trim()
    if (text === '') return
    input.value = ''
    ask(text)
  }

  return (
    <div className={css.drawer} role="complementary" aria-label={t('quick.label')}>
      <div className={css.header}>
        <IconBoltOutline16 size={16} className={css.icon} />
        <span className={css.title}>{t('quick.label')}</span>
        <button
          type="button" className={css.reset} aria-label={t('quick.reset')}
          title={t('quick.reset')} onClick={() => { reset() }}
        >
          <IconRefreshOutline14 size={14} />
          <span className={css.resetLabel}>{t('quick.reset')}</span>
        </button>
        <button
          type="button" className={css.collapse} aria-label={t('quick.collapse')} title={t('quick.collapse')}
          onClick={() => { actions.collapse() }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className={css.list} ref={listRef}>
        {state.error !== undefined
          ? <div className={css.error} role="alert">{state.error}</div>
          : state.turns.length === 0
            ? <div className={css.empty}>{t('quick.empty')}</div>
            : state.turns.map(turn => <QuickTurnRow key={turn.id} turn={turn} labels={labels} t={t} />)}
      </div>
      <div className={css.composer}>
        <textarea
          ref={inputRef}
          className={css.input}
          rows={2}
          placeholder={t('quick.placeholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button type="button" className={css.send} aria-label={t('quick.send')} onClick={submit}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M2 8l12-6-4 6 4 6z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** One rendered exchange: tool activity, the Think disclosure, the answer. */
function QuickTurnRow({ turn, labels, t }: {
  turn: QuickTurn
  labels: MarkdownLabels
  t: LxQuickDrawerProps['t']
}): ReactNode {
  return (
    <div className={css.turn}>
      <div className={css.question}>{turn.question}</div>
      {turn.tools.length > 0 && (
        <div className={css.tools}>
          {turn.tools.map((tool, index) => (
            <span key={index} className={css.tool}>
              <IconSearchOutline16 size={14} className={css.toolIcon} />
              <span className={css.toolName}>{tool.name}</span>
              {turn.running && index === turn.tools.length - 1 && <span className={css.dots} aria-label="…" />}
            </span>
          ))}
        </div>
      )}
      {turn.reasoning !== '' && <QuickReasoning text={turn.reasoning} running={turn.running} t={t} />}
      <div className={css.answer}>
        {turn.answer === '' && turn.running && turn.reasoning === '' && turn.tools.length === 0
          ? <span className={css.dots} aria-label="…" />
          : <MarkdownText text={turn.answer} streaming={turn.running} labels={labels} />}
      </div>
    </div>
  )
}

/** The Think disclosure, mirroring the chat's ReasoningRow presentation. */
function QuickReasoning({ text, running, t }: {
  text: string
  running: boolean
  t: LxQuickDrawerProps['t']
}): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const shown = useStreamReveal(text)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  // An expanded running body auto-follows the stream.
  useEffect(() => {
    if (running && expanded) viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight })
  }, [shown, running, expanded])

  const summary = running
    ? (shown.trimEnd().split('\n').pop() ?? '')
    : (shown.split('\n')[0] ?? '')
  return (
    <div className={css.think} data-state={running ? 'running' : 'ok'} data-expanded={expanded || undefined}>
      <DisclosureRow
        rowClassName={css.thinkRow}
        leadingClassName={css.thinkLeading}
        titleClassName={css.thinkTitle}
        chevronClassName={css.thinkChevron}
        icon={<IconThinkOutline14 size={14} />}
        title={t('quick.think')}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => { setExpanded(value => !value) }}
        collapsedContent={(
          <>
            <span className={css.thinkSeparator} aria-hidden />
            <span className={css.thinkSummary}>{summary}</span>
          </>
        )}
      >
        <div className={css.thinkViewport} ref={viewportRef}>
          {shown.split('\n').map((line, index) => (
            <p key={index} className={css.thinkLine}>{line}</p>
          ))}
        </div>
      </DisclosureRow>
    </div>
  )
}
