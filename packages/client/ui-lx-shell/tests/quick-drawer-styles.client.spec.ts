/**
 * The two-placement contract of the quick drawer's chrome as CSS text. jsdom
 * has no layout or Chromium app-region hit-testing, so the interaction spec
 * (quick-drawer.client.spec.tsx) pins behavior but not whether the drawer's
 * header buttons receive pointer events over the window-drag strip or whether
 * the composer reads as one aligned unit; these read the declarations those
 * depend on.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/LxQuickDrawer.module.css', import.meta.url)), 'utf8')
/** Declarations only: the sheet's prose names the properties it explains. */
const declarationText = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

function declarations(selector: string): string[] {
  // Anchored at a rule boundary: an unanchored match would silently read a
  // compound rule that merely contains the selector (`.drawer:hover .close`)
  // if one ever lands above the base rule.
  const rule = new RegExp(`(?:^|\\})\\s*\\${selector}\\s*\\{([^{}]*)\\}`).exec(declarationText)
  if (rule === null) throw new Error(`LxQuickDrawer.module.css has no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('LxQuickDrawer.module.css chrome placements', () => {
  it('opts the drawer out of the window-drag strip it overlays', () => {
    // The drawer renders over the Session Header's app-region drag strip;
    // without an explicit no-drag, Chromium keeps the drag region painted
    // underneath and the header buttons (close, reset) lose hover and clicks.
    expect(declarations('.drawer')).toEqual(expect.arrayContaining([
      '-webkit-app-region: no-drag',
    ]))
  })

  it('centers the send button on the composer box', () => {
    // The textarea grows to two rows while the send button stays 36px; a
    // flex-end alignment hangs the button 11px below the box's center, which
    // reads as misaligned. Centering keeps the pair one visual unit at any
    // input height.
    expect(declarations('.composer')).toEqual(expect.arrayContaining([
      'align-items: center',
    ]))
  })
})
