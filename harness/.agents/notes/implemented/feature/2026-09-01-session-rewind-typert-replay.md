# Agent Note: session rewind replayed on the Typert remote architecture

Status: implemented

English | [中文](2026-09-01-session-rewind-typert-replay.zh.md)

## Problem

The 0.1.2-alpha.2 upstream merge retired the `dsh-host-apiproxy` package (and the client `dsh-client-runtime` package) in favor of generated Typert remotes. The LX-DSH rewind feature — the user-message "rewind to here" button that truncates the durable log back to a turn boundary — had been wired through apiproxy's `session.rewind` RPC and the runtime manager, so the merge removed its host endpoint and client call path entirely.

## Decision

**Replay rewind across the generated remote seam instead of reviving any proxy layer.**

- The host already owns the whole rewind substrate: `Session.rewind(atSeq)` (in-memory turn truncation), the `session/truncate` persistence callback with durable truncation, and `SessionService.rewind(sessionId, atSeq)` with the flush checkpoint. Only the wire exposure was missing.
- Protocol: `SessionRewindRequest`/`SessionRewindValue` vocabulary plus the `session/rewind-unavailable` failure code in `packages/api/session-controller/src/types.ts`; a `commands.rewind` that refuses under a running agent and delegates to `ctx.sessions.rewind`; and the `@Remote('rewind')` method on `SessionController`, so the typert generator emits the client contract for `ctx.remote.session.rewind`.
- Client: `ISessions.rewind` contract, `SessionManager.rewind` (calls the remote, then resyncs the resident conversation window), and the service-level forward.
- UI: the chat view registration (now owned by ui-chat) injects `rewindAt`; `ChatNodeOwnerProps` carries it to the keyed user-message renderer; `MessageIconActions` regained the rewind button with its confirm modal (chat-namespace locale keys, since the row moved from ui-conversation to ui-chat).
- Draft restore: `rewindAt` extracts the retracted user message's text blocks from the session's event window before the truncation drops them, and after the rewind resolves writes them back through `conversation.input.for(actx).setDraft` (the session-scoped `SessionInputResolver` face), so the prompt returns to the composer for editing and resending.

## Alternatives considered

**Revive a thin apiproxy-style RPC channel for rewind.** Kept a private `rpc.handle('/rewind')` endpoint the client could call directly. Rejected: upstream deleted the entire apiproxy layer in the merge, so every seam the channel would ride (wire contract resolution, client transport) is gone; rebuilding any part of it re-forks the architecture the merge just converged.

**Re-implement rewind as a client-side reconstruction** (drop trailing turns in the UI and replay by re-sending). Rejected: the durable log is the authority — a client-side truncation that never rewrites it would desync every resumed session and the trajectory view, and re-sending would duplicate tokens instead of cutting them.

## Consequences

The host-side rewind follows the upstream command pattern (`RemoteError` codes, agent-busy refusal) rather than the old apiproxy handler. The retracted prompt returns to the composer draft through the session-scoped `SessionInputResolver` (`conversation.input.for(actx).setDraft`) — the cross-package draft path the first cut deferred; only text blocks return (images were consumed at submit). Test doubles gained `session.rewind` records, and the fake transport resolves `{ accepted: true }`.
