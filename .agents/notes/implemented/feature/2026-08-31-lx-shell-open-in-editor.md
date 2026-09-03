# Agent Note: Session Header open-in-editor button

Status: implemented

English | [中文](2026-08-31-lx-shell-open-in-editor.zh.md)

## Problem

The Session Header's window chrome (ui-lx-shell) had no path from a conversation to the project folder on disk: users had to leave the app to open the repository in their editor.

## Decision

**Add an open-in-VS-Code icon button to the Session Header chrome strip, backed by an `editor` face on the LX-DSH preload bridge.**

- `lx-dsh/preload/index.ts` exposes `lx.editor.open(cwd)` over the new `lx:openEditor` IPC; `lx-dsh/electron/main.ts` handles it by calling `shell.openExternal('vscode://file/<cwd>')` with backslashes normalized and the path URI-encoded, returning `{ ok, error? }`. The VS Code URL protocol was verified on the target machine to open a folder.
- `ui-lx-shell`'s `LxShellBridge` grows an optional `editor` member (same optional-member pattern as `appVersion`); `readBridge` only names it when the running shell provides it, so the button stays hidden against an older shell and in a plain browser host.
- `LxHeaderChrome` reads the session's `cwd` through the standard `useSessions` share (the `ConversationRoot` pattern), renders the `</>` glyph button beside the plugin manager, and disables it when the session has no working directory. Failures from the protocol handler are swallowed after the shell surfaces them; the button carries no busy state.

## Alternatives considered

**A `vscode://` link in the web UI itself.** The dsh web client could render an anchor using the editor's URL protocol, but a browser-hosted page cannot reliably trigger custom protocol handlers without user prompts, and the protocol choice (VS Code/Cursor/explorer) is desktop-shell knowledge the web client should not own.

**Spawning the editor binary from the shell.** Resolving `code`/`cursor` executables and their PATH variants per platform would duplicate what the editors' own URL protocols already solve with one `openExternal` call, at higher maintenance cost and no fallback gain.

## Consequences

One click moves from a session to its repository in VS Code. Hosts without the editor bridge or without VS Code degrade to a hidden or inert button. The cwd source is the session manager's live list, so a session whose workspace is not yet loaded shows a disabled button until it resolves.

Known deferred items: the two pre-existing `no-unnecessary-condition` findings in `LxUpdateButton.tsx` (out of this change's scope); `test:web` replay goldens may pick up the new header button once that lane's pre-existing reds are fixed.
