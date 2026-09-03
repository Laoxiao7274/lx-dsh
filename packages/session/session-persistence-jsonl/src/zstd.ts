/**
 * Zstandard frame primitives for the JSONL persistence backend. The backend
 * owns a concatenated-frame container so it can append and recover batches
 * without exposing compression mechanics through the persistence seam.
 * @module dsh-session-persistence-jsonl/zstd
 */

import {
  constants, zstdCompress, zstdDecompress, type ZstdOptions,
} from 'node:zlib'
import { promisify } from 'node:util'
import { NodePrivateZstdFrameDecoder } from './zstd-private-decoder.ts'
import { PublicZstdFrameDecoder } from './zstd-public-decoder.ts'

const ZSTD_MAGIC = 0xFD2FB528
const zstdCompressAsync = promisify(zstdCompress)
const zstdDecompressAsync = promisify(zstdDecompress)
const CHECKSUM_OPTIONS: ZstdOptions = {
  params: { [constants.ZSTD_c_checksumFlag]: 1 },
}
const INCOMPLETE_FRAME_OPTIONS: ZstdOptions = {
  finishFlush: constants.ZSTD_e_flush,
}

/** Byte range occupied by one structurally complete Zstandard frame. */
export interface ZstdFrameRange {
  /** Inclusive frame start. */
  start: number
  /** Exclusive frame end. */
  end: number
}

/** Structural scan result for a concatenated Zstandard stream. */
export interface ZstdFrameScan {
  /** Complete frames in file order. */
  frames: ZstdFrameRange[]
  /** Start of an incomplete final frame, when EOF interrupts one. */
  tornStart?: number
}

/**
 * Locate complete frames without decompressing their blocks. Invalid complete
 * structure rejects; EOF inside the final frame returns its start for repair.
 * @param buffer - complete bytes currently present in the session artifact.
 * @param maxFrames - optional complete-frame limit for metadata-only readers.
 * @returns complete frame ranges and an optional incomplete-final-frame start.
 */
export function scanZstdFrames(buffer: Buffer, maxFrames = Number.POSITIVE_INFINITY): ZstdFrameScan {
  const frames: ZstdFrameRange[] = []
  let offset = 0

  while (offset < buffer.length) {
    const start = offset
    const scanned = scanZstdFrameAt(buffer, start)
    if ('tornStart' in scanned) return { frames, tornStart: start }
    if ('reason' in scanned) {
      throw new Error(`corrupt Zstandard session log: ${scanned.reason}`)
    }
    offset = scanned.end
    frames.push({ start, end: offset })
    if (frames.length === maxFrames) return { frames }
  }

  return { frames }
}

/**
 * Salvage variant of {@link scanZstdFrames}: identical frame search, but
 * structurally corrupt bytes stop the scan instead of rejecting it, so a
 * reader can keep every frame before the corruption and repair the rest.
 * @param buffer - complete bytes currently present in the session artifact.
 * @returns complete frame ranges, an optional incomplete-final-frame start,
 * and the start of the first structurally corrupt frame.
 */
export function scanZstdFramesSalvage(buffer: Buffer): ZstdFrameScan & { corruptStart?: number } {
  const frames: ZstdFrameRange[] = []
  let offset = 0

  while (offset < buffer.length) {
    const start = offset
    const scanned = scanZstdFrameAt(buffer, start)
    if ('tornStart' in scanned) return { frames, tornStart: start }
    if ('reason' in scanned) return { frames, corruptStart: start }
    offset = scanned.end
    frames.push({ start, end: offset })
  }

  return { frames }
}

/**
 * Scan the single frame beginning at `start` without decompressing its blocks.
 * @param buffer - complete bytes currently present in the session artifact.
 * @param start - candidate frame start (must point at the frame magic).
 * @returns the exclusive frame end, a torn-frame marker when EOF interrupts
 * the frame, or the structural refusal describing the corruption.
 */
