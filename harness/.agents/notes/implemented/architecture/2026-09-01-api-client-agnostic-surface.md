# Agent Note: the Host becomes a client-agnostic API surface

Status: implemented

English | [中文](2026-09-01-api-client-agnostic-surface.zh.md)

## Problem

The merged 0.1.2 transport was already protocol-first — every business call rides `POST /api` with zod-validated Typert envelopes, and the `remote.mux` WebSocket carries the event streams — but three gaps kept a third-party client from talking to a running Host: cross-origin browser calls were impossible (no CORS at all, and the cookie is `SameSite=Strict`), a non-browser client had no way to authenticate (the launch token only worked as the one-time `GET /?token=` cookie exchange), and nothing described the callable surface (the contract lived in generated TypeScript a foreign client cannot read). A protocol mismatch between a client and an older Host also failed deep inside payload validation instead of naming the version.

## Decision

- **CORS is an explicit webserver allowlist.** `corsOrigins: string[]` on `dsh-host-webserver` (empty by default, zero behavioral change): matching origins get exact-origin `Access-Control-Allow-Origin` plus `Allow-Credentials` and `Vary: Origin`; `OPTIONS` preflights answer 204 with the methods and headers the API needs; WebSocket upgrades with a non-allowlisted `Origin` are refused. The browser remains the enforcement point — other or absent origins pass through untouched, so non-browser clients are unaffected.
- **The launch token becomes a first-class non-browser credential.** `BrowserAuth.verifyLaunchToken` is a constant-time check exposed through `requestRejection`: HTTP clients send `Authorization: Bearer <token>`, and WebSocket upgrades (browsers cannot set upgrade headers) accept a `?token=` query parameter. Both sit beside the cookie path, which is unchanged; a wrong token still falls through to 401.
- **The ready frame carries the wire protocol version.** `RemoteEventHostInfo` gains `protocolVersion` (a shared `REMOTE_PROTOCOL_VERSION` constant); the Host fills it at the API Remotes registration, and the Client's `parseRemoteEventReady` rejects a mismatched value with an explicit version error naming both numbers. Additive optional frame fields keep the constant; breaking frame changes bump it.
- **The contract is served, not just generated.** `GET /api/$schema` returns the protocol version, the RPC path shape, the mux path, and every locally registered invocation grouped by namespace with wire parameter names, JSON-or-lookup source, and stable type symbols — cached until the local registry changes. `scripts/api-only-smoke.mjs` proves the whole surface with no browser: it boots the real `dsh --profile web`, Bearer-authenticates, builds an RPC call from the schema's own parameter names, and asserts the mux ready frame's protocol version.

## Alternatives considered

**Rely on the cookie for non-browser clients.** The signed cookie already exists and survives restarts. Rejected: `SameSite=Strict` makes it unusable cross-origin, minting it requires scraping the root exchange, and non-browser clients (CLI, mobile, tests) should not simulate a browser's cookie jar to call an API.

**JSON-Schema output on `$schema`.** zod 4 can emit JSON Schema, which is more directly generative than type symbols. Deferred: lookup parameters and Context adapters have no JSON form, and the descriptor document (wire names, sources, type symbols) is enough to write a client against the running Host today; a JSON-Schema layer can be added to the same endpoint without a breaking change.

**A version-negotiation handshake message.** A dedicated hello/acknowledge exchange would allow capability sets. Rejected for now: the ready frame already opens every generation, so carrying the version there gives mismatch detection with zero extra round trips; a capability protocol can ride the same field later.

## Consequences

A third-party client can now be written against a running Host using only HTTP and one WebSocket: fetch `/api/$schema` with the Bearer token, call `POST /api/<namespace>/<method>`, and open `remote.mux?token=` for events. Cross-origin browser clients deploy the webserver with `corsOrigins` and reverse-proxy TLS. The version field is exact-match (not ranged), so a client that must span versions pins per generation; that is acceptable while the protocol is young. The `$schema` document describes the local registry, so experimental compositions report what they actually serve. Cookie behavior, the trusted-host fence, and same-origin flows are byte-for-byte unchanged when `corsOrigins` is empty — the default for every shipped composition.
