# Agent Note: same-origin windows follow one persisted session selection

Status: implemented

English | [中文](2026-09-02-cross-window-selection-follow.zh.md)

## Problem

A backend serves any number of clients correctly — each browser page opens its own `remote.mux` WebSocket, its own `session/control` and `session/follow` streams, and the Host fans out every live event to every follower (verified against a running production backend: two raw WebSocket clients and two real browser windows each received identical event sequences, including `assistant/chunk` reasoning deltas and tool activity). But two windows of the same browser diverge in *what they show*: `dsh.sessions.current` is persisted to localStorage per origin and read only at boot, so after each window navigates on its own, the two windows sit on different sessions and the user reads that as "messages only sync to one client". Multi-instance deployments (two LX-DSH shells, each spawning its own loopback backend) are a separate, architectural gap addressed outside this note.

## Decision

- **A cross-window write re-targets every same-origin window through the user-click paths.** `ClientSessions` listens for `storage` events on the `dsh.sessions.current` key (`rootCtx.effect`-owned, so disposal unregisters it). A validated foreign selection that differs from this client's becomes the pending follow; applying it calls the same `open()` / `openSubagent()` / `clear()` a sidebar click takes, so the persisted cell, the staged scope, the event window, and the UI all move together.
- **Unknown targets stay pending, never destructive.** `manager.select` throws for an id this window has not listed yet, and a catalog child needs its parent's catalog. The pending follow retries on every list publication; an ordinary session applies once its row is listed, an addressed child once its parent catalog here carries a matching healthy entry (child rows project only along the current addressed route, so the catalog snapshot — not `byId` — is the addressability source). A new-session race therefore converges within one list update instead of throwing or wiping the persisted cell.
- **localStorage stays a validated durable boundary.** `parsePersistedSelection` accepts only the exact shapes the store writes (`{}`, `{sessionId}`, `{sessionId, subagentAddress}` with a mode-constrained address); anything else is ignored rather than trusted. Equal selections (echoes) are no-ops, so windows converge without write loops — applying a foreign value republishes the same JSON, which fires no further storage events.
- **Different browser profiles keep independent views.** The follow rides the storage event, which only crosses same-origin windows of one profile. Two different browsers connecting to the same backend keep their own selections (their live streaming still syncs whenever both open the same session — that path was already correct).

## Alternatives considered

**Server-side "current session" shared across all clients.** One global selection would guarantee identical views even across browsers. Rejected: selection is view state, not conversation state; two genuine users (or one user deliberately running two views) would fight over one pointer, and the client-side selection feeds local UI like the sidebar highlight and the frozen-scope stage.

**Route the follow through the manager's restore semantics.** `SessionManager` already accepts a boot-time restored selection that masks unknown ids. Rejected: the mask-gap projection wipes the persisted cell to `{}` while the row is absent, and that wipe would broadcast to every other window — a transient race would yank the originating window's view. The pending-follow design never writes until the target is addressable here.

**Sync the whole selection store via a generic cross-tab layer in `client/store`.** Generalizing persistence with `storage`-event mirroring would sync every persisted store (panel widths, drafts). Deferred: only the session selection creates the "both windows should show the same conversation" expectation today; a generic layer can be added to `attachPersistence` later without changing this note's contract.

## Consequences

All windows of one LX-DSH shell (main window, web view window, same-profile browser tabs) now stage the same session and stream it live; switching a session in one window moves the others within one list publication. The masked-gap boot wipe can still broadcast `{}` in a rare race (a window booting its list pull exactly while another creates a session); the convergence is self-healing because the row's arrival republishes the selection and the following window re-opens it. Following a blank session whose draft view rewrites the persisted selection (unregistered cwd) ends with an empty cell — that is the blank-draft flow's own behavior, unchanged by this note. The live behavior was verified end-to-end against a real backend with two browser windows: writes in either window retargeted the other, its follow stream opened a snapshot for the exact target session, and its view switched.
