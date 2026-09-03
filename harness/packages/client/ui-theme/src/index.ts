/** Host registration for the browser theme preference and pre-plugin palette. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { bootThemeInjection } from './boot-theme.ts'
import {
  clearBackground, readJsonBody, serveBackground, writeBackground,
} from './background-store.ts'
import { makeSkinCenterV2Routes } from './skin-center/routes-v2.ts'
import { makeMarketInstallRoutes } from './skin-center/market/routes.ts'
import { defaultActiveStatePath, readActiveSelection } from './skin-center/active-state.ts'
import {
  DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, DEFAULT_SKIN,
  THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema,
  type ThemeSettings,
} from './theme-settings.ts'

export {
  BACKGROUND_FIELD, DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, DEFAULT_SKIN, FONT_SIZE_FIELD,
  FONT_SIZE_MAX, FONT_SIZE_MIN, SKIN_FIELD, THEME_PREFERENCE_FIELD, THEME_PREFERENCES,
  THEME_SETTINGS_NAMESPACE,
  type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'
export {
  canServeSkinHooks, builtinSkinsDir, findSkin, loadSkinCatalog, shippedSkinIds, uninstallUserSkin,
} from './skin-center/skin-repo.ts'
export type { SkinCatalog, SkinCatalogEntry } from './skin-center/skin-repo.ts'
export {
  BACKGROUND_FILE, BACKGROUND_MAX_BYTES, appearanceDir, clearBackground, readBackground,
  writeBackground,
} from './background-store.ts'
export type { BackgroundSettings } from './background-store.ts'

const THEME_NAMESPACE = THEME_SETTINGS_NAMESPACE
/** GET path serving the stored background image. */
export const BACKGROUND_ROUTE = '/api/ui-theme/background'
/** POST path replacing the stored background (JSON body: bytes, mediaType, opacity). */
export const BACKGROUND_UPLOAD_ROUTE = '/api/ui-theme/background/upload'
/** POST path clearing the stored background. */
export const BACKGROUND_CLEAR_ROUTE = '/api/ui-theme/background/clear'

/** Read the registered theme section or the schema defaults without a settings provider. */
function readSection(ctx: Context): ThemeSettings {
  const fallback: ThemeSettings = {
    preference: DEFAULT_PREFERENCE, fontSize: DEFAULT_FONT_SIZE, skin: DEFAULT_SKIN, background: null,
  }
  const settings = ctx.get('settings')
  if (settings === undefined) return fallback
  const section = settings.get(THEME_NAMESPACE) as ThemeSettings | undefined
  if (section === undefined) return fallback
  return section
}

/** Write one field of the theme section through the settings service, when present. */
async function writeSection(ctx: Context, mutate: (draft: ThemeSettings) => ThemeSettings): Promise<ThemeSettings> {
  const settings = ctx.get('settings')
  if (settings === undefined) throw new Error('settings service unavailable')
  const next = mutate(readSection(ctx))
  await settings.update(THEME_NAMESPACE, next)
  return next
}

/**
 * Register the durable theme section when the optional settings service is
 * composed, answer every index injection collection with the current theme
 * bootstrap row, serve the background-image + skin-center routes, and tap
 * the rendered index to pre-apply the active skin's stylesheet (first paint
 * already carries the skin; the v2 runtime takes ownership after boot).
 * @param ctx - Host context that may acquire the settings and webserver services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, ThemeSettingsSchema)
  })
  ctx.on('webserver/index-inject', (table) => {
    const section = readSection(ctx)
    table.push(bootThemeInjection(
      section.preference,
      section.fontSize,
      section.background ?? null,
    ))
  })
  // Pre-apply the active skin on the index document: the scoped stylesheet
  // link + html[data-dsh-skin] attribute land before first paint. Skins are
  // served through the v2 routes (transform + scope pipeline).
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.tapIndex((html) => {
      const active = readActiveSelection(defaultActiveStatePath())
      if (active === null) return html
      const link = `<link rel="stylesheet" href="/api/skin-center/v2/skins/${encodeURIComponent(active)}/stylesheet">`
      const stamped = `<script>document.documentElement.setAttribute('data-dsh-skin','${active.replace(/[^a-z0-9-]/gi, '')}')</script>`
      // Stylesheet in head (render-blocking = no flash), the attribute
      // stamp inline right after <head> opens.
      if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, match => `${match}${stamped}${link}`)
      }
      return `${stamped}${link}${html}`
    }), 'ui-theme: active-skin index tap')
  })
  ctx.inject(['webServer'], (webCtx) => {
    const web = webCtx.webServer
    webCtx.effect(() => web.register({
      kind: 'exact', path: BACKGROUND_ROUTE, handler: serveBackground,
    }), 'ui-theme: background route')
    webCtx.effect(() => web.register({
      kind: 'exact',
      path: BACKGROUND_UPLOAD_ROUTE,
      handler: (req, res) => {
        void (async () => {
          try {
            const body = JSON.parse((await readJsonBody(req)).toString('utf8')) as {
              bytes?: number[]
              mediaType?: string
              opacity?: number
            }
            if (typeof body.mediaType !== 'string' || !Array.isArray(body.bytes)) {
              throw new Error('malformed upload body')
            }
            const row = writeBackground(
              Buffer.from(body.bytes),
              body.mediaType,
              typeof body.opacity === 'number' ? body.opacity : 0.6,
            )
            await writeSection(webCtx, draft => ({ ...draft, background: row }))
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, background: row }))
          } catch (error) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
          }
        })()
      },
    }), 'ui-theme: background upload route')
    webCtx.effect(() => web.register({
      kind: 'exact',
      path: BACKGROUND_CLEAR_ROUTE,
      handler: (req, res) => {
        void (async () => {
          try {
            if (req.method !== 'POST') throw new Error('POST required')
            clearBackground()
            await writeSection(webCtx, draft => ({ ...draft, background: null }))
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (error) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
          }
        })()
      },
    }), 'ui-theme: background clear route')

    // Skin-center v2 routes: read-only skin asset serving plus the active
    // selection / background-preference channel (same-origin fenced).
    for (const route of makeSkinCenterV2Routes()) {
      webCtx.effect(() => web.register(route), 'ui-theme: skin-center v2 routes')
    }

    // Market install routes: one-click skins from dsh-market.com into
    // $DSH_HOME/skins (loopback-only, host-side manifest validation).
    for (const route of makeMarketInstallRoutes()) {
      webCtx.effect(() => web.register(route), 'ui-theme: market install routes')
    }
  })
}
