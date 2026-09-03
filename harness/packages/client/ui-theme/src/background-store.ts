/**
 * Host-side background-image store: one durable image file under
 * `$DSH_HOME/appearance/` plus its settings row, served over the webserver at
 * `/api/ui-theme/background`. The store owns the whole lifecycle — the
 * settings section records the file name and display options, and the file
 * plus the row always move together (upload replaces both atomically, clear
 * removes both). Pure Node, no browser types.
 */

import {
  createReadStream, existsSync, mkdirSync, openSync, readSync, closeSync,
  renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Directory holding the durable background image (created on demand). */
const APPEARANCE_DIR = 'appearance'
/** The one served background file name (single-slot store). */
export const BACKGROUND_FILE = 'background.img'
/** Hard upload cap: 8 MiB keeps the route a settings toggle, not a media sink. */
export const BACKGROUND_MAX_BYTES = 8 * 1024 * 1024

/** Browser-declared image types accepted on upload. */
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

/** Durable appearance section value. */
export interface BackgroundSettings {
  /** Stored file base name; always {@link BACKGROUND_FILE} while set. */
  fileName: string
  /** Declared media type of the stored file. */
  mediaType: string
  /** Background opacity 0..1 over the base palette (1 = fully visible). */
  opacity: number
}

/**
 * Resolve the appearance directory (creating it) under the harness home.
 * @returns the absolute directory path.
 */
export function appearanceDir(): string {
  const dir = join(resolveDshHome(), APPEARANCE_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Sniff the media type from magic bytes; falls back to the declared value. */
function sniffMediaType(bytes: Buffer, declared?: string): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif'
  return declared ?? 'application/octet-stream'
}

/**
 * Read the stored background bytes, or null when none is set.
 * @returns the file bytes and declared media type.
 */
export async function readBackground(): Promise<{ bytes: Buffer; mediaType: string } | null> {
  const file = join(appearanceDir(), BACKGROUND_FILE)
  if (!existsSync(file)) return null
  try {
    const bytes = await readFile(file)
    return { bytes, mediaType: sniffMediaType(bytes) }
  } catch {
    return null
  }
}

/**
 * Atomically replace the stored background image and return its settings row.
 * Rejects non-image or oversized payloads.
 * @param bytes - the uploaded image bytes.
 * @param mediaType - the browser-declared media type.
 * @param opacity - initial display opacity.
 * @returns the durable settings value.
 */
export function writeBackground(
  bytes: Buffer,
  mediaType: string,
  opacity: number,
): BackgroundSettings {
  if (!ACCEPTED_TYPES.has(mediaType)) {
    throw new Error(`unsupported background media type: ${mediaType || '(none)'}`)
  }
  if (bytes.byteLength > BACKGROUND_MAX_BYTES) {
    throw new Error(`background exceeds ${BACKGROUND_MAX_BYTES} bytes`)
  }
  sniffMediaType(bytes, mediaType)
  const dir = appearanceDir()
  const staged = join(dir, `${BACKGROUND_FILE}.tmp`)
  writeFileSync(staged, bytes)
  renameSync(staged, join(dir, BACKGROUND_FILE))
  return { fileName: BACKGROUND_FILE, mediaType, opacity }
}

/**
 * Remove the stored background image (a missing file is already cleared).
 */
export function clearBackground(): void {
  const file = join(appearanceDir(), BACKGROUND_FILE)
  if (existsSync(file)) unlinkSync(file)
}

/** Serve the stored background image (or a 404) for one request. */
export function serveBackground(_req: IncomingMessage, res: ServerResponse): void {
  const file = join(appearanceDir(), BACKGROUND_FILE)
  if (!existsSync(file)) {
    res.statusCode = 404
    res.end('no background')
    return
  }
  try {
    const size = statSync(file).size
    const head = Buffer.alloc(16)
    const fd = openSync(file, 'r')
    try {
      readSync(fd, head, 0, head.length, 0)
    } finally {
      closeSync(fd)
    }
    res.statusCode = 200
    res.setHeader('content-type', sniffMediaType(head))
    res.setHeader('content-length', String(size))
    res.setHeader('cache-control', 'no-store')
    createReadStream(file).pipe(res)
  } catch {
    res.statusCode = 404
    res.end('background read failed')
  }
}

/** Read one JSON request body with the upload cap; rejects oversized sends. */
export function readJsonBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    req.on('data', (chunk: Buffer) => {
      received += chunk.byteLength
      if (received > BACKGROUND_MAX_BYTES) {
        reject(new Error(`background exceeds ${BACKGROUND_MAX_BYTES} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks)) })
    req.on('error', reject)
  })
}
