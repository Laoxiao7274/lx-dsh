/**
 * Market install host routes (adapted from the community dsh-market package,
 * Apache-2.0): the loopback-only install gateway the browser half calls to
 * install skins from dsh-market.com into $DSH_HOME/skins. The host fetches
 * the manifest itself, validates every path, and never accepts a URL or a
 * file list from the client (see ./installer.ts for the security model).
 *
 * Endpoints (all under /api/ui-theme/market):
 *  - POST /install-skin { id, force? }
 *  - GET  /manifest     (proxy of the public skin manifest, cache-no-store)
 * @module ui-theme/skin-center/market/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { installAsset, MARKET_ORIGIN, MarketInstallError } from './installer.ts'
import { readJsonBody } from '../http.ts'
import { writeJson } from '../http-utils.ts'

export const MARKET_API_PREFIX = '/api/ui-theme/market'

function isLoopbackRequest(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Whether an id is a safe single directory segment. */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)
}

/** Build the market install routes. */
export function makeMarketInstallRoutes(deps: { dshHome?: string; fetchImpl?: typeof fetch } = {}): WebRoute[] {
  const home = deps.dshHome ?? resolveDshHome()
  const fetchImpl = deps.fetchImpl ?? fetch

  const handleInstall = (kind: 'skin' | 'pet') =>
    async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { ok: false, error: 'loopback-only' }, { 'cache-control': 'no-store' })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method-not-allowed' }, { 'cache-control': 'no-store' })
        return
      }
      let body: {
        id?: unknown
        force?: unknown
      }
      try {
        body = ((await readJsonBody(req, { maxBytes: 16 * 1024 })) ?? {}) as {
          id?: unknown
          force?: unknown
        }
      } catch {
        writeJson(res, 400, { ok: false, error: 'invalid-body' }, { 'cache-control': 'no-store' })
        return
      }
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id || !isSafeId(id)) {
        writeJson(res, 400, { ok: false, error: 'invalid-id' }, { 'cache-control': 'no-store' })
        return
      }
      try {
        const result = await installAsset(kind, id, {
          dshHome: home,
          force: body.force === true,
          fetchImpl,
        })
        writeJson(res, 200, result, { 'cache-control': 'no-store' })
      } catch (err) {
        const code = err instanceof MarketInstallError ? err.code : 'write'
        const status = code === 'conflict' ? 409 : code === 'manifest' ? 502 : 500
        writeJson(res, status, { ok: false, error: code, message: err instanceof Error ? err.message : String(err) }, { 'cache-control': 'no-store' })
      }
    }

  const handleManifest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: 'loopback-only' }, { 'cache-control': 'no-store' })
      return
    }
    if (req.method !== 'GET') {
      writeJson(res, 405, { ok: false, error: 'method-not-allowed' }, { 'cache-control': 'no-store' })
      return
    }
    try {
      const response = await fetchImpl(`${MARKET_ORIGIN}/manifest/skins.json`, {
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        writeJson(res, 502, { ok: false, error: `manifest fetch failed: ${String(response.status)}` }, { 'cache-control': 'no-store' })
        return
      }
      const text = await response.text()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(text)
    } catch (err) {
      writeJson(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) }, { 'cache-control': 'no-store' })
    }
  }

  return [
    { kind: 'exact', path: `${MARKET_API_PREFIX}/install-skin`, handler: handleInstall('skin') },
    { kind: 'exact', path: `${MARKET_API_PREFIX}/manifest`, handler: handleManifest },
  ]
}
