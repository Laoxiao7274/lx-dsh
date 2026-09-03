/**
 * The update affordance on the sidebar brand row: a green pill beside the
 * version badge that appears the moment the shell's updater finds a newer
 * version (percent while downloading) and opens the update dialog — version
 * comparison rows, the release-notes changelog, and the install action. The
 * install click starts the download; its progress renders in the dialog, and
 * completion installs and restarts automatically. It replaces the
 * header-strip indicator so the offer sits where the version it upgrades is
 * printed.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createUpdaterRowStore } from './store.ts'
import type { LxShellKey } from './locales.ts'
import css from './LxUpdateButton.module.css'

/** The shell write the button's dialog needs (typed structurally). */
export interface LxUpdateButtonInjected {
  /** Download and install the update (the download starts on the click and
   * its completion restarts the app; the dialog renders the progress). */
  install: () => void
}

/** Full props of the brand-row update button. */
export type LxUpdateButtonProps =
  PropsStore<ReturnType<typeof createUpdaterRowStore>>
  & PropsLocale<'settings.lxShell'> & LxUpdateButtonInjected

/**
 * Render the green update pill when an update is available or downloading,
 * and the dialog it opens. Hidden entirely when the bridge reports nothing
 * (no update, no download). The install click starts the download; the pill
 * mirrors its percent, and completion restarts the app automatically.
 * @param props - shared updater store, localized copy, and the install write.
 * @returns the pill, or null while there is nothing to update to.
 */
export function LxUpdateButton({ t, useStore, install }: LxUpdateButtonProps): ReactNode {
  const status = useStore(s => s.status)
  const downloaded = useStore(s => s.downloaded)
  const progress = useStore(s => s.progress)
  const [open, setOpen] = useState(false)

  const ready = downloaded !== null
  const downloading = progress !== null
  const available = status?.available === true
  if (!ready && !downloading && !available) return null

  const newVersion = status?.version ?? null
  const label = ready
    ? t('updater.installNow')
    : downloading ? `${String(progress)}%` : t('brand.update')

  return (
    <>
      <button
        type="button"
        className={ready ? `${css.pill} ${css.ready}` : css.pill}
        title={ready
          ? t('updater.downloaded').replace('{version}', downloaded)
          : t('updater.available').replace('{version}', newVersion ?? '')}
        aria-label={ready ? t('updater.installNow') : t('dialog.title')}
        onClick={() => { if (ready) { install(); setOpen(true) } else { setOpen(true) } }}
      >
        {label}
      </button>
      <UpdateDialog
        open={open}
        onClose={() => { setOpen(false) }}
        t={t}
        newVersion={newVersion}
        currentVersion={status?.currentVersion ?? null}
        notes={status?.notes ?? null}
        downloading={downloading}
        progress={progress}
        ready={ready}
        onInstall={() => { install() }}
      />
    </>
  )
}

/** Props of the update dialog: live status fields plus the shell write. */
interface UpdateDialogProps {
  open: boolean
  onClose: () => void
  t: (key: LxShellKey) => string
  newVersion: string | null
  currentVersion: string | null
  notes: string | null
  downloading: boolean
  progress: number | null
  ready: boolean
  onInstall: () => void
}

/**
 * The update dialog: version comparison rows, the release notes changelog,
 * live download progress, and the install action. Rendered inside the brand
 * row so the Modal portal owns its own stacking; open/close are
 * component-local state (the dialog subscribes to nothing).
 * @param props - dialog state, status fields, and localized copy.
 * @returns the modal.
 */
function UpdateDialog({
  open, onClose, t, newVersion, currentVersion, notes, downloading, progress, ready, onInstall,
}: UpdateDialogProps): ReactNode {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dialog.title')}
      closeLabel={t('chrome.close')}
      {...newVersion !== null ? { description: t('updater.available').replace('{version}', newVersion) } : {}}
      footer={(
        <>
          <Button onClick={onClose}>{t('dialog.later')}</Button>
          <Button
            variant="primary"
            disabled={downloading}
            onClick={onInstall}
          >
            {ready ? t('updater.installNow') : downloading ? t('chrome.downloading').replace('{percent}', String(progress ?? 0)) : t('updater.installNow')}
          </Button>
        </>
      )}
    >
      <div className={css.dialogBody}>
        <div className={css.versionRows}>
          <span className={css.versionLabel}>{t('dialog.currentVersion')}</span>
          <span className={css.versionValue}>{currentVersion ?? '—'}</span>
          <span className={css.versionLabel}>{t('dialog.newVersion')}</span>
          <span className={css.versionValue}>{newVersion ?? '—'}</span>
        </div>
        {downloading
          ? (
            <div className={css.progressTrack}>
              <span className={css.progressFill} style={{ width: `${progress ?? 0}%` }} />
            </div>
          )
          : null}
        <div className={css.changelogSection}>
          <span className={css.changelogTitle}>{t('dialog.changelog')}</span>
          {notes !== null && notes !== ''
            ? <pre className={css.changelogText}>{notes}</pre>
            : <span className={css.changelogText}>{t('dialog.changelogMissing')}</span>}
        </div>
      </div>
    </Modal>
  )
}
