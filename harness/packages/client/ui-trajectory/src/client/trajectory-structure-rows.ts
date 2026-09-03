/**
 * Pure projection that decorates the folded/searched ledger with structural
 * rows: one turn-head strip per numbered turn and one step separator per
 * Step/Compaction group. Synthetic rows carry a fabricated cell whose stable
 * `recordId` keys virtual rows without ever colliding with real records.
 */
import type { TrajectoryCellProps } from './trajectory-record.ts'
import { trajectoryPreviewText } from './trajectory-preview.ts'

/** Metrics rendered on the turn-head strip. */
export interface TurnHeadData {
  /** Turn number shown in the `Tn` chip. */
  turn: number
  /** First user-visible message preview used as the strip title. */
  title: string
  /** Count of `Step N` groups in the turn. */
  steps: number
  /** Count of tool and subtool records in the turn. */
  calls: number
  /** Wall-clock span seconds, or null when no time is recorded. */
  seconds: number | null
  /** Sum of recorded input+output tokens, or null when no usage is recorded. */
  tokens: number | null
  /** Whether the turn has more than one content record to fold. */
  collapsible: boolean
  /** Whether the turn is currently folded. */
  collapsed: boolean
  /** Whether the turn holds the active inspector selection. */
  active: boolean
}

/** One request-group separator between the turn head and its records. */
export interface StepRowData {
  /** Group label rendered in mono (`Step 2` or `Compaction`). */
  label: string
  /** Session-global request number for the group, when numbered. */
  requestNumber: number | undefined
  /** Request status driving the number chip's color. */
  requestStatus: 'running' | 'error' | undefined
  /** Group wall-clock span seconds for the trailing label. */
  seconds: number | null
}

/** Fields a structural row adds beside the base ledger record shape. */
export interface StructuralRowFields {
  head?: TurnHeadData
  step?: StepRowData
  /** Explicit virtual-row height; absent means the content default. */
  rowHeight?: number
}

/** Minimal base-record shape this decorator reads and returns. */
export interface DecoratableLedgerRow {
  section: number
  group: string
  cell: TrajectoryCellProps
  collapsedSummary?: string
  collapsedSummaryKind?: 'turn' | 'assistant'
}

export interface TrajectoryTurnModelLike {
  turn: number | null
  groups: readonly { title: string; cells: readonly TrajectoryCellProps[] }[]
}

export interface DecorateLedgerOptions {
  /** Search results flatten groups, so separators are suppressed. */
  searchMode: boolean
  /** Turn ids currently folded. */
  collapsedTurns: ReadonlySet<number>
  /** Request identity per `${turn}\u0000${group}` key. */
  requests: ReadonlyMap<string, { number: number; status?: 'running' | 'error' | 'complete' }>
  /** Turn holding the active record/request selection. */
  activeTurn: number | null | undefined
}

export const TURN_HEAD_HEIGHT = 44
export const STEP_ROW_HEIGHT = 26

function requestKey(turn: number | null, group: string): string {
  return `${turn}\u0000${group}`
}

function isContentCell(cell: TrajectoryCellProps): boolean {
  return cell.requestOnly !== true && cell.kind !== 'system'
}

/** Wall-clock span seconds across cells; null when nothing is time-stamped. */
export function groupWallSpanSeconds(
  cells: readonly TrajectoryCellProps[],
): number | null {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const cell of cells) {
    const startedAt = cell.startedAt
    if (startedAt === undefined || startedAt === null || !Number.isFinite(startedAt)) continue
    start = Math.min(start, startedAt)
    const own = cell.timeSeconds
    const finish = own !== null && Number.isFinite(own)
      ? startedAt + own * 1000
      : startedAt
    end = Math.max(end, finish)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, (end - start) / 1000)
}

function turnTokens(
  groups: readonly { cells: readonly TrajectoryCellProps[] }[],
): number | null {
  let total: number | null = null
  for (const group of groups) {
    for (const cell of group.cells) {
      if (cell.requestOnly === true) continue
      const sum = (cell.input ?? 0) + (cell.output ?? 0)
      if (cell.input === undefined && cell.output === undefined) continue
      total = (total ?? 0) + sum
    }
  }
  return total
}

function headTitle(
  groups: readonly { cells: readonly TrajectoryCellProps[] }[],
): string {
  const cells = groups.flatMap(group => group.cells)
  const opener = cells.find(cell => cell.kind === 'user' && cell.opensTurn === true)
    ?? cells.find(cell => isContentCell(cell))
  if (opener === undefined) return ''
  if (opener.previewMarkdown !== undefined) return trajectoryPreviewText(opener.previewMarkdown)
  return opener.text
}

