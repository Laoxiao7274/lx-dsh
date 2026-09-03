/** Background store: file lifecycle, media-type sniffing, and size caps.
 * Node-environment lane (no jsdom pragma): the store is pure Node. */
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BACKGROUND_MAX_BYTES, appearanceDir, clearBackground, readBackground, writeBackground,
} from '../src/background-store.ts'

let home = ''

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-theme-background-'))
  process.env.DSH_HOME = home
})

afterAll(() => {
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

/** One valid 1x1 PNG. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63fcffff3f0300050201ebcaa0ab0000000049454e44ae426082',
  'hex',
)

describe('background store', () => {
  it('write then read round-trips the bytes and sniffs the media type', async () => {
    const row = writeBackground(PNG, 'image/png', 0.5)
    expect(row).toMatchObject({ fileName: 'background.img', mediaType: 'image/png', opacity: 0.5 })
    const stored = await readBackground()
    expect(stored?.bytes.equals(PNG)).toBe(true)
    expect(stored?.mediaType).toBe('image/png')
    expect(existsSync(join(appearanceDir(), 'background.img'))).toBe(true)
    clearBackground()
  })

  it('write rejects unsupported media types and oversized payloads', () => {
    expect(() => { writeBackground(PNG, 'text/html', 0.5) }).toThrow(/unsupported background media type/)
    const big = Buffer.concat([PNG, Buffer.alloc(BACKGROUND_MAX_BYTES)])
    expect(() => { writeBackground(big, 'image/png', 0.5) }).toThrow(/exceeds/)
  })

  it('clear removes the file and read returns null without one', async () => {
    writeBackground(PNG, 'image/png', 1)
    clearBackground()
    expect(await readBackground()).toBeNull()
    // Clearing again is a no-op.
    expect(() => { clearBackground() }).not.toThrow()
  })

  it('replaces the stored image atomically on a second write', async () => {
    writeBackground(PNG, 'image/png', 1)
    const jpeg = Buffer.from('ffd8ffe000104a46494600', 'hex')
    writeBackground(jpeg, 'image/jpeg', 0.7)
    const stored = await readBackground()
    expect(stored?.mediaType).toBe('image/jpeg')
    expect(stored?.bytes.equals(jpeg)).toBe(true)
    clearBackground()
  })
})
