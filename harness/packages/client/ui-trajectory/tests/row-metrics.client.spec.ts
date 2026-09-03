// @vitest-environment jsdom
/** Row metric tails: text assembly, tones, and running labels. */

import { describe, expect, it } from 'vitest'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import {
  SLOW_SECONDS, VERY_SLOW_SECONDS, trajectoryRowMetrics,
} from '../src/client/trajectory-row-metrics.ts'

function cell(fields: Partial<TrajectoryCellProps>): TrajectoryCellProps {
  return {
    index: 1,
    kind: 'tool',
    text: 'tool text',
    timeSeconds: null,
    ...fields,
  }
}

describe('trajectoryRowMetrics', () => {
  it('shows the tool duration with the compact label', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'tool', timeSeconds: 0.24 }), 'complete', 'Running',
    )
    expect(metrics).toEqual({ text: '0.2s', tone: 'plain', running: false })
  })

  it('grades slow and very slow durations into tones', () => {
    const slow = trajectoryRowMetrics(
      cell({ timeSeconds: SLOW_SECONDS }), 'complete', 'Running',
    )
    const xslow = trajectoryRowMetrics(
      cell({ timeSeconds: VERY_SLOW_SECONDS }), 'complete', 'Running',
    )
    expect(slow?.tone).toBe('slow')
    expect(xslow?.tone).toBe('xslow')
  })

  it('pairs assistant duration with output tokens', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'message', timeSeconds: 5.1, output: 1203 }), 'complete', 'Running',
    )
    expect(metrics?.text).toBe('5.1s · 1,203 tok')
  })

  it('shows only output tokens for an assistant without timing', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'message', output: 981 }), 'complete', 'Running',
    )
    expect(metrics).toEqual({ text: '981 tok', tone: 'plain', running: false })
  })

  it('shows input tokens for user records', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'user', input: 142, timeSeconds: 3 }), 'complete', 'Running',
    )
    expect(metrics?.text).toBe('142 tok')
  })

  it('keeps compacted durations timed', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'compacted', timeSeconds: 75 }), 'complete', 'Running',
    )
    expect(metrics).toEqual({ text: '1m15s', tone: 'xslow', running: false })
  })

  it('shows the duration for timed system notices without tokens', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'system', timeSeconds: 2, output: 10 }), 'complete', 'Running',
    )
    expect(metrics).toBeUndefined()
  })

  it('renders the running label alone without timing', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'tool' }), 'running', 'Running',
    )
    expect(metrics).toEqual({ text: 'Running', tone: 'plain', running: true })
  })

  it('extends the running label with elapsed time and tokens', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'message', timeSeconds: 12.4, output: 30 }), 'running', 'Running',
    )
    expect(metrics).toEqual({
      text: 'Running · 12s · 30 tok', tone: 'plain', running: true,
    })
  })

  it('omits the tail when nothing is recorded', () => {
    expect(
      trajectoryRowMetrics(cell({ kind: 'user' }), 'complete', 'Running'),
    ).toBeUndefined()
  })

  it('omits non-finite timing from the tail', () => {
    const metrics = trajectoryRowMetrics(
      cell({ kind: 'tool', timeSeconds: Number.POSITIVE_INFINITY }), 'complete', 'Running',
    )
    expect(metrics).toBeUndefined()
  })
})
