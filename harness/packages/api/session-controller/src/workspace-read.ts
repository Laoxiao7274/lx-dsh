/** Session workspace file reads for the in-app artifact preview. */

import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type {
  SessionReadWorkspaceFileAs,
  SessionReadWorkspaceFileValue,
} from './types.ts'

/** Default whole-file byte ceiling for one text preview read. */
export const DEFAULT_TEXT_READ_CAP_BYTES = 2 * 1024 * 1024

/** Default whole-file byte ceiling for one binary preview read. */
export const DEFAULT_BYTES_READ_CAP_BYTES = 32 * 1024 * 1024

/** Extension-derived media types the preview serves; everything else is a generic stream. */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
}

/**
 * Read one existing workspace file in the caller's chosen delivery form.
 * @param path - absolute Host path after Session workspace resolution.
 * @param as - delivery form the caller renders.
 * @param caps - deployment byte ceilings for each form.
 * @param signal - caller lifetime; abort terminates the read.
 * @returns the text or base64 value for the whole file.
 * @throws RemoteError when the path is empty, missing, unreadable, or above its cap.
 */
export async function readWorkspaceFile(
  path: string,
  as: SessionReadWorkspaceFileAs,
  caps: { text: number; bytes: number },
  signal: AbortSignal,
): Promise<SessionReadWorkspaceFileValue> {
  if (path.trim().length === 0) {
    throw new RemoteError('gateway/bad-request', 'workspace file read requires a non-empty path', {})
  }
  signal.throwIfAborted()
  let byteSize: number
  try {
    byteSize = (await stat(path)).size
  } catch (error: unknown) {
    throw new RemoteError(
      'session/file-not-found',
      `workspace file "${basename(path)}" cannot be read: ${String(error)}`,
      {},
      { cause: error },
    )
  }
  signal.throwIfAborted()
  const cap = as === 'text' ? caps.text : caps.bytes
  if (byteSize > cap) {
    throw new RemoteError(
      'session/file-too-large',
      `workspace file "${basename(path)}" is ${byteSize} bytes, above the ${as} preview cap of ${cap}`,
      { byteSize, cap },
    )
  }
  const buffer = await readAbortable(path, signal)
  if (as === 'text') {
    return {
      kind: 'text',
      text: new TextDecoder().decode(buffer),
      byteSize,
      truncated: false,
    }
  }
  return {
    kind: 'bytes',
    mediaType: MEDIA_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    data: buffer.toString('base64'),
    byteSize,
  }
}

/** `readFile` with a mid-read abort translated to the Remote cancellation error. */
async function readAbortable(path: string, signal: AbortSignal): Promise<Buffer> {
  try {
    return await readFile(path, { signal })
  } catch (error: unknown) {
    if (signal.aborted) throw new RemoteError('gateway/cancelled', 'workspace file read was aborted', {})
    throw new RemoteError(
      'session/file-not-found',
      `workspace file "${basename(path)}" cannot be read: ${String(error)}`,
      {},
      { cause: error },
    )
  }
}
