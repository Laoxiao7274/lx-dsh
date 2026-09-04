# @deepseek-ai/dsh-client-ui-lx-shell

English | [中文](README.zh.md)

Client plugin for the LX-DSH desktop shell: the brand row, the update button and dialog, the window chrome, and the quick-answers drawer. Every registration guards on the `window.lx` bridge — under a plain browser the plugin is fully inert.

## Model Experience

**Zero model impact.** This package registers UI surfaces only. It adds no tools, no prompts, no context, and no token cost. Everything is inert (renders nothing at all) outside the LX-DSH shell.

### KV cache

No model-visible surface; no cache contribution.

## Architecture

- **Brand row** (`sidebar.brand.mark` / `sidebar.brand.name` slots): `LxSidebarVersion` shows `v{appVersion}` (IPC `lx:appVersion`), hidden on rail; `LxUpdateButton` (green pill) sits to its right and opens the update dialog.
- **Window chrome** (`conversation.session.header.utilities` slot): `LxHeaderChrome` renders minimize/maximize/close and stamps `data-lx-drag` onto the owning `<header>` at mount (`drag.css` applies `-webkit-app-region: drag`; interactive children opt out).
- **Updates**: `LxUpdateButton` + dialog show current/new version rows, changelog (missing → "no changelog provided"), live download progress, and install-now/later actions; the `LxUpdateStatus` store mirrors the host updater state (`LX_DSH_FAKE_UPDATE=1` fabricates an update in dev mode).
- **Quick-answers drawer** (`shell.overlay` slot + `sidebar.footer.action` ⚡ entry): `LxQuickButton` (`aria-pressed` mirrors drawer state) and `LxQuickDrawer` — a 420px left-anchored collapsible panel hosting a compact exchange against the `quick-answers` preset (session created via `sessions.create`, never staged as current). Answers render through the shared `MarkdownText` pipeline; reasoning rides the same Think disclosure row. The shell stays mounted in both states: the edge handle on the panel's right side toggles collapse, and a collapsed panel slides off-screen leaving the handle docked at the left edge (the body leaves the accessibility tree, so scroll and draft state survive). The root declares `-webkit-app-region: no-drag` (it overlays the Session Header drag strip). `quick-store.ts` (`createQuickDrawerStore`) holds the open flag, bound session id, turns, and errors.
- **Scope discipline**: one store handle mounts under one seat — the chromeStore (updater mirror) is held by `sidebar.brand.name`; the quick store by `shell.overlay`; `conversation.session.header.utilities` is session scope (a second store instance).

The bridge lives outside the Cordis topology, so there is no service seam: subscriptions are plain functions owned by the apply body and disposed with the plugin fiber.

## Known Limitations and Deferred Work

- The update UI's host state is only real in packaged builds (dev mode updater is a no-op; use the fake switch to preview).
- The quick drawer is one thread at a time; a tool-call progress line is future polish.