function scanZstdFrameAt(
  buffer: Buffer,
  start: number,
): { end: number } | { tornStart: true } | { reason: string } {
  let offset = start
  if (buffer.length - offset < 4) return { tornStart: true }
  if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
    return { reason: `invalid frame magic at byte ${offset}` }
  }
  offset += 4

  if (offset === buffer.length) return { tornStart: true }
  const descriptor = buffer.readUInt8(offset)
  offset += 1
  if ((descriptor & 0x18) !== 0) {
    return { reason: `reserved frame-header bit at byte ${offset - 1}` }
  }

  const contentSizeFlag = descriptor >>> 6
  const singleSegment = (descriptor & 0x20) !== 0
  const checksum = (descriptor & 0x04) !== 0
  const dictionaryFlag = descriptor & 0x03
  const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
  const contentSizeBytes = contentSizeFlag === 0
    ? (singleSegment ? 1 : 0)
    : 1 << contentSizeFlag
  const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
  if (buffer.length - offset < remainingHeaderBytes) return { tornStart: true }
  offset += remainingHeaderBytes

  for (;;) {
    if (buffer.length - offset < 3) return { tornStart: true }
    const blockHeader = buffer.readUIntLE(offset, 3)
    offset += 3
    const lastBlock = (blockHeader & 1) !== 0
    const blockType = (blockHeader >>> 1) & 0x03
    const blockSize = blockHeader >>> 3
    if (blockType === 0x03) {
      return { reason: `reserved block type at byte ${offset - 3}` }
    }
    const payloadBytes = blockType === 0x01 ? 1 : blockSize
    if (buffer.length - offset < payloadBytes) return { tornStart: true }
    offset += payloadBytes
    if (lastBlock) break
  }

  if (checksum) {
    if (buffer.length - offset < 4) return { tornStart: true }
    offset += 4
  }
  return { end: offset }
}

/**
 * Compress one independently decodable, checksummed Zstandard frame.
 * @param input - JSONL bytes for a header or durable event batch.
 * @returns the complete encoded frame.
 */
export async function compressZstdFrame(input: Buffer | string): Promise<Buffer> {
  return zstdCompressAsync(input, CHECKSUM_OPTIONS)
}

/**
 * Decompress one complete frame and validate its checksum.
 * @param input - one structurally complete Zstandard frame.
 * @returns the frame plaintext.
 */
export async function decompressZstdFrame(input: Buffer): Promise<Buffer> {
  return zstdDecompressAsync(input)
}

/** Common lifecycle for interchangeable synchronous multi-frame decoders. */
export interface ZstdFrameDecoder {
  /**
   * Decode and checksum complete frames in source order. Each yielded buffer
   * remains valid only until the iterator advances to the next frame.
   * @param source - concatenated Zstandard frame bytes.
   * @param frames - structurally complete ranges within `source`.
   * @returns one plaintext buffer per frame.
   */
  decode(source: Buffer, frames: readonly ZstdFrameRange[]): Generator<Buffer, void, void>
  /** Release decoder-owned resources; repeated calls are harmless. */
  close(): void
}

/**
 * Select the shared private decoder when the running Node 22/24/26 shape is
 * compatible, otherwise preserve correctness with the public one-shot API.
 * @returns a synchronous decoder with an implementation-independent lifecycle.
 */
export function createZstdFrameDecoder(): ZstdFrameDecoder {
  return NodePrivateZstdFrameDecoder.create() ?? new PublicZstdFrameDecoder()
}

/**
 * Recover available plaintext from a structurally incomplete final frame.
 * `ZSTD_e_flush` deliberately suppresses final-frame and checksum completion;
 * callers must establish the torn frame boundary before using this helper.
 * @param input - available bytes from a known incomplete Zstandard frame.
 * @returns plaintext produced from the available input.
 */
export async function decompressZstdPrefix(input: Buffer): Promise<Buffer> {
  return zstdDecompressAsync(input, INCOMPLETE_FRAME_OPTIONS)
}
