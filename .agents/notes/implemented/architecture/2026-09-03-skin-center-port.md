# Agent Note: the skin-center v2 asset architecture, transplanted

Status: implemented

English | [中文](2026-09-03-skin-center-port.zh.md)

## Problem

The built-in skins shipped as three compile-time token tables composed inside `ThemeRuntime`. That capped the library at hand-written palettes, could not express background art, per-skin styling of arbitrary selectors, or community skins — and left the entire dsh-market.com skin ecosystem (28+ skins) unreachable. The community skin-center solved all of this with an asset-directory architecture (manifest v2 + CSS safety pipeline + runtime switch engine), but as an external plugin we would not ship.

## Decision

**Transplant the community skin-center wholesale (Apache-2.0, zhu1090093659/dsh-web) into ui-theme, retiring the compile-time token approach.**

- **Skins are pure asset directories** (`skin.json` + `skin.css` + optional `patches.css`/`hooks.mjs`/`assets/`) — no packages, no boot graph. 20 permissively-licensed community skins ship built-in under `packages/client/ui-theme/skins/` (blue-fantasy, whale-song, cyber-night, catppuccin, tokyo-night, furina, miku, mint…); our two token skins (verdigris, midnight-ember) migrated to the same format. NC-licensed skins stay out of the bundle — they arrive through the market.
- **Host half** (`src/skin-center/`): the fail-closed manifest validator, the CSS safety pipeline (lightningcss parse + selector scoping under `html[data-dsh-skin]`, `@import`/remote-URL refusal, token audit + automatic fallback tints), the dual-source repo scan (user `$DSH_HOME/skins` shadows built-ins; memoized by fingerprint), and the v2 routes (`/api/skin-center/v2/catalog|skins/<id>/stylesheet|assets|hooks|active|verify`, same-origin fenced).
- **Client half** (`src/client/skin-center/`): the switch engine (try-on/apply share one atomic latest-wins controller; every activation is ledger-recorded and fully retractable), the six fixed decoration layers, the backdrop scene, and the background-preference sliders (occlusion / per-state blur / composer blur / bubble opacity) persisted through the v2 active channel.
- **ThemeRuntime integration**: `setSkin` is now a pass-through marker (the boot script needs the active id for first paint; the v2 channel owns the real switch). `composeActive` no longer folds skin tokens. The index tap injects the active skin's stylesheet `<link>` + `data-dsh-skin` attribute before first paint — reloads never flash the stock look.
- **Market**: the browser row browses `dsh-market.com/manifest/skins.json` through a loopback host proxy and installs one-click (`/api/ui-theme/market/install-skin`); the installer is the community's hardened one (path allowlist, size caps, staged-then-rename atomic writes, sha256 provenance — which is also the hooks trust signal).

## Pieces

- Host: `skin-repo.ts` (walk-up package-root resolution — the tree differs between src/, lib/, and deployed layouts), `routes-v2.ts`, `core/{manifest-v2,css-safety}`, `provenance.ts`, `active-state.ts`, `market/{installer,routes}.ts`.
- Client: `runtime/{skin-controller,effect-ledger,decoration-layers,backdrop-scene,boot,semantic-adapter,shell-rendering}.ts`, `background.ts` (BackgroundController), `SkinCenterRow.tsx` + module css, `skin-center-apply.ts` (boot wiring + market callbacks).
- Retired: `src/skins.ts`, `SkinRow.tsx`, `createSkinRowStore`.
- `package.json`: `lightningcss ^1.32.0` dependency; `files` whitelist lists every skin directory.

## Alternatives considered

**Keep the token-table model and add token-based community skins.** Rejected: no background media, no selector-level styling, every community skin would need hand conversion, and the market (which serves asset directories) stays unreachable.

**Install the community plugin alongside.** Rejected for the product: two switch engines, two persistence channels, and a third-party release cadence for a first-class appearance surface.

## Consequences

Any dsh-web skin directory — built-in, market-installed, or hand-dropped into `$DSH_HOME/skins` — appears in the Appearance section with try-on, one-click apply, and full retraction; reloads boot straight into the active skin. Deferred from the port: the Wallpaper Engine panel, the custom-theme (user palette) controller, uninstall UI, and the integrity-verify card. Note the build-face lesson: `pnpm --filter … run bundle` rebuilds only the client bundle; the host half needs `build:lib:client`, and a stale host silently serves zero builtins. Verification: 8 new skin-center cases (manifest validation fail-closed, CSS scoping/whitelist, catalog ordering/shadowing/diagnostics) + rewritten theme/apply specs (103 ui-theme total, 297 files / 4036 green), and live CDP: 24 cards rendered, Blue Fantasy applied → `data-dsh-skin=blue-fantasy` + persisted active + backdrop art, stock restored to null.
