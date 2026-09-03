/**
 * Background-image row of the Appearance section: upload (file picker),
 * opacity slider, and clear. The image bytes travel through the host upload
 * route (`/api/ui-theme/background/upload`); display options ride the durable
 * theme section. Non-loopback browsers hide the row (the routes are
 * loopback-only surfaces).
 */
import { useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createBackgroundRowStore } from './settings-store.ts'
import css from './BackgroundRow.module.css'

/** Injected business face (t rides the standard locale seat). */
export interface BackgroundRowInjected {
  /** Upload one image file as the background. */
  upload: (file: File) => Promise<void>
  /** Clear the stored background. */
  clear: () => Promise<void>
  /** Adjust the display opacity (0.1..1). */
  setOpacity: (opacity: number) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type BackgroundRowComponentProps =
  PropsRuntime<'settings.appearance.item'> & PropsStore<ReturnType<typeof createBackgroundRowStore>>
  & PropsLocale<'settings.theme'> & BackgroundRowInjected

/** Opacity slider step (10 discrete steps between 0.1 and 1). */
const OPACITY_STEP = 0.1

/**
 * Render the background row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function BackgroundRow({ t, upload, clear, setOpacity, useStore }: BackgroundRowComponentProps) {
  const background = useStore(s => s.background)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onPick = (): void => {
    setError('')
    fileInput.current?.click()
  }
  const onFile = (file: File | undefined): void => {
    if (file === undefined || busy) return
    setBusy(true)
    upload(file)
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { setBusy(false) })
  }

  return (
    <div className={css.group}>
      <div className={css.title}>{t('background.title')}</div>
      <div className={css.row}>
        <button
          type="button" className={css.pick} onClick={onPick}
          disabled={busy}
        >
          {t(background === null ? 'background.choose' : 'background.replace')}
        </button>
        {background !== null && (
          <button type="button" className={css.clear} onClick={() => { void clear() }} disabled={busy}>
            {t('background.clear')}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className={css.fileInput}
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>
      {background !== null && (
        <label className={css.opacityRow}>
          <span className={css.opacityLabel}>{t('background.opacity')}</span>
          <input
            className={css.opacity}
            type="range" min="0.1" max="1" step={OPACITY_STEP}
            value={background.opacity}
            onChange={(e) => { setOpacity(Number(e.target.value)) }}
          />
        </label>
      )}
      {error !== '' && <div className={css.error} role="alert">{error}</div>}
    </div>
  )
}
