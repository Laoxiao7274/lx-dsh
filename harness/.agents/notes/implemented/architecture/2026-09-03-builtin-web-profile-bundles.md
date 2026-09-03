# Agent Note: Built-in web profile bundles — shipped web-search and ModLens

Status: implemented

## Problem

LX-DSH ships `@laoxiao7274/dsh-web-search` (the web search provider plus the
`网页搜索` / `插件管理` / `视觉模型` settings sections) and `@liustack/modlens`
(the vision bridge) only as inert files inside the installation's
`node_modules` — they ride `dsh-web-app`'s dependency closure but nothing
activated them. Activation lived in each user's `~/.dsh/profiles/web/package.json`
(`dsh.profile.bundles`), so a fresh install or any other machine booted the
stock two-layer template and none of the three product surfaces appeared.

## Decision

Put both packages into `PROFILE_TEMPLATES.web.bundles` and register the old
two-bundle stock tuple in `INSTALLATION_OWNED_PROFILE_TUPLES.web`:

- Fresh machines initialize the four-bundle template directly. Both packages
  resolve through the launcher's shared module fallback
  (`$DSH_HOME/profiles/node_modules`), which links them out of the
  installation's dependency closure — no network, no `pnpm install`.
- Existing stock installations migrate on their next profile load through
  `normalizeShippedProfile` (the headless retired-tuple precedent). Profiles
  with any other bundle list stay user-owned and untouched — the machine where
  the plugins were already installed keeps working unchanged.
- Template bundles are not dependencies, so `dsh plugin`'s reconcile never
  removes them (`apps/cli/src/plugin.ts`), and the plugin manager UI treats
  them as built-ins rather than installable rows.

A boot-order defect had to be fixed for the template to work at all:
`composeProfile` resolved bundle names *before* `healProfilesModuleFallback`
created the shared fallback links, so a closure-carried package with no
profile-local install failed `resolveBundleDir` (chicken-and-egg — the
machine where this worked had pnpm-installed copies). `composeProfile` now
heals the shared fallback once before loading, then runs the profile-scoped
pass after the load as before.

Also fixed while unblocking the source launch this change was verified with:
`packages/api/gateway/src/index.ts` re-exported the `RemoteEventHostInfo`
*type* through a value export, which is fine for `tsc` output but throws under
tsx's per-file transform (`pnpm dsh` source launches were broken on master).

## Alternatives considered

- **Insert plugin rows into `dsh-web-app`'s `cordis.patch.yml`.** Rejected:
  patch inserts are pure appends (`vendor/include` `applyEntryPatches`), so a
  profile that also lists the plugin as a bundle would double-insert the row,
  double-apply the plugin, and crash boot on `WEB_DUPLICATE_PROVIDER`. The
  template keeps a single declaration source and leaves `dsh plugin add`
  working.
- **lx-dsh-side first-boot provisioning** (Electron writes the profile
  manifest). Rejected: two sources of truth for the same fact, and it would
  fight the user's own uninstall decisions.

## Consequences

- A fresh `dsh --profile web` boots with web search and the vision bridge
  active. Search defaults to the keyless Exa MCP provider; the `deepseek`
  option delegates to the shipped DeepSeek provider; API keys remain per-user
  configuration.
- Any deployment of this tree whose installation closure lacks the two
  packages now fails loud at profile load instead of silently booting without
  them. The packaged runtime carries the closure (verified in 0.3.5), and the
  workspace resolves them through web-app's declared dependencies.
- The web-search plugin is vendored as a first-party workspace package
  (`plugins/dsh-web-search`, `workspace:^` from web-app) — the npm registry
  copy is no longer consulted anywhere. `modlens` stays a registry dependency
  (third-party, own release cadence). The plugin keeps its
  `@laoxiao7274` scope so existing profile manifests and the template entry
  resolve unchanged.
- `plugins/README.md` owns the built-in package shape, the five-edit
  checklist for adding one, and the invariants (template bundles are not
  dependencies; a package composes exactly once; names are stable
  identities). The dsh-web suite takes the deep-transplant route instead —
  its packages move into `packages/` as core code (the skin center is the
  precedent) rather than accumulating here.

English | [中文](./2026-09-03-builtin-web-profile-bundles.zh.md)
