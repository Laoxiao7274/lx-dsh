/**
 * Skin-center client apply wiring: boot the v2 runtime store once per plugin
 * fiber, own the background preference controller, and expose the market
 * browser/install callbacks the settings row injects.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { bootSkinRuntime, type SkinRuntimeStore } from './skin-center/runtime/boot.ts'
import { BackgroundController } from './skin-center/background.ts'
import type { SkinCenterRowInjected, MarketSkin } from './SkinCenterRow.tsx'

/** The market manifest proxy route (served by the host half). */
const MARKET_MANIFEST_URL = '/api/ui-theme/market/manifest'
/** The market install route (served by the host half). */
const MARKET_INSTALL_URL = '/api/ui-theme/market/install-skin'
/** The v2 active-state channel the background preferences persist through. */
const ACTIVE_STATE_URL = '/api/skin-center/v2/active'

/**
 * Wire the skin-center runtime for one plugin fiber.
 * @param ctx - owning client context.
 * @returns the injected face for the settings row, or null in non-browser
 *   contexts (node test lanes have no document).
 */
export function installSkinCenter(ctx: ClientContext): SkinCenterRowInjected | null {
  if (typeof document === 'undefined') return null

  const runtime: SkinRuntimeStore = bootSkinRuntime({
    doc: document,
    suppressBackgroundMedia: () => false,
  })
  ctx.effect(() => () => { runtime.shutdown() }, 'ui-theme: skin-center runtime')

  // Background preferences: read the persisted state once, then persist
  // user edits through the v2 active channel (same-origin fetch).
  const persist = (next: unknown): void => {
    void fetch(ACTIVE_STATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ background: next }),
    }).catch(() => {
      // Persistence failures keep the live values; the next edit retries.
    })
  }
  const background = new BackgroundController(null, persist)
  void readActiveState().then((state) => {
    background.init(state?.background ?? null)
  })
  ctx.effect(() => () => { background.dispose() }, 'ui-theme: skin-center background controller')

  const browseMarket = async (): Promise<MarketSkin[]> => {
    const response = await fetch(MARKET_MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`manifest fetch failed: HTTP ${String(response.status)}`)
    const manifest = JSON.parse(await response.text()) as { items?: MarketSkin[] }
    if (!Array.isArray(manifest.items)) throw new Error('manifest shape invalid')
    return manifest.items
  }

  const installMarketSkin = async (id: string, force: boolean): Promise<void> => {
    const response = await fetch(MARKET_INSTALL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, force }),
    })
    const body = JSON.parse(await response.text().catch(() => '{}')) as {
      ok?: boolean
      error?: string
      message?: string
    }
    if (!response.ok || body.ok !== true) {
      throw new Error(body.message ?? body.error ?? `install failed: HTTP ${String(response.status)}`)
    }
  }

  return { runtime, background, browseMarket, installMarketSkin }
}

interface ActiveStateWire {
  active: string | null
  background: Record<string, unknown> | null
}

async function readActiveState(): Promise<ActiveStateWire | null> {
  try {
    const response = await fetch(ACTIVE_STATE_URL, { cache: 'no-store' })
    if (!response.ok) return null
    const body = JSON.parse(await response.text()) as ActiveStateWire
    return body
  } catch {
    return null
  }
}
