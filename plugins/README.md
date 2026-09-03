# plugins/ — first-party built-in LX-DSH packages

This directory carries LX product packages that ship inside the dsh runtime
as workspace source — the same deployment shape as `@deepseek-ai/dsh-*`
core packages, but authored here and (where a plugin is involved) activated
through the web profile template rather than a bundle row.

The `plugins/*` glob is a pnpm workspace member but deliberately **outside
the tsdown build faces** (`workspace: ['vendor/*', 'packages/*/*',
'apps/cli']`): a plugin here may be hand-written plain JavaScript in the dsh
ModuleLoader client format, with no `src/` → `lib/types` build. A package
that outgrows that shape (needs TypeScript, tests, tsdown) is a candidate
for the deep-transplant route instead — moving into `packages/` as core code
the way the skin center did — not for a build pipeline here.

## Package shape

Every package under `plugins/`:

- `package.json` — `private: true`, `license`, `files` covering `lib` and
  `cordis.patch.yml`; a `dsh.bundle.patch` manifest (the profile-layer
  insert), and for a browser half a `dsh.client` manifest
  (`platform: "web"`) with a `./client` export served by the client module
  system.
- `cordis.patch.yml` — the bundle layer: `- insert:` rows mounting the
  plugin. The row id is the composition identity; the package name is the
  resolution identity.
- `lib/index.js` (host half) and `lib/client.js` (browser half) — runtime
  payloads exactly as deployed; nothing in this tree builds them.
- `README.md` — a Model-experience-shaped description (see
  `dsh-web-search` for the pattern), plus known limitations.

Activation is **not** per-package: a plugin becomes built-in by joining the
web profile template (below), which is what makes it load for every fresh
machine without network access or a profile-local install.

## Adding a built-in plugin — the five edits

1. **Package**: drop the package directory under `plugins/` (the workspace
   glob picks it up; `pnpm install` relinks).
2. **Dependency**: add `"@scope/name": "workspace:^"` to
   `packages/bundle/web-app/package.json` — the deploy closure carries the
   package through this edge, and the launcher's shared module fallback
   (`$DSH_HOME/profiles/node_modules`) resolves it from the closure.
3. **Template**: append the package name to
   `PROFILE_TEMPLATES.web.bundles` in
   `packages/boot/app-boot/src/profile.ts`.
4. **Migration**: register the *previous* stock tuple in
   `INSTALLATION_OWNED_PROFILE_TUPLES.web` (same file) so existing stock
   installations normalize to the new template on their next profile load.
   Profiles with any other bundle list are user-owned and never touched.
5. **Verify**: `pnpm --config.verify-deps-before-run=false exec vitest run
   packages/boot/app-boot/tests/profile.spec.ts` (template + migration),
   then a fresh-`DSH_HOME` boot smoke (`dsh --profile web --port 0
   --no-open` — the plugin must load or the boot fails loud), then the
   plugin's own surface probes.

Third-party notices: a first-party package here is not a third-party
dependency; do not list it in `scripts/gen-third-party-notices.ts`
OVERRIDES. Registry dependencies stay in their consuming package's
`dependencies` and the generator picks them up from installed metadata.

## Invariants

- Template bundles are **not** dependencies of the profile manifest, so
  `dsh plugin` reconcile never removes them (`apps/cli/src/plugin.ts`); the
  plugin manager reports them as `source: "builtin"`.
- A package may be activated only **once** in a composition: patch inserts
  are pure appends, so a profile that also lists the package as a bundle
  would double-insert its row and crash on provider/slot id collisions.
  Never add a template package to a profile through `dsh plugin add`.
- Names are stable identities: profile manifests on existing machines, the
  plugin manager, and settings rows key off the package name — renaming a
  shipped package strands every stored reference.

## Current packages

- `dsh-web-search` (`@laoxiao7274/dsh-web-search`) — web search provider
  (Exa MCP default, keyless) plus the `网页搜索` / `插件管理` / `视觉模型`
  settings sections, config persisted to `$DSH_HOME/web-search.json`.

Third-party registry deps riding the same closure: `@liustack/modlens`
(vision bridge; template-activated alongside dsh-web-search).
