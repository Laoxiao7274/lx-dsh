# Agent Note: The web UI resolves a host environment declaration into layout insets

Status: implemented

English | [中文](2026-08-21-host-environment-contract.zh.md)

## Problem

The web UI assumed it owned the whole viewport. When a desktop shell (LX-DSH) hosts the page in one of its webContents and overlays a custom-rendered titlebar, the only integration path was shell-side CSS injection into the page: pad the body down, and — because every modal overlay is `position: fixed` against the viewport, which body padding does not move — chase each surface's DOM structure with `role`/`:has()` selectors injected from the Electron main process.

That coupling broke in both directions at once. It was silent: the shell matched the settings dialog's `role="presentation"` overlay, so any refactor of that markup kills the fix with no error anywhere. And it was never going to end: the settings modal drew under the shell chrome first, but the Modal primitive, the image lightbox, the drop overlay, the onboarding stage, the toast, and the connection banner all position against the viewport too — each one a future bug report requiring another shell-side selector.

## Decision

The client owns a hosted form factor. An embedder declares itself before any page script runs:

```js
window.__DSH_HOST__ = { rev: 'host.v1', kind: 'desktop-shell', name: 'lx-dsh', chrome: { insets: { top: 44 } } }
```

The boot kernel resolves the declaration (`packages/client/web/src/host.ts`, applied first in `AppWebEntry.run()`) into inline `--dsh-app-inset-{top,right,bottom,left}` custom properties on `:root` before any plugin bundle paints; the shell base stylesheet declares the `0px` browser-form-factor defaults. Full-viewport fixed surfaces consume the top inset in their own CSS: the Modal primitive, the settings dialog overlay, the image lightbox (backdrop padding, close-button offset, image max-height), the drop overlay, the onboarding mask and stage, the toast, and the connection banner. Trigger-anchored popovers — Menu, Tooltip, HoverCard, the JSON-tree copy anchor, the feedback note panel — deliberately consume nothing: they position from a trigger rect that already lives inside the padded layout.

The contract is total and tolerant. An absent global is the browser form factor: nothing is written. A present-but-unusable declaration (unknown `rev`, unknown `kind`, non-object value) falls back to the browser form factor with one console warning — visible to the embedder developer, never fatal to the product. Inset sides validate independently: a side that is not a finite number ≥ 0 is dropped with a warning while its valid siblings apply.

The first embedder is LX-DSH. Its preload exposes the declaration through `contextBridge`, and its main process dropped the CSS injection entirely — including the `html, body { height: 100% }` half, which was already redundant with this package's `base.css`. The shell states its geometry once: a shared `TITLEBAR_H` constant feeds both the overlay view bounds and the declaration.

## Alternatives considered

**Keep shell-side CSS injection and add a `:has()` rule per surface.** The stopgap this replaces. Rejected: it binds the shell to hashed CSS-module DOM internals, fails silently on any page refactor, and charges a new coupled rule for every full-viewport surface the product ever adds — the exact "forcibly bolted on" shape this change removes.

**Native Window Controls Overlay (`titleBarStyle: 'hidden'` + `titleBarOverlay`).** The web platform's own version of this contract — `env(titlebar-area-*)` is the standardized inset band. Rejected for now: WCO renders native window controls in a native band, while this product's chrome is a custom React overlay (brand mark, status dot, theme toggle) in its own WebContentsView. Moving the chrome to WCO is a product decision, not a prerequisite for correct hosted layout, and the `chrome.insets` shape keeps that migration open instead of foreclosing it.

**A containing block on the app root** (`transform`, `filter`, or `contain: paint` on the frame) so every `position: fixed` descendant resolves against the padded box at once. Rejected: it re-parents every fixed surface in the page — popover anchoring, portal layers, and stacking semantics all shift. The conversation column already treats exactly this hazard as a load-bearing avoidance (`ConversationRoot` keeps transforms off layout boxes so pickers and modals stay viewport-relative).

**Environment inference** — the page guesses hosting from a query parameter or user-agent sniff. Rejected: an undeclared contract the page guesses at is the implicit cousin of the injection hack. The host states its presence; the page never infers it.

## Consequences

- Every future full-viewport surface consumes `--dsh-app-inset-top` in its own CSS; no shell-side rule is ever added again. Adding an inset consumer is one declaration in the surface's own sheet.
- A newer shell against an older page, or the reverse, degrades to the browser form factor with a console warning instead of a broken layout — the `rev` gate makes version skew visible, not fatal.
- The four-side shape is declared up front while only `top` has a consumer today; right/bottom/left cost nothing and are there for future docks.
- The inline `:root` properties are written before first paint, so a hosted page never flashes unpadded.
- LX-DSH's injection channel is gone; the shell and the page now share one geometry fact instead of two divergent copies.

## Testing

`packages/client/web/tests/host.client.spec.ts` pins the resolution rules (absent, non-object, unknown rev, unknown kind, per-side validation, non-object chrome) and the application (browser form factor writes nothing; a hosted declaration writes the four inline properties; every dropped aspect surfaces one console warning). The properties are inline styles set before plugin activation — jsdom proves the writes and their absence; no browser lane is needed to establish timing. The assembled browser output is unchanged in the browser form factor, which `DSH_SNAPSHOT=replay pnpm run test:web` confirms; the existing boot and base-styles suites stay green because the browser path writes nothing.
