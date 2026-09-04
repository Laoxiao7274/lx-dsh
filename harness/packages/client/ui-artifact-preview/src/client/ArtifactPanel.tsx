/**
 * The artifact-preview side panel: a fixed right-hand panel with its own
 * tab strip (one tab per opened artifact), a toolbar (reload, external
 * open, close), a kind-routed body (markdown, code, csv, json, image,
 * video, audio, web iframe, binary fallback), and a status line. While
 * open the panel frees its width from the page body (true split, no
 * overlap); the padding follows the open flag through this component's
 * own effect and always restores on unmount.
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { CodeBlock, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  artifactTabKey, type ArtifactRead, type ArtifactTab, createArtifactPanelStore,
} from './artifact-store.ts'
import { basename } from './classify.ts'
import { parseCsv } from './csv.ts'
import type { NS } from './locales.ts'
import css from './ArtifactPanel.module.css'

/** Panel-registered injected face the apply body owns. */
export interface ArtifactPanelInjected {
  /** Re-read the focused artifact (the reload button). */
  reload: (tab: ArtifactTab) => void
  /** Hand one artifact path to the system opener. */
  openExternal: (tab: ArtifactTab) => void
  /** Copy one path to the clipboard. */
  copyPath: (path: string) => void
  /** Open the focused artifact's folder in the system file manager. */
  locateFolder: (tab: ArtifactTab) => void
  /** Markdown/code chrome copy for the text views, locale-bound. */
  markdownLabels: (t: ArtifactPanelProps['t']) => MarkdownLabels
}

/** Panel props: store share, locale seat, and the injected writes. */
export type ArtifactPanelProps = PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createArtifactPanelStore>>
  & InjectFace<ArtifactPanelInjected>

/**
 * Render the artifact-preview panel body for the current panel state.
 * @param props - panel store share, locale seat, and injected writes.
 * @returns the expanded panel, or nothing while collapsed (the row's cards
 *   and tabs reopen it; collapse only hides, never discards).
 */
