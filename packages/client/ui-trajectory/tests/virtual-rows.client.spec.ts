/** Measurable virtual-row projection and durable identity contracts. */

import { describe, expect, it } from 'vitest'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import {
  projectTrajectoryVirtualRows, trajectoryVirtualRecordKey,
  type VirtualizableTrajectoryRecord,
} from '../src/client/trajectory-virtual-rows.ts'

function record(
  index: number,
  cell: Partial<TrajectoryCellProps> = {},
  extra: Partial<Pick<VirtualizableTrajectoryRecord, 'collapsedSummaryKind' | 'rowHeight'>> = {},
): VirtualizableTrajectoryRecord {
  return {
    cell: {
      index,
      kind: 'message',
      text: `record ${index}`,
      timeSeconds: 0,
      ...cell,
    },
    ...extra,
  }
}

describe('trajectory virtual rows', () => {
  it('projects one measurable row per record with logical positions', () => {
    const first = record(1, { sourceSeq: 10 })
    const second = record(2, { sourceSeq: 11 })

    expect(projectTrajectoryVirtualRows([first, second])).toEqual([{
      entries: [{ logicalIndex: 0, record: first }],
      height: 38,
      key: trajectoryVirtualRecordKey(first),
    }, {
      entries: [{ logicalIndex: 1, record: second }],
      height: 38,
      key: trajectoryVirtualRecordKey(second),
    }])
  })

  it('uses the rendered collapsed-summary height', () => {
    const summary = record(1, { sourceSeq: 10 }, { collapsedSummaryKind: 'turn' })

    expect(projectTrajectoryVirtualRows([summary])[0]?.height).toBe(28)
  })

  it('honors the explicit structural row height', () => {
    const head = record(1, { recordId: 'turn-head\u00003' }, { rowHeight: 44 })

    expect(projectTrajectoryVirtualRows([head])[0]?.height).toBe(44)
  })

  it('keeps an existing row key stable when older history is prepended', () => {
    const existing = record(2, { sourceSeq: 100 })
    const prepended = record(1, { sourceSeq: 10 })

    const before = projectTrajectoryVirtualRows([existing])[0]?.key
    const after = projectTrajectoryVirtualRows([prepended, existing])[1]?.key

    expect(after).toBe(before)
  })

  it('distinguishes a folded summary from its source record', () => {
    const source = record(1, { sourceSeq: 10 })
    const summary = record(1, { sourceSeq: 10 }, { collapsedSummaryKind: 'assistant' })

    expect(trajectoryVirtualRecordKey(summary)).not.toBe(trajectoryVirtualRecordKey(source))
  })

  it('exposes a DOM-safe semantic key', () => {
    const source = record(1, { callId: 'call with spaces/and?punctuation' })

    expect(trajectoryVirtualRecordKey(source)).toBe(
      'message%00call%00call%20with%20spaces%2Fand%3Fpunctuation',
    )
  })
})
