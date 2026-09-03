# Agent Note: LxCode as a shipped preset with self-contained plugins

Status: implemented

## Problem

The LxCode agent composition lived only as the user's local preset under
`$DSH_HOME/.agent-presets/lxcode`, referencing its two memory plugins
(`lxcode-memory`, `lxcode-session-search`) by absolute paths into
`~/.dsh/plugins/`. Fresh machines and other LX-DSH users got none of it, and
the cross-session `session_search` tool additionally depended on the user's
root patch enabling `session-query-sqlite` — the stock web profile defaults
to an ephemeral in-memory index with `openAt: never`, so even a copied preset
would search nothing.

## Decision

Ship the preset inside `dsh-agent-presets`' shipped root
(`presets/lxcode/`), which the roster prepends as the system-trusted set:

- The two plugins travel **inside the preset directory**
  (`presets/lxcode/plugins/{memory,session-search}/index.js`) and the
  composition references them through **relative specifiers**
  (`./plugins/memory/index.js`). `classifyRowSpecifier` already gives that
  form first-class treatment — resolved against the preset's own directory
  by both discovery's health check and the mount's import — so the
  composition is self-contained: no absolute paths, no workspace package,
  no closure entry, and the shipped package's `files` already carries
  `presets`.
- `session-query-sqlite` now defaults on for the web surface: the web-app
  bundle patch sets a durable home-relative path with `openAt:
  first-search`. Startup stays quiet (the SQLite open is deferred to the
  first search), and every preset's agent — not only LxCode — can read
  `ctx.sessionQuery`. The stock behavior remains reachable through a later
  patch layer, per the row's documented override seam.
- Display copy follows the shipped-preset pattern: `presetLxcodeName` /
  `presetLxcodeDescription` locale keys in `ui-agent-preset`, mapped in
  `dsh-agent-presets/display` beside the other five presets.

## Alternatives considered

- **Vendor the two plugins as `plugins/` workspace packages** (the
  dsh-web-search route). Rejected: a preset's plugins are part of its
  composition — the preset-relative form is a supported first-class
  mechanism, needs no workspace/deploy bookkeeping, and keeps the preset
  copyable (the roster's duplicate flow copies the directory, plugins
  included).
- **Keep the preset user-authored and only document it.** Rejected: the
  product ships one branded mode; a fresh install should offer it in the
  picker with working memory and search.

## Consequences

- Fresh machines list `lxcode` beside the other shipped presets
  (system-trusted, duplicate-protected: a user directory claiming the id is
  shadowed by the shipped one, so existing local copies upgrade in place).
- `session_search` works out of the box on new installs; the durable index
  file appears under the harness home after the first search. Deployments
  that want the stock in-memory index back override the row in a later
  patch layer.
- The LxCode persona and plan-mode section in the shipped file are the
  product's copy; user edits belong in a duplicated preset, not the shipped
  directory (upgrades replace it).

English | [中文](./2026-09-03-lxcode-shipped-preset.zh.md)