export function ArtifactPanel({
  useStore, actions, t, reload, openExternal, copyPath, locateFolder, markdownLabels,
}: ArtifactPanelProps): ReactNode {
  const mode = useStore(s => s.mode)
  const tabs = useStore(s => s.tabs)
  const activeKey = useStore(s => s.activeKey)
  const reads = useStore(s => s.reads)
  const labels = useMemo(() => markdownLabels(t), [markdownLabels, t])
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('lx-apv-panel', mode === 'expanded')
    return () => { document.body.classList.remove('lx-apv-panel') }
  }, [mode])
  if (mode !== 'expanded') return null
  const active = tabs.find(tab => artifactTabKey(tab.sessionId, tab.path) === activeKey)
  const read = active === undefined ? undefined : reads[artifactTabKey(active.sessionId, active.path)]
  return (
    <aside className={css.panel} data-open>
      <div className={css.head}>
        <span className={css.title}>{t('panel.title')}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button" className={css.iconButton} title={t('panel.reload')}
          disabled={active === undefined}
          onClick={() => { if (active !== undefined) reload(active) }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <button
          type="button" className={css.iconButton} title={t('panel.external')}
          disabled={active === undefined}
          onClick={() => { if (active !== undefined) openExternal(active) }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5v3h-7v-7h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <button
          type="button" className={css.iconButton} title={t('panel.collapse')}
          onClick={() => { actions.collapsePanel() }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {tabs.length > 0 && (
        <div className={css.tabs} role="tablist">
          {tabs.map(tab => {
            const key = artifactTabKey(tab.sessionId, tab.path)
            return (
              <div
                key={key}
                className={key === activeKey ? `${css.tab} ${css.tabActive}` : css.tab}
                role="tab"
                aria-selected={key === activeKey}
                title={tab.path}
                onClick={() => { actions.focusTab(key) }}
              >
                <span className={css.tabKind}>{t(`kind.${tab.kind}`)}</span>
                <span className={css.tabName}>{tab.name}</span>
                <button
                  type="button" className={css.tabClose} title={t('tab.close')}
                  onClick={(e) => { e.stopPropagation(); actions.closeTab(key) }}
                >
                  <svg viewBox="0 0 16 16" width="9" height="9"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div className={css.body}>
        {active === undefined
          ? <EmptyState t={t} />
          : (
            <PanelBody
              tab={active} read={read} t={t} labels={labels}
              copyPath={copyPath} locateFolder={locateFolder}
            />
          )}
      </div>
      {active !== undefined && <StatusBar tab={active} read={read} t={t} />}
    </aside>
  )
}

/** The no-tab empty state. */
function EmptyState({ t }: { t: ArtifactPanelProps['t'] }): ReactNode {
  return (
    <div className={css.state}>
      <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden>
        <rect x="4" y="6" width="32" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M9 13h22M9 20h22M9 27h13" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <h4 className={css.stateTitle}>{t('state.empty.title')}</h4>
      <p className={css.stateBody}>{t('state.empty.body')}</p>
    </div>
  )
}

/** Route one active tab to its view by kind and read status. */
function PanelBody({
  tab, read, t, labels, copyPath, locateFolder,
}: {
  tab: ArtifactTab
  read: ArtifactRead | undefined
  t: ArtifactPanelProps['t']
  labels: MarkdownLabels
  copyPath: (path: string) => void
  locateFolder: (tab: ArtifactTab) => void
}): ReactNode {
  if (read === undefined || read.status === 'loading') return <Skeleton />
  if (read.status === 'error') {
    const tooLarge = read.code === 'session/file-too-large'
    return (
      <div className={css.state}>
        <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden>
          <path d="M20 6 35 32H5L20 6z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M20 17v7M20 28.5v.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <h4 className={css.stateTitle}>{tooLarge ? t('state.tooLarge.title') : t('state.error.title')}</h4>
        <p className={css.stateBody}>{tooLarge ? t('state.tooLarge.body') : t('state.error.body')}</p>
        <span className={css.stateMeta}>{read.message}</span>
        <div className={css.stateRow}>
          <button type="button" className={css.secondaryButton} onClick={() => { locateFolder(tab) }}>
            {t('state.error.locate')}
          </button>
        </div>
      </div>
    )
  }
  if (read.status === 'fallback') {
    return (
      <div className={css.state}>
        <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden>
          <rect x="4" y="6" width="32" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 13h22M9 20h22M9 27h13" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <h4 className={css.stateTitle}>{t('state.binary.title')}</h4>
        <p className={css.stateBody}>{t('state.binary.body')}</p>
        <span className={css.stateMeta}>{tab.path}</span>
        <div className={css.stateRow}>
          <button type="button" className={css.secondaryButton} onClick={() => { copyPath(tab.path) }}>
            {t('state.binary.copyPath')}
          </button>
        </div>
      </div>
    )
  }
  switch (tab.kind) {
    case 'markdown':
      return <MarkdownText text={read.text ?? ''} labels={labels} />
    case 'code':
      return (
        <CodeBlock
          code={read.text ?? ''}
          lang={codeLanguage(tab.path)}
          copyLabel={labels.code.copyLabel}
          copiedLabel={labels.code.copiedLabel}
        />
      )
    case 'json':
      return (
        <CodeBlock
          code={prettyJson(read.text ?? '')}
          lang="json"
          copyLabel={labels.code.copyLabel}
          copiedLabel={labels.code.copiedLabel}
        />
      )
    case 'csv':
      return <CsvTable text={read.text ?? ''} />
    case 'image':
      return (
        <div className={css.imageStage}>
          <img className={css.image} src={read.url} alt={tab.name} />
        </div>
      )
    case 'video':
      return (
        <div className={css.mediaStage}>
          <video className={css.video} src={read.url} controls preload="metadata" />
        </div>
      )
    case 'audio':
      return (
        <div className={css.mediaStage}>
          <svg viewBox="0 0 16 16" width="34" height="34" className={css.audioGlyph} aria-hidden>
            <path d="M6.2 12.3V4.2l6-1.5v8.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="4.7" cy="12.3" r="1.7" fill="currentColor" />
            <circle cx="10.7" cy="10.8" r="1.7" fill="currentColor" />
          </svg>
          <audio className={css.audio} src={read.url} controls preload="metadata" />
        </div>
      )
    case 'web':
      return <iframe className={css.frame} title={tab.name} sandbox="allow-scripts" srcDoc={read.text ?? ''} />
    default:
      return null
  }
}

/** Loading skeleton matching the final layout's shape. */
function Skeleton(): ReactNode {
  return (
    <div className={css.skeleton}>
      <i className={css.skeletonTitle} />
      <i />
      <i className={css.skeletonWide} />
      <i />
      <i className={css.skeletonMid} />
    </div>
  )
}

/** CSV table over the hand-rolled RFC 4180 parser. */
function CsvTable({ text }: { text: string }): ReactNode {
  const { rows } = useMemo(() => parseCsv(text, 200), [text])
  const [head, ...body] = rows
  return (
    <table className={css.csvTable}>
      {head !== undefined && (
        <thead>
          <tr>{head.map((cell, index) => <th key={index}>{cell}</th>)}</tr>
        </thead>
      )}
      <tbody>
        {body.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/** Status line under the body: read state plus file identity. */
function StatusBar({
  tab, read, t,
}: { tab: ArtifactTab; read: ArtifactRead | undefined; t: ArtifactPanelProps['t'] }): ReactNode {
  const status = read === undefined
    ? `${t('status.loading')} 路 ${tab.name}`
    : read.status === 'loading'
      ? `${t('status.loading')} 路 ${tab.name}`
      : read.status === 'error'
        ? `${t('status.error')} 路 ${read.code}`
        : read.status === 'fallback'
          ? `${t('status.fallback')} 路 ${tab.name}`
          : `${read.text !== undefined ? t('status.ready.text') : t('status.ready.bytes')} 路 ${formatBytes(read.byteSize)}`
  return <div className={css.status}>{status}</div>
}

/** Language hint for the code view from the file extension. */
function codeLanguage(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Re-indent JSON when it parses; render the raw text otherwise. */
function prettyJson(text: string): string {
  try {
    return `${JSON.stringify(JSON.parse(text), null, 2)}\n`
  } catch {
    return text
  }
}

/** Human byte size with one fraction digit above 1 KiB. */
function formatBytes(size: number): string {
  if (size < 1024) return `${String(size)} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`
}
