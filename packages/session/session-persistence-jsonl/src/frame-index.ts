/**
 * Frame index for seek-capable suffix reads over a concatenated-Zstandard
 * session log. One {@link FrameIndexEntry} per event batch frame, written
 * beside the log as a JSON sidecar and consulted by
 * {@link JsonlSessionPersistence.loadStoredFrom} to decode only the suffix
 * frames rather than the whole artifact.
 *
 * The index is an optimization, not a source of truth: a missing or stale
 * index falls back to the full {@link loadStored} read. It stores only
 * pre-existing facts (frame byte ranges and event seq bounds already known at
 * append time), so it can be deleted and rebuilt at any time without data loss.
 * @module dsh-session-persistence-jsonl/frame-index
 */

import { readFile, writeFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

/** Whether an error is ENOENT (file not found), used for optional sidecar reads. */
function isENOENT(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

/** One event-batch frame's byte range and the contiguous seq span it covers. */
export interface FrameIndexEntry {
  /** Inclusive byte offset of the frame within the log file. */
  readonly offset: number
  /** Frame byte length (compressed). */
  readonly length: number
  /** Seq of the first event in this frame's batch. */
  readonly startSeq: number
  /** Seq of the last event in this frame's batch. */
  readonly endSeq: number
}

/** On-disk frame index: the event-batch frames in file order, plus a size guard. */
export interface FrameIndex {
  /** Index schema revision; bumped only on a breaking layout change. */
  readonly version: 1
  /** Log file byte length when the index was written; mismatch means stale. */
  readonly logSize: number
  /** Event-batch frames in file order (header frame excluded; it carries no events). */
  readonly frames: readonly FrameIndexEntry[]
}

const INDEX_VERSION = 1 as const

/** Sidecar index filename, derived from the log path's directory. */
export function indexPath(logPath: string): string {
  return join(dirname(logPath), 'session.index')
}

/**
 * Read and validate the frame index sidecar. Returns `undefined` when the
 * file is absent, unreadable, or structurally invalid — callers fall back to
 * a full read.
 * @param logPath - the session log file path the index accompanies.
 * @returns the parsed index, or `undefined` when no valid index exists.
 */
export async function readFrameIndex(logPath: string): Promise<FrameIndex | undefined> {
  const path = indexPath(logPath)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if (isENOENT(error)) return undefined
    return undefined
  }
  try {
    const parsed = JSON.parse(text) as Partial<FrameIndex>
    if (
      parsed.version !== INDEX_VERSION
      || typeof parsed.logSize !== 'number'
      || !Array.isArray(parsed.frames)
    ) return undefined
    const frames: FrameIndexEntry[] = []
    const entries: readonly unknown[] = parsed.frames
    for (const entry of entries) {
      if (entry === null || typeof entry !== 'object') return undefined
      const record = entry as Record<string, unknown>
      if (
        typeof record.offset !== 'number'
        || typeof record.length !== 'number'
        || typeof record.startSeq !== 'number'
        || typeof record.endSeq !== 'number'
      ) return undefined
      frames.push({
        offset: record.offset,
        length: record.length,
        startSeq: record.startSeq,
        endSeq: record.endSeq,
      })
    }
    return { version: INDEX_VERSION, logSize: parsed.logSize, frames }
  } catch {
    return undefined
  }
}

/**
 * Check whether the index is current against the live log file size. A
 * mismatch means an append or repair changed the log after the index was
 * written, so the index is stale.
 * @param index - the parsed frame index.
 * @param logPath - the session log file to compare against.
 * @returns `true` when the log size matches the index's recorded size.
 */
export async function isFrameIndexCurrent(index: FrameIndex, logPath: string): Promise<boolean> {
  try {
    const { size } = await stat(logPath)
    return size === index.logSize
  } catch {
    return false
  }
}

/**
 * Write the frame index sidecar. Best-effort: a write failure is swallowed
 * (the index is an optimization; a missing index degrades to a full read).
 * @param logPath - the session log file path the index accompanies.
 * @param index - the index to persist.
 */
export async function writeFrameIndex(logPath: string, index: FrameIndex): Promise<void> {
  const path = indexPath(logPath)
  try {
    await writeFile(path, JSON.stringify(index), 'utf8')
  } catch {
    // Best-effort: a missing index degrades to a full read on the next suffix query.
  }
}

/**
 * Append one event-batch frame entry to an existing index, returning a new
 * immutable index. The log size advances by the frame's byte length.
 * @param previous - the previous index, or `undefined` when building from the first batch.
 * @param frameOffset - byte offset where this frame starts in the log file.
 * @param frameLength - compressed byte length of this frame.
 * @param startSeq - seq of the first event in this batch.
 * @param endSeq - seq of the last event in this batch.
 * @param logSize - total log file byte length after this frame was appended.
 * @returns the updated index.
 */
export function appendFrameIndexEntry(
  previous: FrameIndex | undefined,
  frameOffset: number,
  frameLength: number,
  startSeq: number,
  endSeq: number,
  logSize: number,
): FrameIndex {
  const entry: FrameIndexEntry = { offset: frameOffset, length: frameLength, startSeq, endSeq }
  const frames = previous === undefined ? [entry] : [...previous.frames, entry]
  return { version: INDEX_VERSION, logSize, frames }
}

/**
 * Binary-search the frame index for the first frame whose events include or
 * follow `fromSeq`. Returns the array index, or `undefined` when `fromSeq` is
 * past the last frame's end (an empty suffix).
 * @param index - the frame index to search.
 * @param fromSeq - the seq to locate.
 * @returns the index of the first frame to decode, or `undefined` for an empty suffix.
 */
export function findFrameForSeq(index: FrameIndex, fromSeq: number): number | undefined {
  const frames = index.frames
  if (frames.length === 0) return undefined
  // The last frame's endSeq is the high end of the log; past it means empty suffix.
  const last = frames[frames.length - 1]
  if (last === undefined) return undefined
  if (fromSeq > last.endSeq) return undefined
  // Binary search for the first frame whose endSeq >= fromSeq.
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const frame = frames[mid]
    if (frame === undefined) return undefined
    if (frame.endSeq < fromSeq) lo = mid + 1
    else hi = mid
  }
  return lo
}
