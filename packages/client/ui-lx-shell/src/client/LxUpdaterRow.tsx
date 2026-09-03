/**
 * LX-DSH updater row registered into the General section item slot: a check
 * button plus the live update state. The row talks to the LX-DSH Electron
 * preload bridge (`window.lx.updater`), which exists only inside the desktop
 * shell — the plugin registers nothing in a plain browser, so hosted dsh web
 * builds are untouched.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { LxShellKey } from './locales.ts'
import type { LxUpdateStatus, createUpdaterRowStore } from './store.ts'
import css from './UpdaterRow.module.css'

/** Injected business face: the two bridge writes (t rides the standard locale seat). */
export interface UpdaterRowInjected {
  /** Ask the shell to run an update check now. */
  check: () => void
  /** Apply the staged update immediately (quits the app). */
  install: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type UpdaterRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createUpdaterRowStore>>
  & PropsLocale<'settings.lxShell'> & UpdaterRowInjected

/**
 * Derive the status line for the current bridge state.
 * @param t - locale seat.
 * @param status - last full status snapshot, or null before the first sync.
 * @param progress - download percent overlay, when one is in flight.
 * @param downloaded - staged version, when one is ready.
 * @returns the detail text, or undefined when only the check button should show.
 */
function detailOf(
  t: (key: LxShellKey) => string,
  status: LxUpdateStatus | null,
  progress: number | null,
  downloaded: string | null,
): string | undefined {
  if (downloaded !== null) return t('updater.downloaded').replace('{version}', downloaded)
  if (progress !== null) return t('updater.downloading').replace('{percent}', String(progress))
  if (status === null) return undefined
  if (status.checking) return t('updater.checking')
  if (status.error !== null && status.error !== '') {
    return t('updater.failed').replace('{message}', status.error)
  }
  if (status.available) {
    return status.version !== null
      ? t('updater.available').replace('{version}', status.version)
      : t('updater.preparing')
  }
  return t('updater.latest')
}

/**
 * Render the LX-DSH updater row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function LxUpdaterRow({ t, useStore, check, install }: UpdaterRowComponentProps) {
  const status = useStore(s => s.status)
  const progress = useStore(s => s.progress)
  const downloaded = useStore(s => s.downloaded)
  const checking = status?.checking === true
  const staged = downloaded !== null
  const detail = detailOf(t, status, progress, downloaded)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('updater.title')}</div>
      <div className={css.row}>
        {detail === undefined ? null : <span className={css.detail}>{detail}</span>}
        {staged
          ? (
            <button type="button" className={css.action} onClick={install}>
              {t('updater.installNow')}
            </button>
          )
          : (
            <button
              type="button"
              className={checking ? `${css.action} ${css.busy}` : css.action}
              disabled={checking}
              onClick={check}
            >
              {checking ? t('updater.checking') : t('updater.check')}
            </button>
          )}
      </div>
    </div>
  )
}
