/** Assistant reasoning disclosure, independent of Tool-call presentation. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { DisclosureRow, IconThinkOutline14, useStreamReveal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import a11yCss from './accessibility.module.css'
import css from './ReasoningRow.module.css'

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

/** Format a completed thinking duration as the largest sensible unit. */
function formatDuration(ms: number, t: ChatViewSlotProps['t']): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return t('duration.seconds', { seconds })
  return t('duration.minutes', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
}

/**
 * Render one assistant reasoning block as the Think disclosure row.
 * @param props.text - complete or streaming reasoning text.
 * @param props.running - whether this block is the streaming tail.
 * @param props.thinkingMs - completed thinking duration; absent while running.
 * @param props.t - conversation locale seat for the running status.
 * @returns the reasoning disclosure.
 */
export function ReasoningRow({ text, running, thinkingMs, t }: {
  text: string
  running: boolean
  thinkingMs?: number | undefined
  t: ChatViewSlotProps['t']
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = useStreamReveal(text)
  const summary = useMemo(() => (running ? latestLine(shown) : firstLine(shown)), [running, shown])
  const viewportRef = useRef<HTMLDivElement>(null)

  // An expanded running body auto-follows the stream inside its capped
  // viewport, so reading the live reasoning never requires manual scrolling.
  useEffect(() => {
    if (!running || !expanded) return
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight })
  }, [shown, running, expanded])

  return (
    <div
      className={css.root}
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-expanded={expanded || undefined}
    >
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={<IconThinkOutline14 size={14} />}
        title={t('message.think')}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => { setExpanded(value => !value) }}
        collapsedContent={(
          <>
            <span className={css.separator} aria-hidden />
            <span className={css.summary} data-follow-end={running || undefined}>
              <span className={running ? css.summaryTextShimmer : css.summaryText}>{summary}</span>
            </span>
          </>
        )}
      >
        <div className={css.thinkViewport} ref={viewportRef}>
          <div className={css.thinkBody}>
            {shown.split('\n').map((line, index) => (
              <p key={index} className={css.thinkLine}>{line}</p>
            ))}
          </div>
        </div>
        {running === false && thinkingMs !== undefined && (
          <div className={css.thoughtFor}>{t('row.thoughtFor', { duration: formatDuration(thinkingMs, t) })}</div>
        )}
      </DisclosureRow>
    </div>
  )
}
