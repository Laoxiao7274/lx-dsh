/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference, content font size,
 * and background display row; the browser resolves only `system`, then
 * writes the same DOM fields ui-layout's ThemePresenter and ui-theme's
 * BackgroundPresenter own after the client plugin tree activates — including
 * the background layer, so a reload never flashes the un-skinned,
 * un-wallpapered defaults.
 *
 * The active skin rides the skin-center v2 channel: the index tap appends
 * the active skin's scoped stylesheet <link> plus the html[data-dsh-skin]
 * attribute, so first paint already carries the skin (see tapIndex in the
 * host apply).
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import {
  DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'

/** The served background image URL (mirrors the client presenter). */
const BACKGROUND_IMAGE_URL = '/api/ui-theme/background'

/** Build the inline script body for one schema-validated durable theme section. */
function bootThemeScript(
  preference: ThemePreference,
  fontSize: number,
  background: ThemeSettings['background'],
): string {
  const backgroundWrite = background === null || background === undefined
    ? ''
    : `(() => {
      const layer = document.createElement('div')
      layer.dataset.pluginCss = '@deepseek-ai/dsh-client-ui-theme/background-layer'
      layer.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;'
        + 'background-image:url(${JSON.stringify(BACKGROUND_IMAGE_URL)});'
        + 'background-size:cover;background-position:center;'
        + 'opacity:${background.opacity}'
      document.body.prepend(layer)
    })()`
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const systemDark = preference === 'system'
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || systemDark
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  document.body.style.setProperty('--dsh-content-font-size', ${JSON.stringify(`${fontSize}px`)});
  ${backgroundWrite}
})()`
}

/**
 * The theme bootstrap as an injection row: an inline script immediately after
 * the opening body tag, before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference.
 * @param fontSize - Current Host-backed content font size in px.
 * @param background - Current Host-backed background display row (null = none).
 * @returns the body script row.
 */
export function bootThemeInjection(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSize: number = DEFAULT_FONT_SIZE,
  background: ThemeSettings['background'] = null,
): IndexInjection {
  return { kind: 'script', placement: 'body', text: bootThemeScript(preference, fontSize, background) }
}
