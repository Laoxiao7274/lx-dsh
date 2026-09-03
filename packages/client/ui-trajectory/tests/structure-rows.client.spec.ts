/** Turn-head/step-separator decoration of the folded ledger. */

import { describe, expect, it } from 'vitest'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import type { TrajectoryTurnModel } from '../src/client/layout.ts'
import {
  decorateLedgerRows, formatTokenSummary, groupWallSpanSeconds,
  STEP_ROW_HEIGHT, TURN_HEAD_HEIGHT,
  type DecoratableLedgerRow, type StructuralRowFields,
} from '../src/client/trajectory-structure-rows.ts'

function cell(index: number, extra: Partial<TrajectoryCellProps> = {}): TrajectoryCellProps {
  return { index, kind: 'message', text: `record ${index}`, timeSeconds: 0, ...extra }
}

function row(
  section: number,
  group: string,
  cellValue: TrajectoryCellProps,
  extra: Partial<DecoratableLedgerRow> = {},
): DecoratableLedgerRow {
  return { section, group, cell: cellValue, ...extra }
}

const DEFAULTS = {
  searchMode: false,
  collapsedTurns: new Set<number>(),
  requests: new Map<string, { number: number; status?: 'running' | 'error' | 'complete' }>(),
  activeTurn: undefined,
}

type Decorated = DecoratableLedgerRow & StructuralRowFields

function headOf(entry: Decorated | undefined) {
  return entry !== undefined && 'head' in entry ? entry.head : undefined
}

function stepOf(entry: Decorated | undefined) {
  return entry !== undefined && 'step' in entry ? entry.step : undefined
}

function heightOf(entry: Decorated | undefined) {
  return entry !== undefined && 'rowHeight' in entry ? entry.rowHeight : undefined
}

