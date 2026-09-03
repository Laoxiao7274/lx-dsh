# Agent Note: the Appearance settings section and background images

Status: implemented

English | [中文](2026-09-03-appearance-section-background.zh.md)

## Problem

The skin, scheme, and font-size settings lived as rows in the General section, and there was no background-image capability at all. The skin system shipped as three rows squeezed between unrelated preferences, and the "put a wallpaper behind the app" need — the single most requested skin-companion feature in the community plugin ecosystem — had no in-tree answer.

## Decision

**Give appearance its own Settings nav section and add a durable background image behind the app shell — both feature-owned by ui-theme, both riding existing seams.**

- The section: ui-theme registers a `settings.section` nav entry (id `appearance`, palette glyph) declaring a new `settings.appearance.item` list slot; the scheme cubes, skin cards, and background row register into it. The font-size stepper stays in General (it sizes conversation content, not chrome).
- The background image is one durable file under `$DSH_HOME/appearance/background.img` (≤ 8 MiB, png/jpeg/webp/gif/avif, magic-byte sniffed) maintained by three loopback host routes: `GET /api/ui-theme/background` (streams it), `POST .../upload` (JSON body with the bytes; writes the file atomically and the settings row together), `POST .../clear` (removes both). The settings row records `fileName`/`mediaType`/`opacity` in the durable theme section — file and row always move together.
- The client projects the image as a fixed full-viewport layer (`prepend` on body, `z-index: 0`, `pointer-events: none`, `background-size: cover`) re-mounted from every theme snapshot by `BackgroundPresenter`; the boot script mounts the same layer before first paint, so reloads never flash. The row hides on non-loopback browsers (the routes are loopback surfaces).
- `ThemeRuntime.setBackground` is the display write entry; opacity adjusts ride the same durable row (no image re-upload).

## Pieces

- `packages/client/ui-theme/src/background-store.ts` — host-side file lifecycle, type sniffing, size caps, the serving handler (new).
- `packages/client/ui-theme/src/index.ts` — the three routes over `ctx.webServer.register`, `writeSection` through the settings service.
- `packages/client/ui-theme/src/client/background-presenter.ts` — the fixed layer, document-guarded (new).
- `packages/client/ui-theme/src/client/AppearanceSection.tsx` + `BackgroundRow.tsx` + `createBackgroundRowStore` — the section shell and the upload/opacity/clear row (new).
- `packages/client/ui-theme/src/client/index.ts` — section + row registrations, `setBackground`, snapshot/adopt wiring.
- `packages/client/ui-theme/src/boot-theme.ts` — the pre-plugin background layer.
- `packages/client/ui-theme/tsconfig.json` — the package now needs both Node and DOM ambient types (its host half is a node process while its client half is a browser bundle; follows the `client/modules` override precedent).
- `packages/client/ui-primitives` — `IconPaletteOutline16` (the nav glyph).

## Alternatives considered

**Wallpaper Engine-style live backgrounds and per-position controls.** Deferred: the community plugin's backdrop scene needs composer-seat neutralizers and a decoration-layer manager; the fixed cover layer covers the mainstream ask.

**Serving the image through the attachment service.** Rejected: attachments are session-scoped media with content-addressed references; a settings-level wallpaper is not session data and would couple two lifecycles.

**Background as a skin property.** Rejected: skins are pure token tables; an image is file state with upload/clear semantics. Keeping them orthogonal lets any skin pair with any wallpaper.

## Consequences

One nav entry collects the whole appearance surface; the wallpaper persists like every other theme fact and composes with any skin and both palettes (the layer's opacity rides over whatever the palette shows). Deferred: background positioning controls (cover is the only mode), multiple wallpaper slots, and remote (non-loopback) upload. Verification: 13 new ui-theme cases (section/row registration and ordering, loopback-only background row, background projection and opacity write-back, boot-script layer mounting and default absence, store round-trip/sniffing/caps/atomic replace), icons spec updated to 76, test:gui green, typecheck 0, and live CDP verification of the settings panel with the Appearance nav entry on the dev instance.
