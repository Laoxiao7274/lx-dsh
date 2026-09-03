# Agent Note: remote-access settings row and remote-backend connection bookmarks

Status: implemented

English | [中文](2026-09-01-remote-access-row-and-connection-bookmarks.zh.md)

## Problem

The client-agnostic API surface (Bearer auth, mux query token, `/api/$schema`) made a running Host reachable from other machines, but a user had no way to *find* what to type: the connection facts (authenticated URL, LAN addresses, bind posture) appeared only in the startup console line, and a user on another machine had no guided way to *use* them. Meanwhile the web UI's only "add" path was a local directory, so connecting a second backend — the natural first client of the split — required hand-editing a URL.

## Decision

- **`settings.connectionInfo()` joins the settings Remote namespace.** It returns the authenticated root URL (the launch token included, the same sensitivity as the printed startup URL), the LAN IPv4 literals sampled by the web-app runtime, and whether the webserver is loopback-only. It reads `webRuntime` through `ctx.get` (an optional service; an empty LAN list covers compositions without it) and `webServer.host`/`port` directly.
- **The General settings section gains a "Remote access" row.** A `role="switch"` reveal gates an information area: the address (token included), each LAN address, and a posture hint — the loopback hint names `--host 0.0.0.0` as the enabling step, the exposed hint says hand the address to the connecting client. Each fact row carries a copy button with a transient "Copied" state through the shared `writeClipboard` helper. The row hides nothing by default and persists no state: the switch is display-only, because binding is a launch decision, not a runtime one.
- **Remote backends connect through browser-local bookmarks, not the Workspace model.** `remote-connections.ts` parses and normalizes user input into an exact `scheme://host[:port]` origin (bare `ip:port` accepted; credentials, paths, queries, fragments rejected) and composes the open URL with the token on the query string. A `createRemoteConnectionsStore` (persisted `dsh.workspace.remote.v1`) owns the bookmark list; one handle is created in `apply` and passed to the picker registration. The picker's add menu gains **Connect to a remote backend…** opening a form modal (name, address, optional token, removable list of saved bookmarks); saving opens the remote backend's own web UI in a new tab — that backend serves its complete frontend, so no session mixing occurs. Saved bookmarks list in the menu with a globe icon and open on selection.
- **The auto-open collapse now requires an actual flow occupant.** With the connect entry always present, `addEntries.length === 1` no longer implies "the directory add is the only action": on a flow-less composition it meant the auto-open effect raced the flow-withdrawal effect in an infinite setState loop (the render loop first masqueraded as a wedged test run). The guard gains `flowAvailable`, and a flow-less, list-less picker now shows a one-entry menu (the remote connect) instead of claiming no popover.

## Alternatives considered

**Remote backends as Workspace records (`kind: 'remote'`).** Modeling a remote backend inside the Workspace registry would surface it in every workspace surface for free. Rejected for now: the Workspace model is path-anchored (realpath, session-header index, cwd anchoring) — a remote record would need a model-wide variant touching entity, registry, persistence, and bootstrap, while the user-facing need (record an address, open it) needs none of that machinery. The bookmark stays browser-local by the same argument: backend A cannot own a connection record for backend B.

**A runtime bind switch in the settings row.** The switch could attempt to re-bind the webserver to `0.0.0.0` on demand. Rejected: the bind is a launch decision with security posture (trusted hosts, firewall); flipping it at runtime would need a restart cycle anyway, and a display-only switch plus the naming of the enabling flag keeps the row honest.

**Auto-connecting bookmarks through the current page's API.** Fetching remote data inline (through CORS) would integrate remote sessions into the local UI. Rejected: multi-backend session mixing is the multi-user/multi-account direction deferred by decision; opening the remote backend's own UI gives a working client with zero protocol work today.

## Consequences

A user pair can now connect end to end: the serving machine opens Settings → General → Remote access, copies the address; the client machine's picker connects, saving the bookmark, and opens the remote UI with the token. Bookmarks survive reloads in that browser only — a reinstall or another browser re-enters the address (the token is available from the settings row). The `connectionInfo` method joins the contract surface (schema endpoint lists it), so future clients can render the same row from `/api/$schema` alone. The auto-open guard change alters one observable behavior: a composition with no directory-picker and no workspaces now shows a one-entry menu instead of no popover — the remote connect is a real choice, so the popover claims a real choice.
