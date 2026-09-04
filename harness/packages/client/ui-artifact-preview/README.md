# @deepseek-ai/dsh-client-ui-artifact-preview

Two-lane produced-artifact row with an in-app tabbed preview panel for the
dsh web GUI. Classifies each turn's produced files (media lane: video >
image > audio; file lane: web > doc > data > code > binary), renders media
thumbnail cards, and opens any artifact in a fixed right-hand preview panel
with tabs, per-kind rendering (markdown, code, CSV, JSON, image, video,
audio, sandboxed HTML), and full read states.

## Model Experience

- No model-visible surface: the plugin changes no prompts, tools, or session
  events. It consumes the `deliverables` Turn data that `ui-deliverables`
  already publishes (first-party mutation calls) and the Host-only
  `session/readWorkspaceFile` Remote.
- Token/KV-cache effect: none. All rendering is browser-side.

## Composition

- `conversation.chat.turnTail` (chain, priority -100): the classified
  two-lane row. The lower priority elects this entry before the official
  `ui-deliverables` chips row whenever both are composed; removing this
  plugin restores the official row with no other change.
- `shell.overlay` (list): the preview panel. The panel store (tabs, active
  tab, per-tab read settlements) is declared at this registration; the row
  reaches it through the registration's bound actions.
- Reads go through `ctx.remote.session.readWorkspaceFile` (`as: 'text'` for
  text kinds, `as: 'bytes'` + blob URLs for media). Binary artifacts never
  read: the panel shows the system-open fallback immediately.
- Image thumbnails: one bytes read per `${sessionId}:${path}`, cached in a
  module-lifetime observable shared with the row through the registration's
  `hooks` compartment; URLs are revoked at plugin disposal.

## Locale

Namespace `artifactPreview` (zh/en) owns every visible string, including
kind labels, tab chrome, and the four body states (empty, error, too-large,
binary fallback).

## Known Limitations and Deferred Work

- Port chips (localhost dev-server preview) are deferred: they need a
  Host-side loopback listener enumeration remote.
- Web artifacts preview via `sandbox="allow-scripts"` `srcdoc`; relative
  assets inside the HTML do not resolve. External links open in the system
  browser by design.
- Text reads are whole-file (cap from the session-controller config,
  default 2 MiB) with a client-side truncation flag on the wire; the panel
  does not paginate large files.
- Media reads are whole-file base64 (cap 32 MiB default); range streaming
  would need a static file route, deliberately out of scope here.
- Blob URLs for panel reads live for the plugin's lifetime (one per opened
  artifact); only thumbnail URLs are revoked eagerly at disposal.
