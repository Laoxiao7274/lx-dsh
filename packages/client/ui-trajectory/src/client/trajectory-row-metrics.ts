/**
 * Pure projection of the inline metric tail shown after a ledger row's
 * content: duration for tool rows, duration plus output tokens for assistant
 * rows, input tokens for user rows. Duration is the row's only emphasised
 * number, so slowness is graded into tones the CSS colours.
 */
import { formatHeadDuration } from './trajectory-record.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import { formatTokenSummary } from './trajectory-structure-rows.ts'

/** Record lifecycle states shared with the ledger's row rendering. */
export type RowMetricsState = 'running' | 'error' | 'complete'

/** Emphasis of a row's duration tail. */
export type RowMetricsTone = 'plain' | 'slow' | 'xslow'

/** One rendered metric tail. */
export interface RowMetrics {
  /** Full tail text, e.g. `34.1s`, `5.1s · 1,203 tok`, or the running label. */
  text: string
  /** Duration emphasis; running and token-only tails stay plain. */
  tone: RowMetricsTone
  /** Whether the tail marks an in-flight record (CSS shimmers it). */
  running: boolean
}

/** Durations at or above this many seconds read as slow. */
export const SLOW_SECONDS = 20

/** Durations at or above this many seconds read as very slow. */
export const VERY_SLOW_SECONDS = 60

function toneOf(seconds: number): RowMetricsTone {
  if (seconds >= VERY_SLOW_SECONDS) return 'xslow'
  if (seconds >= SLOW_SECONDS) return 'slow'
  return 'plain'
}

function tokenTail(cell: TrajectoryCellProps): string | undefined {
  const tokens = cell.kind === 'user' ? cell.input
    : cell.kind === 'message' ? cell.output
      : undefined
  if (tokens === undefined) return undefined
  return `${formatTokenSummary(tokens)} tok`
}

/**
 * Derive the metric tail for one ledger record.
 * @param cell - The record whose timing and usage are displayed.
 * @param state - Lifecycle state; running records show the running label.
 * @param runningLabel - Localized word for an in-flight record.
 * @returns The rendered tail, or `undefined` when nothing would show.
 */
export function trajectoryRowMetrics(
  cell: TrajectoryCellProps,
  state: RowMetricsState,
  runningLabel: string,
): RowMetrics | undefined {
  const seconds = cell.timeSeconds
  const timed = seconds !== null && Number.isFinite(seconds)
  if (state === 'running') {
    const tokens = tokenTail(cell)
    return {
      text: timed
        ? `${runningLabel} · ${formatHeadDuration(seconds)}${tokens === undefined ? '' : ` · ${tokens}`}`
        : runningLabel,
      tone: 'plain',
      running: true,
    }
  }
  const parts: string[] = []
  let tone: RowMetricsTone = 'plain'
  if (
    timed
    && (
      cell.kind === 'tool'
      || cell.kind === 'subtool'
      || cell.kind === 'message'
      || cell.kind === 'compacted'
    )
  ) {
    parts.push(formatHeadDuration(seconds))
    tone = toneOf(seconds)
  }
  const tokens = tokenTail(cell)
  if (tokens !== undefined) parts.push(tokens)
  if (parts.length === 0) return undefined
  return { text: parts.join(' · '), tone, running: false }
}
