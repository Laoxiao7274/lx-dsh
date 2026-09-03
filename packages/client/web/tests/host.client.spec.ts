// @vitest-environment jsdom
/** Host environment contract: resolution rules and boot-time :root application. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyHostEnvironment, HOST_ENV_REV, resolveHostLayout } from '../src/host.ts'

const win = globalThis as typeof window & { __DSH_HOST__?: unknown }

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }

afterEach(() => {
  delete win.__DSH_HOST__
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('resolveHostLayout', () => {
  it('treats an absent declaration as the browser form factor, silently', () => {
    expect(resolveHostLayout(undefined)).toEqual({
      layout: { hosted: false, insets: ZERO },
      warnings: [],
    })
  })

  it('falls back to the browser form factor for a non-object declaration', () => {
    const { layout, warnings } = resolveHostLayout('lx-dsh')
    expect(layout.hosted).toBe(false)
    expect(warnings).toEqual(['__DSH_HOST__: expected an object, got string'])
  })

  it('falls back to the browser form factor on an unknown revision', () => {
    const { layout, warnings } = resolveHostLayout({ rev: 'host.v0', kind: 'desktop-shell' })
    expect(layout.hosted).toBe(false)
    expect(warnings).toEqual(['__DSH_HOST__: unsupported declaration (rev: "host.v0", kind: "desktop-shell") — browser form factor'])
  })

  it('falls back to the browser form factor on an unknown kind', () => {
    const { layout, warnings } = resolveHostLayout({ rev: HOST_ENV_REV, kind: 'kiosk' })
    expect(layout.hosted).toBe(false)
    expect(warnings).toEqual(['__DSH_HOST__: unsupported declaration (rev: "host.v1", kind: "kiosk") — browser form factor'])
  })

  it('describes non-string contract fields without quoting them', () => {
    const { warnings } = resolveHostLayout({ rev: 3, kind: null })
    expect(warnings).toEqual(['__DSH_HOST__: unsupported declaration (rev: 3, kind: null) — browser form factor'])
  })

  it('resolves a hosted declaration with zero insets when chrome is absent', () => {
    const { layout, warnings } = resolveHostLayout({ rev: HOST_ENV_REV, kind: 'desktop-shell', name: 'lx-dsh' })
    expect(layout).toEqual({ hosted: true, insets: ZERO })
    expect(warnings).toEqual([])
  })

  it('resolves every declared side and leaves undeclared sides at zero', () => {
    const { layout, warnings } = resolveHostLayout({
      rev: HOST_ENV_REV,
      kind: 'desktop-shell',
      chrome: { insets: { top: 44, left: 220 } },
    })
    expect(layout).toEqual({ hosted: true, insets: { top: 44, right: 0, bottom: 0, left: 220 } })
    expect(warnings).toEqual([])
  })

  it('treats a non-object chrome as no insets', () => {
    const { layout, warnings } = resolveHostLayout({
      rev: HOST_ENV_REV,
      kind: 'desktop-shell',
      chrome: 'big',
    })
    expect(layout).toEqual({ hosted: true, insets: ZERO })
    expect(warnings).toEqual([])
  })

  it('drops a non-object insets record with a warning', () => {
    const { layout, warnings } = resolveHostLayout({
      rev: HOST_ENV_REV,
      kind: 'desktop-shell',
      chrome: { insets: 44 },
    })
    expect(layout).toEqual({ hosted: true, insets: ZERO })
    expect(warnings).toEqual(['__DSH_HOST__: chrome.insets is not an object — insets ignored'])
  })

  it('drops invalid sides individually while valid siblings apply', () => {
    const { layout, warnings } = resolveHostLayout({
      rev: HOST_ENV_REV,
      kind: 'desktop-shell',
      chrome: { insets: { top: 44, right: -8, bottom: Number.NaN, left: 'full' } },
    })
    expect(layout).toEqual({ hosted: true, insets: { top: 44, right: 0, bottom: 0, left: 0 } })
    expect(warnings).toEqual([
      '__DSH_HOST__: chrome.insets.right must be a finite number >= 0 — side dropped',
      '__DSH_HOST__: chrome.insets.bottom must be a finite number >= 0 — side dropped',
      '__DSH_HOST__: chrome.insets.left must be a finite number >= 0 — side dropped',
    ])
  })
})

describe('applyHostEnvironment', () => {
  it('writes nothing in the browser form factor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const layout = applyHostEnvironment(win)
    expect(layout).toEqual({ hosted: false, insets: ZERO })
    expect(document.documentElement.getAttribute('style')).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('writes inline :root inset properties for a hosted declaration', () => {
    win.__DSH_HOST__ = { rev: HOST_ENV_REV, kind: 'desktop-shell', chrome: { insets: { top: 44 } } }
    const layout = applyHostEnvironment(win)
    expect(layout).toEqual({ hosted: true, insets: { top: 44, right: 0, bottom: 0, left: 0 } })
    const style = document.documentElement.style
    expect(style.getPropertyValue('--dsh-app-inset-top')).toBe('44px')
    expect(style.getPropertyValue('--dsh-app-inset-right')).toBe('0px')
    expect(style.getPropertyValue('--dsh-app-inset-bottom')).toBe('0px')
    expect(style.getPropertyValue('--dsh-app-inset-left')).toBe('0px')
  })

  it('surfaces dropped-aspect warnings through the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    win.__DSH_HOST__ = {
      rev: HOST_ENV_REV,
      kind: 'desktop-shell',
      chrome: { insets: { top: -1, bottom: 12 } },
    }
    const layout = applyHostEnvironment(win)
    expect(layout).toEqual({ hosted: true, insets: { top: 0, right: 0, bottom: 12, left: 0 } })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith('__DSH_HOST__: chrome.insets.top must be a finite number >= 0 — side dropped')
  })

  it('surfaces an unusable declaration warning and writes nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    win.__DSH_HOST__ = { rev: 'host.v9', kind: 'desktop-shell' }
    const layout = applyHostEnvironment(win)
    expect(layout.hosted).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(document.documentElement.getAttribute('style')).toBeNull()
  })
})
