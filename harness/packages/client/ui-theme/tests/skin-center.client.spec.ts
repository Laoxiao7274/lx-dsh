/** Skin-center core: manifest validation, css-safety transform, and the
 * dual-source catalog. Adapted from the community skin-center suite
 * (Apache-2.0) with the builtin source pointed at the ui-theme package
 * skins. */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateSkinManifestV2 } from '../src/skin-center/core/manifest-v2/validate.ts'
import { transformSkinCss, SkinCssSafetyError } from '../src/skin-center/core/css-safety/transform.ts'
import { loadSkinCatalog, findSkin, userSkinsDir } from '../src/skin-center/skin-repo.ts'

let home = ''

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-skin-center-'))
  process.env.DSH_HOME = home
})

afterAll(() => {
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

describe('manifest v2 validation', () => {
  it('accepts a complete manifest and rejects unknown fields fail-closed', () => {
    const ok = validateSkinManifestV2({
      skinManifestVersion: 2,
      id: 'test-skin',
      name: '测试',
      nameEn: 'Test',
      version: '1.0.0',
      author: 'a',
      contributes: { stylesheet: 'skin.css' },
    })
    expect(ok.ok).toBe(true)
    expect(ok.manifest?.id).toBe('test-skin')

    const bad = validateSkinManifestV2({
      skinManifestVersion: 2,
      id: 'test-skin',
      name: 'n',
      nameEn: 'N',
      version: '1.0.0',
      author: 'a',
      unknownField: true,
      contributes: { stylesheet: 'skin.css' },
    })
    expect(bad.ok).toBe(false)
    expect(bad.errors.join('\n')).toContain('unknown field')
  })

  it('rejects unsafe file references and malformed ids', () => {
    const base = {
      skinManifestVersion: 2,
      name: 'n',
      nameEn: 'N',
      version: '1.0.0',
      author: 'a',
    }
    expect(validateSkinManifestV2({ ...base, id: 'X', contributes: { stylesheet: 'skin.css' } }).ok).toBe(false)
    expect(validateSkinManifestV2({ ...base, id: 'ok', contributes: { stylesheet: '/abs.css' } }).ok).toBe(false)
    expect(validateSkinManifestV2({ ...base, id: 'ok', contributes: { stylesheet: '../escape.css' } }).ok).toBe(false)
    expect(validateSkinManifestV2({ ...base, id: 'ok', contributes: { stylesheet: 'http://x/s.css' } }).ok).toBe(false)
  })
})

describe('css safety transform', () => {
  it('scopes selectors under html[data-dsh-skin] and clones root tokens to body', () => {
    const { code } = transformSkinCss(':root { --dsw-alias-bg-base: #111; } body { color: red; } .x { color: blue; }', { skinId: 'test' })
    expect(code).toContain('html[data-dsh-skin="test"]')
    expect(code).toContain('body')
    expect(code).not.toMatch(/:root/)
  })

  it('rejects @import and remote URLs fail-closed', () => {
    expect(() => { transformSkinCss('@import url("https://evil/x.css");', { skinId: 't' }) })
      .toThrow(SkinCssSafetyError)
    expect(() => { transformSkinCss('.a { background: url(https://evil/x.png); }', { skinId: 't' }) })
      .toThrow(SkinCssSafetyError)
  })

  it('accepts relative in-directory assets and data: URLs', () => {
    expect(() => { transformSkinCss('.a { background: url(assets/x.png); }', { skinId: 't' }) }).not.toThrow()
    expect(() => { transformSkinCss('.a { background: url(data:image/png;base64,xx); }', { skinId: 't' }) }).not.toThrow()
  })
})

describe('skin repository', () => {
  it('loads the shipped builtin catalog with valid manifests and ordered entries', () => {
    const catalog = loadSkinCatalog()
    expect(catalog.skins.length).toBeGreaterThanOrEqual(20)
    // Every builtin passes validation (fail-closed scan).
    expect(catalog.diagnostics.filter(d => d.origin === 'builtin')).toEqual([])
    // Order field sorts entries.
    const orders = catalog.skins.map(s => s.manifest.order ?? Number.MAX_SAFE_INTEGER)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
    expect(findSkin(catalog, 'blue-fantasy')?.origin).toBe('builtin')
    expect(findSkin(catalog, 'no-such-skin')).toBeNull()
  })

  it('a user directory shadows the builtin with the same id and lands in the catalog', () => {
    const userDir = userSkinsDir()
    mkdirSync(join(userDir, 'blue-fantasy'), { recursive: true })
    writeFileSync(join(userDir, 'blue-fantasy', 'skin.json'), JSON.stringify({
      skinManifestVersion: 2,
      id: 'blue-fantasy',
      name: '用户覆盖',
      nameEn: 'User Override',
      version: '9.9.9',
      author: 'u',
      contributes: { stylesheet: 'skin.css' },
    }))
    writeFileSync(join(userDir, 'blue-fantasy', 'skin.css'), ':root { --dsw-alias-bg-base: #123; }')
    try {
      const catalog = loadSkinCatalog({ userDir })
      const entry = findSkin(catalog, 'blue-fantasy')
      expect(entry?.origin).toBe('user')
      expect(entry?.warnings.join(' ')).toContain('shadows the built-in')
    } finally {
      rmSync(join(userDir, 'blue-fantasy'), { recursive: true, force: true })
    }
  })

  it('a directory whose manifest fails validation lands in diagnostics and never loads', () => {
    const userDir = userSkinsDir()
    mkdirSync(join(userDir, 'broken-skin'), { recursive: true })
    writeFileSync(join(userDir, 'broken-skin', 'skin.json'), JSON.stringify({ nope: true }))
    try {
      const catalog = loadSkinCatalog({ userDir })
      expect(findSkin(catalog, 'broken-skin')).toBeNull()
      expect(catalog.diagnostics.some(d => d.subject === 'broken-skin')).toBe(true)
    } finally {
      rmSync(join(userDir, 'broken-skin'), { recursive: true, force: true })
    }
  })
})
