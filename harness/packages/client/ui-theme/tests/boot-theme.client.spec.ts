// @vitest-environment jsdom
/** The theme bootstrap injection row and the resulting pre-plugin browser theme.
 * Skin tokens are no longer written by the bootstrap — the skin-center v2
 * channel pre-applies the active skin's stylesheet on the index document
 * (see the host index tap); the bootstrap owns scheme, font size, and the
 * user background layer. */
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootThemeInjection } from '../src/boot-theme.ts'
import type { ThemePreference } from '../src/theme-settings.ts'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function mockSystemDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches }) as MediaQueryList))
}

function executeBootstrap(preference?: ThemePreference, fontSize?: number, background?: unknown): void {
  const row = bootThemeInjection(preference, fontSize, background as never)
  if (row.kind !== 'script') throw new Error('theme bootstrap row is not a script')
  runInNewContext(row.text, { document, matchMedia: globalThis.matchMedia })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('color-scheme')
  document.body.removeAttribute(DARK_ATTRIBUTE)
  document.body.style.removeProperty('--dsh-content-font-size')
  document.body.querySelectorAll('[data-plugin-css*="background-layer"]').forEach((node) => { node.remove() })
})

describe('theme bootstrap row', () => {
  it('is a body script row, so it runs before the shell mount', () => {
    mockSystemDark(false)
    const row = bootThemeInjection('dark')
    expect(row).toMatchObject({ kind: 'script', placement: 'body' })
    executeBootstrap('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('lets durable light override a dark OS and clears stale dark state', () => {
    document.body.setAttribute(DARK_ATTRIBUTE, '')
    mockSystemDark(true)
    executeBootstrap('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it.each([
    [true, 'dark', true],
    [false, 'light', false],
  ] as const)('resolves system=%s to %s', (matches, colorScheme, dark) => {
    mockSystemDark(matches)
    executeBootstrap('system')
    expect(document.documentElement.style.colorScheme).toBe(colorScheme)
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(dark)
  })

  it('defaults to system and falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    executeBootstrap()
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it('writes the durable content font size and defaults it to 14px', () => {
    mockSystemDark(false)
    executeBootstrap('light', 17)
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('17px')
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('14px')
  })

  it('mounts the background layer with the configured opacity, and none without a background', () => {
    mockSystemDark(false)
    executeBootstrap('light', 14, { fileName: 'background.img', mediaType: 'image/png', opacity: 0.4 })
    const layer = document.body.querySelector<HTMLElement>('[data-plugin-css*="background-layer"]')
    expect(layer).not.toBeNull()
    expect(layer?.style.backgroundImage).toContain('/api/ui-theme/background')
    expect(layer?.style.opacity).toBe('0.4')
    expect(layer?.style.pointerEvents).toBe('none')
    layer?.remove()
    executeBootstrap('light')
    expect(document.body.querySelector('[data-plugin-css*="background-layer"]')).toBeNull()
  })
})
