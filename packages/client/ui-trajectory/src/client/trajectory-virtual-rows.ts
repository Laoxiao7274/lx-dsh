/** Pure projection from trajectory records to measurable virtual ledger rows. */

import type { TrajectoryCellProps } from './trajectory-record.ts'
import { trajectoryRecordId } from './trajectory-record.ts'

const CONTENT_ROW_HEIGHT = 38
const COLLAPSED_SUMMARY_HEIGHT = 28

/** Minimal record shape required by the trajectory virtual-row projection. */
export interface VirtualizableTrajectoryRecord {
  cell: TrajectoryCellProps
  collapsedSummaryKind?: 'turn' | 'assistant'
  /** Explicit row height for structural rows; absent means the content default. */
  rowHeight?: number
}

/** One logical record retained inside a measurable virtual row. */
export interface TrajectoryVirtualRowEntry<T extends VirtualizableTrajectoryRecord> {
  logicalIndex: number
  record: T
}

/** One virtualizer item carrying exactly one ledger row. */
export interface TrajectoryVirtualRow<T extends VirtualizableTrajectoryRecord> {
  entries: readonly TrajectoryVirtualRowEntry<T>[]
  height: number
  key: string
}

/**
 * Derive the DOM-safe row identity shared by React, the virtualizer, and
 * browser scroll contracts.
 * @param record - Display record whose identity is required.
 * @returns Stable record identity with a suffix for synthetic fold summaries.
 */
export function trajectoryVirtualRecordKey(
  record: VirtualizableTrajectoryRecord,
): string {
  const identity = encodeURIComponent(trajectoryRecordId(record.cell))
  return record.collapsedSummaryKind === undefined
    ? identity
    : `${identity}\u0000summary\u0000${record.collapsedSummaryKind}`
}

/**
 * Project the final ledger into one measurable virtual row per record.
 * Structural rows (turn heads, step separators) carry their own rowHeight.
 * @param records - Final structural projection in ledger order.
 * @returns Measurable virtual rows with logical positions retained.
 */
export function projectTrajectoryVirtualRows<T extends VirtualizableTrajectoryRecord>(
  records: readonly T[],
): readonly TrajectoryVirtualRow<T>[] {
  return records.map((record, logicalIndex) => ({
    entries: [{ logicalIndex, record }],
    height: record.rowHeight ?? (record.collapsedSummaryKind === undefined
      ? CONTENT_ROW_HEIGHT
      : COLLAPSED_SUMMARY_HEIGHT),
    key: trajectoryVirtualRecordKey(record),
  }))
}