describe('decorateLedgerRows', () => {
  it('emits nothing for an empty ledger', () => {
    expect(decorateLedgerRows([], [], DEFAULTS)).toEqual([])
  })

  it('inserts a turn head with metrics before a multi-record turn', () => {
    const opener = cell(1, {
      kind: 'user', text: '', opensTurn: true, previewMarkdown: 'repair log corruption',
    })
    const turns: TrajectoryTurnModel[] = [{
      turn: 2,
      groups: [
        { title: 'Message', cells: [opener] },
        {
          title: 'Step 1',
          cells: [
            cell(2, { input: 1_000, output: 200, startedAt: 1_000, timeSeconds: 2 }),
            cell(3, { kind: 'tool', startedAt: 3_000, timeSeconds: 1 }),
          ],
        },
      ],
    }]
    const rows = [
      row(0, 'Message', opener),
      row(0, 'Step 1', cell(2)),
      row(0, 'Step 1', cell(3, { kind: 'tool' })),
    ]

    const decorated = decorateLedgerRows(rows, turns, {
      ...DEFAULTS,
      requests: new Map([['2\u0000Step 1', { number: 4, status: 'complete' }]]),
      activeTurn: 2,
    })

    expect(headOf(decorated[0])).toEqual({
      turn: 2,
      title: 'repair log corruption',
      steps: 1,
      calls: 1,
      seconds: 3,
      tokens: 1_200,
      collapsible: true,
      collapsed: false,
      active: true,
    })
    expect(heightOf(decorated[0])).toBe(TURN_HEAD_HEIGHT)
    expect(stepOf(decorated[2])).toMatchObject({
      label: 'Step 1', requestNumber: 4, requestStatus: undefined, seconds: 3,
    })
    expect(heightOf(decorated[2])).toBe(STEP_ROW_HEIGHT)
  })

  it('heads a single-record turn without a fold affordance and skips null turns', () => {
    const single = decorateLedgerRows(
      [row(0, 'Message', cell(1))],
      [{ turn: 1, groups: [{ title: 'Message', cells: [cell(1)] }] }],
      DEFAULTS,
    )
    expect(headOf(single[0])).toMatchObject({ turn: 1, collapsible: false, steps: 0, calls: 0 })

    const standalone = decorateLedgerRows(
      [row(0, 'Compaction 9', cell(1, { kind: 'compacted' }))],
      [{ turn: null, groups: [{ title: 'Compaction 9', cells: [cell(1, { kind: 'compacted' })] }] }],
      DEFAULTS,
    )
    expect(standalone.every(entry => headOf(entry) === undefined)).toBe(true)
  })

  it('marks the head collapsed when the turn folds', () => {
    const turns: TrajectoryTurnModel[] = [{
      turn: 1,
      groups: [{ title: 'Step 1', cells: [cell(1), cell(2)] }],
    }]
    const rows = [row(0, 'Step 1', cell(1))]
    const decorated = decorateLedgerRows(rows, turns, {
      ...DEFAULTS,
      collapsedTurns: new Set([1]),
    })
    expect(headOf(decorated[0])?.collapsed).toBe(true)
    expect(headOf(decorated[0])?.title).toBe('record 1')
  })

  it('suppresses step separators while searching', () => {
    const turns: TrajectoryTurnModel[] = [{
      turn: 1,
      groups: [{ title: 'Step 1', cells: [cell(1), cell(2)] }],
    }]
    const rows = [row(0, 'Step 1', cell(1))]
    const decorated = decorateLedgerRows(rows, turns, { ...DEFAULTS, searchMode: true })
    expect(decorated.filter(entry => stepOf(entry) !== undefined)).toHaveLength(0)
    expect(headOf(decorated[0])).toBeDefined()
  })

  it('labels compaction groups and flags running and error requests', () => {
    const turns: TrajectoryTurnModel[] = [
      { turn: 1, groups: [{ title: 'Step 1', cells: [cell(1)] }] },
      {
        turn: null,
        groups: [{ title: 'Compaction 9', cells: [cell(2, { kind: 'compacted' })] }],
      },
    ]
    const rows = [
      row(0, 'Step 1', cell(1)),
      row(1, 'Compaction 9', cell(2, { kind: 'compacted' })),
    ]
    const decorated = decorateLedgerRows(rows, turns, {
      ...DEFAULTS,
      requests: new Map([
        ['1\u0000Step 1', { number: 2, status: 'running' }],
        ['null\u0000Compaction 9', { number: 3, status: 'error' }],
      ]),
    })
    const step = decorated.map(stepOf).find(candidate => candidate?.label === 'Step 1')
    const compaction = decorated.map(stepOf).find(candidate => candidate?.label === 'Compaction')
    expect(step).toMatchObject({ requestNumber: 2, requestStatus: 'running' })
    expect(compaction).toMatchObject({ requestNumber: 3, requestStatus: 'error' })
  })

  it('renders request-only groups as separator rows with error state', () => {
    const failed = cell(1, { requestOnly: true, isError: true, sourceSeq: 9 })
    const turns: TrajectoryTurnModel[] = [{
      turn: 1,
      groups: [{ title: 'Step 1', cells: [failed] }],
    }]
    const decorated = decorateLedgerRows([row(0, 'Step 1', failed)], turns, DEFAULTS)
    expect(decorated).toHaveLength(1)
    expect(stepOf(decorated[0])).toMatchObject({ label: 'Step 1', requestStatus: 'error' })
  })

  it('skips separators without a number or duration and skips summaries', () => {
    const turns: TrajectoryTurnModel[] = [{
      turn: 1,
      groups: [
        { title: 'Message', cells: [cell(1), cell(2)] },
        { title: 'Step 1', cells: [cell(3)] },
      ],
    }]
    const rows = [
      row(0, 'Message', cell(1)),
      row(0, 'Step 1', cell(3), {
        collapsedSummary: '2 steps and 0 tool calls',
        collapsedSummaryKind: 'turn',
      }),
    ]
    const decorated = decorateLedgerRows(rows, turns, DEFAULTS)
    expect(decorated.filter(entry => stepOf(entry) !== undefined)).toHaveLength(0)
  })
})

describe('groupWallSpanSeconds', () => {
  it('returns null without any timestamped cell', () => {
    expect(groupWallSpanSeconds([cell(1), cell(2, { startedAt: null })])).toBeNull()
  })

  it('spans from the earliest start to the latest finish', () => {
    expect(groupWallSpanSeconds([
      cell(1, { startedAt: 5_000, timeSeconds: null }),
      cell(2, { startedAt: 1_000, timeSeconds: 2 }),
    ])).toBe(4)
  })
})

describe('formatTokenSummary', () => {
  it('expands small totals and compacts large ones', () => {
    expect(formatTokenSummary(1_234)).toBe('1,234')
    expect(formatTokenSummary(12_403)).toBe('12k')
    expect(formatTokenSummary(1_234_567)).toBe('1.2M')
  })
})
