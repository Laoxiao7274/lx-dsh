/**
 * Host environment contract: an embedder (a desktop shell hosting the web UI in
 * one of its webContents) declares itself through `window.__DSH_HOST__` before
 * any page script runs. The boot kernel resolves the declaration into
 * `--dsh-app-inset-*` custom properties on `:root` before any plugin bundle
 * paints, so full-viewport fixed surfaces (modals, lightbox, toasts, banners)
 * lay out within the visible area the host leaves them. Hosted layout is a
 * first-class form factor of the web UI — an embedder never patches page CSS.
 *
 * Contract rules:
 * - No global = browser form factor: nothing is written, zero visual change.
 * - `rev` gates the whole declaration: a present-but-unusable declaration
 *   (unknown revision, unknown kind, non-object value) falls back to the
 *   browser form factor with one console warning — visible to the embedder
 *   developer, never fatal to the product.
 * - Inset sides are independent: a side that is not a finite number >= 0 is
 *   dropped with a warning while its valid siblings still apply.
 */

/** Contract revision a host must declare. */
export const HOST_ENV_REV = 'host.v1'

/**
 * Chrome bands the host overlays on top of the web UI viewport, in CSS pixels.
 * Sides are independent; undeclared sides stay at the stylesheet default (0).
 */
export interface DshHostChromeInsets {
  /** Band reserved above the viewport, e.g. a custom titlebar overlay. */
  top?: number
  /** Band reserved right of the viewport, e.g. a docked side panel. */
  right?: number
  /** Band reserved below the viewport, e.g. a docked status bar. */
  bottom?: number
  /** Band reserved left of the viewport, e.g. a docked side panel. */
  left?: number
}

/**
 * The `window.__DSH_HOST__` declaration shape. `kind` names the embedding so
 * future host kinds can evolve the contract without renumbering `rev`.
 */
export interface DshHostEnvironment {
  rev: typeof HOST_ENV_REV
  kind: 'desktop-shell'
  /** Embedder name for diagnostics only; the contract never branches on it. */
  name?: string
  chrome?: {
    insets?: DshHostChromeInsets
  }
}

/** Reserved bands resolved to numbers; undeclared sides are 0. */
export interface HostLayoutInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** The hosted-layout fact the boot kernel resolves from the declaration. */
export interface HostLayout {
  /** False = browser form factor: the page owns the whole viewport. */
  hosted: boolean
  insets: HostLayoutInsets
}

/** Custom property per inset side; the interface every overlay surface consumes. */
const INSET_VAR = {
  top: '--dsh-app-inset-top',
  right: '--dsh-app-inset-right',
  bottom: '--dsh-app-inset-bottom',
  left: '--dsh-app-inset-left',
} as const

const SIDES = ['top', 'right', 'bottom', 'left'] as const

const ZERO_INSETS: HostLayoutInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Resolve a candidate `__DSH_HOST__` value into the hosted-layout fact.
 * @param value - the raw global as the embedder wrote it (possibly garbage).
 * @returns the layout plus one warning per dropped aspect; `hosted: false`
 *   means the browser form factor (absent or unusable declaration).
 */
export function resolveHostLayout(value: unknown): { layout: HostLayout; warnings: string[] } {
  if (value === undefined) return { layout: { hosted: false, insets: { ...ZERO_INSETS } }, warnings: [] }
  if (typeof value !== 'object' || value === null) {
    return {
      layout: { hosted: false, insets: { ...ZERO_INSETS } },
      warnings: ['__DSH_HOST__: expected an object, got ' + typeof value],
    }
  }
  const candidate = value as Record<string, unknown>
  if (candidate.rev !== HOST_ENV_REV || candidate.kind !== 'desktop-shell') {
    return {
      layout: { hosted: false, insets: { ...ZERO_INSETS } },
      warnings: [
        '__DSH_HOST__: unsupported declaration (rev: ' + describeScalar(candidate.rev)
          + ', kind: ' + describeScalar(candidate.kind) + ') — browser form factor',
      ],
    }
  }
  const warnings: string[] = []
  const insets: HostLayoutInsets = { ...ZERO_INSETS }
  const chrome = candidate.chrome
  const rawInsets = typeof chrome === 'object' && chrome !== null
    ? (chrome as Record<string, unknown>).insets
    : undefined
  if (rawInsets !== undefined) {
    if (typeof rawInsets !== 'object' || rawInsets === null) {
      warnings.push('__DSH_HOST__: chrome.insets is not an object — insets ignored')
    } else {
      const sides = rawInsets as Record<string, unknown>
      for (const side of SIDES) {
        const raw = sides[side]
        if (raw === undefined) continue
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
          warnings.push('__DSH_HOST__: chrome.insets.' + side + ' must be a finite number >= 0 — side dropped')
          continue
        }
        insets[side] = raw
      }
    }
  }
  return { layout: { hosted: true, insets }, warnings }
}

/**
 * Apply the host declaration to the document: a hosted declaration becomes
 * inline `--dsh-app-inset-*` custom properties on `:root` (inline beats the
 * base stylesheet default), written before any plugin bundle can paint. The
 * browser form factor writes nothing.
 * @param scope - the hosting window; `globalThis` in the browser.
 * @returns the resolved hosted-layout fact.
 */
export function applyHostEnvironment(scope: { document: Document; __DSH_HOST__?: unknown }): HostLayout {
  const { layout, warnings } = resolveHostLayout(scope.__DSH_HOST__)
  for (const warning of warnings) console.warn(warning)
  if (!layout.hosted) return layout
  const rootStyle = scope.document.documentElement.style
  for (const side of SIDES) rootStyle.setProperty(INSET_VAR[side], `${layout.insets[side]}px`)
  return layout
}

/** Short human-readable form of a scalar for the unsupported-declaration warning. */
function describeScalar(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}