function syntheticCell(recordId: string, index: number): TrajectoryCellProps {
  return {
    index,
    recordId,
    kind: 'message',
    text: '',
    timeSeconds: null,
  }
}

function stepSeconds(
  turns: readonly TrajectoryTurnModelLike[],
  section: number,
  group: string,
): number | null {
  const model = turns[section]?.groups.find(candidate => candidate.title === group)
  if (model === undefined) return null
  return groupWallSpanSeconds(model.cells)
}

/**
 * Insert turn-head and step-separator rows into a folded/searched ledger.
 * Inserted rows carry only the structural fields plus the base identity;
 * consumers must branch on `head`/`step` before reading business fields.
 * @param rows - Final fold/search projection in ledger order.
 * @param turns - Turn models providing per-section metrics and group identity.
 * @param options - Fold, numbering, search, and selection context.
 * @returns Rows with structural rows interleaved; base rows pass through untouched.
 */
export function decorateLedgerRows<
  T extends DecoratableLedgerRow,
>(
  rows: readonly T[],
  turns: readonly TrajectoryTurnModelLike[],
  options: DecorateLedgerOptions,
): readonly (T & StructuralRowFields)[] {
  // Structural rows satisfy the base identity fields and the structural
  // payload; the caller's remaining record fields stay absent by design.
  const synthetic = (fields: DecoratableLedgerRow & StructuralRowFields) =>
    fields as unknown as T & StructuralRowFields
  const out: (T & StructuralRowFields)[] = []
  let previousSection: number | null = null
  let previousGroup: string | null = null
  let separatorSuffix = 0
  let syntheticIndex = -1
  for (const row of rows) {
    if (row.section !== previousSection) {
      previousSection = row.section
      previousGroup = null
      const model = turns[row.section]
      const turn = model?.turn ?? null
      if (model !== undefined && turn !== null) {
        const contentCount = model.groups.reduce(
          (count, group) => count + group.cells.filter(isContentCell).length,
          0,
        )
        if (contentCount >= 1) {
          const steps = model.groups.filter(
            group => group.title.startsWith('Step '),
          ).length
          const calls = model.groups.reduce(
            (count, group) => count + group.cells.filter(cell =>
              cell.requestOnly !== true
              && (cell.kind === 'tool' || cell.kind === 'subtool')).length,
            0,
          )
          out.push(synthetic({
            cell: syntheticCell(`turn-head\u0000${turn}`, --syntheticIndex),
            section: row.section,
            group: row.group,
            rowHeight: TURN_HEAD_HEIGHT,
            head: {
              turn,
              title: headTitle(model.groups),
              steps,
              calls,
              seconds: groupWallSpanSeconds(model.groups.flatMap(group => group.cells)),
              tokens: turnTokens(model.groups),
              collapsible: contentCount > 1,
              collapsed: options.collapsedTurns.has(turn),
              active: options.activeTurn === turn,
            },
          }))
        }
      }
    }
    const isNewGroup = row.group !== previousGroup
    if (isNewGroup) separatorSuffix = 0
    const modelTurn = turns[row.section]?.turn ?? null
    // A group is a separator candidate when it carries a request identity
    // (data-driven, locale-independent) or follows the layout title
    // conventions the spec fixtures use.
    const isSeparatorGroup = row.group.startsWith('Step ')
      || row.group.startsWith('Compaction')
      || options.requests.has(requestKey(modelTurn, row.group))
    const wantsSeparator = !options.searchMode
      && isSeparatorGroup
      && row.collapsedSummary === undefined
      && (isNewGroup || row.cell.requestOnly === true)
    if (wantsSeparator) {
      separatorSuffix += 1
      const model = turns[row.section]
      const request = options.requests.get(requestKey(model?.turn ?? null, row.group))
      const seconds = stepSeconds(turns, row.section, row.group)
      const status = request?.status === 'running'
        ? 'running' as const
        : request?.status === 'error' || row.cell.isError === true
          ? 'error' as const
          : undefined
      if (request !== undefined || seconds !== null || row.cell.requestOnly === true) {
        out.push(synthetic({
          cell: syntheticCell(
            `step-row\u0000${row.section}\u0000${row.group}\u0000${separatorSuffix}`,
            --syntheticIndex,
          ),
          section: row.section,
          group: row.group,
          rowHeight: STEP_ROW_HEIGHT,
          step: {
            label: row.group.startsWith('Compaction') ? 'Compaction' : row.group,
            requestNumber: isNewGroup ? request?.number : undefined,
            requestStatus: status,
            seconds,
          },
        }))
      }
    }
    previousGroup = row.group
    if (row.cell.requestOnly === true) continue
    out.push(row)
  }
  return out
}

/** Format turn-head token totals: `1,234` below 10k, otherwise compact `k`/`M`. */
export function formatTokenSummary(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 10_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
