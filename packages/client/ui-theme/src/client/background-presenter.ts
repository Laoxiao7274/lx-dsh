/**
 * Background-image DOM presenter: one fixed full-viewport layer behind the
 * application root (z-index below the app shell's stacking context), carrying
 * the stored image as a CSS background with the configured opacity. Pure DOM
 * writes — the presenter retracts exactly what it wrote.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ThemeSnapshot } from './index.ts'

/** The served background image URL (same-origin, loopback host). */
export const BACKGROUND_IMAGE_URL = '/api/ui-theme/background'

/** Applies background snapshots to the document; one instance per plugin fiber. */
export class BackgroundPresenter {
  private layer: HTMLDivElement | null = null

  /**
   * Project a snapshot: mount or remove the fixed image layer.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot: ThemeSnapshot): void {
    const background = snapshot.background
    if (background === null) {
      this.layer?.remove()
      this.layer = null
      return
    }
    if (this.layer === null) {
      this.layer = document.createElement('div')
      this.layer.dataset.pluginCss = '@deepseek-ai/dsh-client-ui-theme/background-layer'
      document.body.prepend(this.layer)
    }
    this.layer.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 0',
      'pointer-events: none',
      `background-image: url(${JSON.stringify(BACKGROUND_IMAGE_URL)})`,
      'background-size: cover',
      'background-position: center',
      `opacity: ${background.opacity}`,
      // The image must never grab clicks or paint over interactive chrome.
    ].join('; ')
  }

  /** Retract the layer this presenter mounted. */
  dispose(): void {
    this.layer?.remove()
    this.layer = null
  }
}

/**
 * Wire the presenter to the theme service for one plugin fiber. Skips
 * installation in non-browser contexts (node test lanes booting the client
 * tree have no document).
 * @param ctx - owning client context.
 * @param getTheme - snapshot getter (the theme service).
 * @returns the dispose function.
 */
export function installBackgroundPresenter(
  ctx: ClientContext,
  getTheme: () => ThemeSnapshot,
): () => void {
  if (typeof document === 'undefined') return () => {}
  const presenter = new BackgroundPresenter()
  presenter.apply(getTheme())
  const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
  return () => {
    off()
    presenter.dispose()
  }
}
