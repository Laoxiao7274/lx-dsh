/** parseCsv: RFC 4180 fields, quotes, line endings, and the row cap. */
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../src/client/csv.ts'

describe('parseCsv', () => {
  it('splits plain rows and cells', () => {
    expect(parseCsv('a,b\nc,d', 100).rows).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps quoted commas and doubled quotes in one cell', () => {
    expect(parseCsv('"x,y","he said ""hi"""', 100).rows).toEqual([['x,y', 'he said "hi"']])
  })

  it('accepts CRLF, CR, and LF line endings', () => {
    expect(parseCsv('a\r\nb\rc\nd', 100).rows).toEqual([['a'], ['b'], ['c'], ['d']])
  })

  it('preserves empty cells and quoted empties', () => {
    expect(parseCsv('a,,c', 100).rows).toEqual([['a', '', 'c']])
    expect(parseCsv('"",x', 100).rows).toEqual([['', 'x']])
  })

  it('drops the trailing blank record but keeps an incomplete last row', () => {
    expect(parseCsv('a,b\n', 100).rows).toEqual([['a', 'b']])
    expect(parseCsv('a,b\n"wait', 100).rows).toEqual([['a', 'b'], ['wait']])
  })

  it('caps rows for preview', () => {
    const text = Array.from({ length: 5 }, (_, i) => `r${String(i)}`).join('\n')
    expect(parseCsv(text, 3).rows).toHaveLength(3)
  })

  it('parses an empty document to no rows', () => {
    expect(parseCsv('', 100).rows).toEqual([])
  })
})
