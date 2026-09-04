/** RFC 4180 CSV parsing for the artifact preview's table view. @module */

/** One parsed row of string cells. */
export type CsvRow = readonly string[]

/** Parse result: rows (header first when present) and the detected delimiter. */
export interface CsvParseResult {
  readonly rows: readonly CsvRow[]
}

/**
 * Parse CSV text into rows. Handles quoted fields with embedded commas,
 * quotes doubled per RFC 4180, CRLF/CR/LF line breaks, and a trailing
 * incomplete record. Delimiter is comma; cells are verbatim strings.
 * @param text - whole decoded file text.
 * @param maxRows - hard row cap for preview; additional rows are dropped.
 * @returns parsed rows, possibly fewer than the file contains.
 */
export function parseCsv(text: string, maxRows: number): CsvParseResult {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let cellWasQuoted = false
  let i = 0
  const push = (): void => {
    if (cellWasQuoted || cell !== '' || row.length > 0) row.push(cell)
    cell = ''
    cellWasQuoted = false
  }
  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += char
      i++
      continue
    }
    if (char === '"' && cell === '' && !cellWasQuoted) {
      inQuotes = true
      cellWasQuoted = true
      i++
      continue
    }
    if (char === ',') {
      push()
      i++
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      push()
      if (row.length > 0 || rows.length === 0) {
        if (rows.length < maxRows) rows.push(row)
      }
      row = []
      i++
      continue
    }
    cell += char
    i++
  }
  push()
  if (row.length > 0 && rows.length < maxRows) rows.push(row)
  return { rows }
}
