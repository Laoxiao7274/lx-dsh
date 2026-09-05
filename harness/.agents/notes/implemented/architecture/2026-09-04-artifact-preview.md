# Agent Note: artifact preview — classified row plus tabbed panel

Status: implemented

## Problem

A turn's produced files are visible only as name chips that hand each path to
the system's default application. Images, video, audio, and HTML the agent
produced cannot be inspected without leaving the app, and the one mixed row of
chips gives no visual grouping or ordering.

## Decision

Ship an in-app artifact preview as one host Remote method plus one client
plugin package, with the two surfaces connected through the existing turn
projection of produced files.

`session/readWorkspaceFile` (packages/api/session-controller) reads one
Session-workspace file in the caller's chosen delivery form: `text` returns
whole-file UTF-8, `bytes` returns whole-file base64 with an
extension-derived media type. Byte caps are deployment Config
(`textReadCapBytes`, default 2 MiB; `bytesReadCapBytes`, default 32 MiB).
Failures carry stable codes `session/file-not-found` and
`session/file-too-large`; the pre-existing `workspace/*` codes belong to the
Workspace Controller and declare `{workspaceId}` details, so the session
domain got its own file-error codes. The trust model follows
`openWorkspacePath`, which already hands client-resolved workspace paths to
the Host.

`ui-artifact-preview` (packages/client) renders the two-lane produced row
(media lane video > image > audio as dark cards with cached image thumbnails;
file lane web > doc > data > code > binary as compact chips) registered into
the `conversation.chat.turnTail` chain at priority -100, shadowing the
official `ui-deliverables` chips row while both are composed. Clicking any
card opens the artifact in a `shell.overlay` panel: its own tab strip
(open/focus/close; closing the active tab falls to the right neighbor;
closing the last leaves the empty state), a toolbar (reload, system open,
collapse), a kind-routed body (MarkdownText, CodeBlock, pretty JSON, a
hand-rolled RFC 4180 CSV table, image on a checkerboard stage, video and
audio on the dark stage via blob URLs, HTML through a
`sandbox="allow-scripts"` iframe, binary falls back to copy-path), and a
status line. The panel is a right-edge overlay like the quick drawer —
the conversation column never reflows (a width change re-breaks every
text line in the transcript, which reads as jank); the expand/collapse
pair slides through gsap (pure transform on a pre-promoted compositing
layer; the exit tween defers the unmount), and a window-level
`lx-side-panel` mutex keeps the quick drawer and this panel from
expanding at once.

Seam choices behind that shape:

- The chain election (`ui-slots` ChainSelect: ascending priority, first
  non-null wins) is the sanctioned way to replace the official row; composing
  the plugin out of cordis.yml restores the deliverables chips with no other
  change.
- Bytes reach the browser as base64 over the existing Remote wire and become
  `URL.createObjectURL` blob URLs, following `HistoricalImageCache` (the
  attachment image path): no new static file route, no webserver auth surface.
- Store writes from the apply body go through the panel registration's bound
  actions (`bound = actions` in the inject factory, the `todoBound` pattern
  from ui-lx-shell) because the framework owns the store instance; apply
  never calls `.create()` on the registered handle. Read de-duplication is an
  apply-side `Set` of started tab keys.
- Image thumbnails live in a `createSnapshotStore` observable passed through
  the row registration's `hooks` compartment, so the row component reads them
  as a bound `useThumbnails` selector hook (the ProducedFiles
  `workspacePathOpen` pattern), not by polling.
- Zero new third-party dependencies: text rendering reuses ui-primitives
  (`MarkdownText` micromark GFM+math, `CodeBlock` shiki, copy labels threaded
  from the locale); CSV parsing is ~50 lines of RFC 4180 in-package.

## Alternatives considered

- A host static-file HTTP route (the external `dsh-artifact-preview` plugin's
  `/dsh-files/static` approach) serving workspace files for media and
  iframes: rejected for v1 because it adds a webserver auth surface and a
  second content path; whole-file base64 reads match the existing attachment
  wire and cover every current artifact shape. A route remains the natural
  upgrade if range-streamed media or HTML-relative assets become
  requirements.
- A separate Typert Remote namespace owned by a new host package: rejected
  because the read is a session-workspace-path operation exactly like
  `openWorkspacePath`, which already lives on the session namespace; one
  method there needs no new namespace registration or package wiring.
- Reusing the right details column (a fourth details tab) instead of the
  overlay panel: rejected because the approved design is a persistent
  side-by-side preview with its own tab strip, which the shared details
  column cannot host without nesting tabs in tabs.
- Rendering the row inside `ui-deliverables` itself: rejected because the
  feature must be removable as a unit; the chain priority shadows the official
  row while this package is composed, and removing it restores the original.

## Consequences

- `RemoteErrorDetailsMap` gains `session/file-not-found` and
  `session/file-too-large`; the fake session remote and test-remote faces in
  session-controller tests grew the method.
- The client aggregate tsconfig, web-app cordis.patch.yml, and web-app
  package.json each carry the new package row (the three required
  registration surfaces).
- Two latent defects surfaced under the host tsc face and were fixed in
  passing: the ui-workspace apply spec compared lib-bundled vs source
  component identity (now source-relative imports, the ui-lx-shell spec
  pattern), and ui-lx-shell's tsconfig lacked the ui-workspace project
  reference its todos row needs. `WorkspaceGroupRowOwnerProps.workspaceId`
  widened to plain `string` (slot owner props are boundary data; GroupNode
  carries no branded id).
- Deferred (documented in the package README): localhost port chips for the
  web view (needs a Host loopback-listener enumeration Remote), relative
  assets inside previewed HTML, and range-streamed media.

Testing: `session-read-workspace-file.host.spec.ts` covers the Remote
(text/base64/caps/missing/abort); the package specs cover classification
order, the store tab semantics, row and panel rendering, and the apply
wiring (chain election, cwd resolution, read settlement, thumbnail publish);
`pnpm run test:gui` and the full `pnpm run build` are the gates run.
