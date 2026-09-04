/**
 * The two-lane produced-artifact row: media-lane cards first
 * (video > image > audio), file-lane compact chips second
 * (web > doc > data > code > binary). Image cards render thumbnails from
 * the injected observable cache; video and audio cards render kind glyphs
 * (their bytes are not worth a row-time read). Clicking any card opens
 * that artifact's preview tab.
 */
import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { basename, type ClassifiedArtifact } from './classify.ts'
import type { NS } from './locales.ts'
import css from './ArtifactRow.module.css'

/** Bare observable of cached image blob URLs keyed by `${sessionId}:${path}`. */
export type ArtifactRowHooks = {
  thumbnails: HostObservable<Readonly<Record<string, string>>>
}

/** Row-registered injected face the apply body owns. */
export interface ArtifactRowInjected {
  /** Open one artifact's preview tab (apply resolves the session workspace). */
  open: (sessionId: SessionId, path: string) => void
}

/** Matched classification plus the owner share and the locale seat. */
export type ArtifactRowProps = PropsRuntime<'conversation.chat.turnTail'>
  & Pick<TurnTailOwnerProps, 'openFile'>
  & PropsLocale<typeof NS>
  & InjectFace<ArtifactRowInjected & { hooks: ArtifactRowHooks }>
  & {
    /** Classified artifacts for this turn, lane-ordered. */
    matched: readonly ClassifiedArtifact[]
  }

/**
 * Render one turn's produced artifacts as the classified two-lane row.
 * @param props - matched classification, session identity, the chat view's
 *   file opener, the locale seat, and the injected open/thumbnail faces.
 * @returns the artifact row, or nothing when this turn produced nothing.
 */
export function ArtifactRow({
  sessionId, matched, t, open, useThumbnails,
}: ArtifactRowProps): ReactNode {
  const media = matched.filter(artifact => artifact.lane === 'media')
  const files = matched.filter(artifact => artifact.lane === 'file')
  return (
    <div className={css.root}>
      <span className={css.cap}>
        {t('row.label')}
        {media.length > 0 && <span className={css.capKind}>{` ${t('row.mediaCount')} ${String(media.length)}`}</span>}
        {media.length > 0 && files.length > 0 && <span className={css.capSep}>/</span>}
        {files.length > 0 && <span className={css.capKind}>{`${t('row.fileCount')} ${String(files.length)}`}</span>}
      </span>
      {media.length > 0 && (
        <div className={css.media}>
          {media.map(artifact => (
            artifact.kind === 'image'
              ? (
                <ImageCard
                  key={artifact.path}
                  sessionId={sessionId}
                  path={artifact.path}
                  label={t(`kind.${artifact.kind}`)}
                  useThumbnails={useThumbnails}
                  open={open}
                />
              )
              : (
                <button
                  key={artifact.path}
                  type="button"
                  className={css.mediaCard}
                  data-kind={artifact.kind}
                  title={artifact.path}
                  onClick={() => { open(sessionId, artifact.path) }}
                >
                  <span className={artifact.kind === 'audio' ? css.noteGlyph : css.playGlyph} aria-hidden>
                    {artifact.kind === 'audio'
                      ? (
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <path
                            d="M6.2 12.3V4.2l6-1.5v8.1" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round"
                          />
                          <circle cx="4.7" cy="12.3" r="1.7" fill="currentColor" />
                          <circle cx="10.7" cy="10.8" r="1.7" fill="currentColor" />
                        </svg>
                      )
                      : <svg viewBox="0 0 16 16" width="12" height="12"><path d="M5 3.5l8 4.5-8 4.5z" fill="currentColor" /></svg>}
                  </span>
                  <span className={css.cardName}>{basename(artifact.path)}</span>
                  <span className={css.kindTag}>{t(`kind.${artifact.kind}`)}</span>
                </button>
              )
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={css.files}>
          {files.map(artifact => (
            <button
              key={artifact.path}
              type="button"
              className={css.fileChip}
              title={artifact.path}
              onClick={() => { open(sessionId, artifact.path) }}
            >
              <span className={css.kindTag}>{t(`kind.${artifact.kind}`)}</span>
              <span className={css.fileName}>{basename(artifact.path)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One media-lane image card reading the thumbnail observable by key. */
function ImageCard({
  sessionId, path, label, useThumbnails, open,
}: {
  sessionId: SessionId
  path: string
  label: string
  useThumbnails: (selector: (snap: Readonly<Record<string, string>>) => string | undefined) => string | undefined
  open: (sessionId: SessionId, path: string) => void
}): ReactNode {
  const key = `${sessionId}:${path}`
  const src = useThumbnails(snap => snap[key])
  return (
    <button
      type="button"
      className={css.mediaCard}
      data-kind="image"
      title={path}
      onClick={() => { open(sessionId, path) }}
    >
      {src !== undefined
        ? <img className={css.thumb} src={src} alt={`${label} ${basename(path)}`} />
        : <span className={css.thumbPending} aria-hidden />}
      <span className={css.kindTag}>{label}</span>
    </button>
  )
}
