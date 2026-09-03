# Agent Note: built-in skins over the theme token layer

Status: implemented

English | [中文](2026-09-03-builtin-skins.zh.md)

## Problem

The web GUI shipped exactly one visual identity: the neutral light/dark palettes. Users wanting a different look had to install a community skin plugin (the external skin-center + workshop ecosystem), which solves external-asset distribution — security, try-on, market delivery — problems an in-tree feature does not have, while the actual mechanism (a token override table over the base palettes) was already half-built inside the harness: `ThemeRuntime.overrideTokens` accepts per-token `{light, dark}` pairs, `ThemePresenter` projects composed tokens onto `body`, and the durable settings section was one field short.

## Decision

**Ship skins as in-tree token tables composed by the existing theme runtime — no new loader, no external assets, no DOM writes outside `ThemePresenter`.**

- The durable `ui-theme` settings section gains a `skin` field (`default` by default; schema `z.string()` with unknown stored ids falling back to `default` at adoption — the registry is compile-time, not wire-time, so the schema stays open while adoption stays safe).
- `ThemeRuntime.setSkin(id)` is the only skin write entry; the skin layer composes inside `composeActive` between the registered theme's tokens and the seq-ordered `overrideTokens` layers (a package override wins per-token over the skin). A skin never binds a color scheme: every token carries both palette modes and the Appearance preference stays the scheme authority, so a light/dark flip re-composes the same skin for the other palette.
- `src/skins.ts` is the registry: `BUILTIN_SKINS` — `blue-fantasy` (indigo, adapted from the community skin of the same name with the scrim arithmetic resolved to plain colors), `verdigris` (green-teal), `midnight-ember` (warm dark). The token subset is the safe core (backgrounds, borders, brand, labels, interactive, state, sidebar surfaces); markdown/code/scrollbar tokens follow the composed palette to keep code-block contrast.
- The `SkinRow` settings row (General section, swatch cards with `corner-shape: round` on the circular dot per the corner-shape pairing gate) switches skins through the same store-mirror + inject-face pattern as the Appearance and font-size rows.
- The pre-plugin bootstrap script writes the active skin's tokens for the resolved scheme alongside the palette and font size, so a reload never flashes the un-skinned defaults.

## Pieces

- `packages/client/ui-theme/src/theme-settings.ts` — `SKIN_FIELD`, `DEFAULT_SKIN`, the `skin` field in `ThemeSettings`/schema.
- `packages/client/ui-theme/src/skins.ts` — `BuiltinSkin` type and the three token tables (new).
- `packages/client/ui-theme/src/client/index.ts` — `ThemeSnapshot.skin`, `setSkin`/adoption, skin layer in `composeActive`, `SkinRow` registration.
- `packages/client/ui-theme/src/client/SkinRow.tsx` + `SkinRow.module.css` + `createSkinRowStore` + locale keys (new).
- `packages/client/ui-theme/src/boot-theme.ts` — skin tokens in the bootstrap script.
- `packages/client/ui-theme/src/index.ts` — exports; `readSection` passes the skin.

## Alternatives considered

**Install the community skin-center plugin.** Rejected for the product: it solves external-asset distribution (trust, try-on, market) that in-tree skins do not need, adds a 459-line activation controller over what `ThemePresenter` already does, and couples our look to a third-party release cadence.

**Skins as separate registered themes (`ThemeRuntime.register`).** Rejected: registering a skin as a theme would make skin and color-scheme the same axis (picking "blue-fantasy-light" then flipping to dark would lose the skin), duplicating every table per scheme instead of carrying `{light, dark}` pairs.

## Consequences

One settings row switches the entire GUI's palette; the choice persists in the durable theme section, composes under package `overrideTokens` layers, and survives scheme flips. Adding a skin is one entry in `src/skins.ts` (a token table with both modes) plus two locale keys and a swatch card. Deferred: background media (needs the composer-seat neutralizer a backdrop scene requires), per-token preview on hover, and any external/skin-pack loading. Verification: 12 new ui-theme cases (runtime switch/reset/adopt/compose-under-overrides, boot-script skin writes, SkinRow store and apply wiring, host schema round-trip), test:gui 295 files / 4023 green, typecheck 0, and live CDP screenshots of all three skins in both schemes plus a reload-persistence check on the dev instance.
