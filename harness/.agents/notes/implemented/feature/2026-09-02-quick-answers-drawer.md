# Agent Note: the quick-answers drawer

Status: implemented

English | [中文](2026-09-02-quick-answers-drawer.zh.md)

## Problem

A "quick question" needed a home that does not cost a context switch. Asking one from LX-DSH meant either typing into the main conversation — polluting a working session with a one-off search question — or leaving the app for a search engine. The first cut of the feature solved this with a standalone popup BrowserWindow, but that opened a second application instance for a "quick question": its own process, taskbar entry, and localStorage partition, while the main window's conversation sat right there.

## Decision

- **The quick exchange is a left-anchored collapsible drawer inside the main window** — a panel (420px, elevated l2 surface) with an edge handle on its right side, hosting a compact ask-and-answer exchange against the `quick-answers` preset (search-grounded, source-citing, ask-and-discard). The shell (panel + handle) stays mounted in both states: clicking the handle toggles collapse, and a collapsed panel slides off-screen leaving the handle docked at the left edge, so scroll and draft state survive the collapse (the body leaves the accessibility tree via `visibility`). There is no separate ✕ control — the handle and the sidebar-foot ⚡ entry are the toggles. It is pure client plugin work: no Electron-side code at all.
- **The drawer is a background session consumer, not a stage.** First expand creates the session (`sessions.create` with `agentPreset: 'quick-answers'`), opens its event window, and subscribes `binding.eventSource`; `ask` prompts in queue mode; reset archives the session and mints a fresh one. The quick session is never staged as current — the main window's selection is untouched. `SessionFace` gained `open()` — the idempotent first-open of a session's event window — because previously the window only opened through staging (`followCurrent`), leaving background consumers no legitimate entry (`FixtureSession` in test-support carries a fail-loud stub).
- **The presentation matches the main chat.** Answers render through the shared `MarkdownText` pipeline, reasoning rides the same Think disclosure row (DisclosureRow + IconThinkOutline14 + useStreamReveal — collapse summary streams, expand auto-follows), and tool calls show as quiet chips (search icon + tool name, dots while the turn runs). `deriveQuickTurns` re-derives turns from the complete event window on every publication — `user/message` with a `user` source opens a turn; `assistant/chunk` text-deltas accumulate into `answer`, reasoning-deltas into `reasoning`; `tool/call` appends a tool chip; `assistant/message` finalizes; the snapshot's `running` marks the tail; injected contexts (plugin sources) stay out.

## Pieces

- `packages/client/ui-lx-shell` owns the whole feature: `LxQuickButton` (sidebar.footer.action; `aria-pressed` mirrors the drawer state, inject receives `toggle(open)`), `LxQuickDrawer` (shell.overlay: header + exchange list + composer; Enter sends, Shift+Enter newlines; the collapse handle rides the panel's right edge — `aria-expanded` reports the state, vertical label, chevron rotates toward the collapsed direction — and the collapsed shell slides off-screen via `transform: translateX(calc(-100% + 28px))` keeping the 28px handle docked at the left edge, a 240ms eased transition with `prefers-reduced-motion` disabled; the shell root declares `-webkit-app-region: no-drag` because it overlays the Session Header's window-drag strip — without the explicit opt-out Chromium's app-region hit-test keeps the `drag` region painted underneath and the header buttons never receive hover or clicks; the composer centers the send button on the textarea's box so the two read as one aligned unit; scrolling list rebinds the scrollbar thumb to the l2 elevation tokens — settings-panel precedent — and neutral solid borders/dividers stay 0.5px hairlines per the elevation-style gates), `quick-store.ts` (`createQuickDrawerStore`: open flag, bound session id, turns, error; the component-bound instance is the only writer target — apply-side logic goes through the captured `BoundActions`), and the apply body.
- Registration: no new package — `ui-lx-shell` was already in the web-app composition (it gained `sessions`/`workspaces` service injects and a `dsh-client-ui-layout` devDep for the `shell.overlay` slot types). The `ui-quick-answers` package (#quick hash boot) was deleted along with its registration trio; `sessions.create`'s `agentPreset` passthrough stays.
- Electron (lx-dsh): the popup window, its IPC, preload bridge member, and the menu entries were removed (reverted to pre-popup). The per-caller window-controls fix stays.

## Alternatives considered

**Keep the popup window.** A standalone BrowserWindow isolates the exchange completely. Rejected: it duplicated the application (process, taskbar entry, localStorage partition) for what is fundamentally a side glance, and it required Electron-side plumbing that a drawer does not.

**Reuse the main conversation with a lightweight preset.** Prompting the current session with the quick-answers composition would need no new session. Rejected: it pollutes the working session's log with ask-and-discard exchanges and couples the quick answer's lifecycle to the workspace session's.

**Right-anchored slide-in with a ✕ (the first drawer cut).** A close button reads as "dismiss" and drops the panel state on every close. Rejected in favor of the collapse handle: a left-anchored panel that slides off-screen with the handle docked keeps scroll and draft state alive, and one control covers both directions (the ✕ was removed).

**A left-edge handle rendered separately while collapsed.** Two elements (panel / handle) with cross-fading state. Rejected: one always-mounted shell with a transform is simpler, keeps the DOM stable, and animates both directions with one rule.

## Consequences

One click opens a grounded Q&A exchange beside the main conversation; its sessions are ordinary durable sessions (archived on reset), and the main window's selection is never touched. The collapsed handle docks over the sidebar's left edge (the drawer occupies the sidebar's side of the shell by design — it overlays the sidebar when expanded too). Known limitations: one drawer, one thread — switching workspaces does not close it (the quick session is workspace-less by construction); the preset's search activity shows only as the running dots (a tool-call progress line is future polish); turn history rides the event window's tail page only (the drawer never pages older turns). Verification: ui-lx-shell specs (40 tests — button, drawer interaction incl. collapse-handle contract, turn derivation, apply wiring), test:gui green, client + host tsc 0, and a CDP end-to-end on the dev instance (click → drawer → two real questions with streamed, link-rendered answers).
