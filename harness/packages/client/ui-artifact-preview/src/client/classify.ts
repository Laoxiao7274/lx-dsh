/**
 * Produced-artifact classification: extension to render kind, two-lane
 * grouping, and the stable ordering inside each lane.
 * @module
 */

/** How one artifact renders in the row and the preview panel. */
export type ArtifactKind =
  | 'markdown' | 'code' | 'csv' | 'json'
  | 'image' | 'video' | 'audio'
  | 'web'
  | 'binary'

/** Which row lane an artifact occupies; media lanes render thumbnail cards. */
export type ArtifactLane = 'media' | 'file'

/** One classified produced path. */
export interface ClassifiedArtifact {
  readonly path: string
  readonly kind: ArtifactKind
  readonly lane: ArtifactLane
  /** Sort rank inside its lane; lower renders first. */
  readonly rank: number
}

/** Media lane order: video (demonstrable motion) > image (still) > audio (listening). */
const MEDIA_RANK: Readonly<Record<'image' | 'video' | 'audio', number>> = {
  video: 0,
  image: 1,
  audio: 2,
}

/** File lane order: runnable web > docs > data > code > opaque binary. */
const FILE_RANK: Readonly<Record<'markdown' | 'code' | 'csv' | 'json' | 'web' | 'binary', number>> = {
  web: 0,
  markdown: 1,
  csv: 2,
  json: 3,
  code: 4,
  binary: 5,
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'])
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.c', '.h',
  '.cpp', '.hpp', '.cs', '.rb', '.php', '.kt', '.swift', '.sh', '.bash', '.zsh', '.ps1',
  '.css', '.scss', '.less', '.yaml', '.yml', '.toml', '.ini', '.conf', '.sql', '.xml',
  '.txt', '.log', '.env',
])

/** File-path basename that also answers for plain relative names. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

/** Lowercased extension including the leading dot; `''` when none. */
function extension(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

/**
 * The render kind one produced path takes.
 * @param path - produced path in Host or wire syntax.
 * @returns the artifact kind; unknown extensions fall to `binary`.
 */
export function artifactKind(path: string): ArtifactKind {
  const ext = extension(path)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.csv') return 'csv'
  if (ext === '.json') return 'json'
  if (ext === '.html' || ext === '.htm' || ext === '.xhtml') return 'web'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return 'binary'
}

/** The delivery form a kind reads its bytes as. */
export function readForm(kind: ArtifactKind): 'text' | 'bytes' {
  return kind === 'image' || kind === 'video' || kind === 'audio' ? 'bytes' : 'text'
}

/**
 * Classify and order one turn's produced paths into the two row lanes.
 * @param paths - deduplicated produced paths in log order (oldest first).
 * @returns lane-ordered artifacts: media first, file second; same-rank ties
 * keep log order (newest last, matching the produced accumulation).
 */
export function classifyArtifacts(paths: readonly string[]): readonly ClassifiedArtifact[] {
  const classified = paths.map((path, index) => {
    const kind = artifactKind(path)
    const lane: ArtifactLane = kind === 'image' || kind === 'video' || kind === 'audio'
      ? 'media'
      : 'file'
    const rank = lane === 'media'
      ? MEDIA_RANK[kind as 'image' | 'video' | 'audio']
      : FILE_RANK[kind as 'markdown' | 'code' | 'csv' | 'json' | 'web' | 'binary']
    return { path, kind, lane, rank, index }
  })
  return classified
    .sort((left, right) =>
      (left.lane === right.lane ? 0 : left.lane === 'media' ? -1 : 1)
      || left.rank - right.rank
      || left.index - right.index)
    .map(({ path, kind, lane, rank }) => ({ path, kind, lane, rank }))
}
