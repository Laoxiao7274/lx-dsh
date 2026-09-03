# @laoxiao7274/dsh-web-search

LX-DSH's built-in web search provider and settings surface. Shipped as a
workspace package (no registry release): the packaged runtime carries this
source through the deploy closure, and the web profile template activates it
as a bundle layer (`packages/boot/app-boot/src/profile.ts`).

## Model experience

- Registers the `dsh-web-search` search provider and claims the default
  `ctx.web` search slot, replacing the shipped `deepseek-official` default.
  Model-visible behavior: `web_search` tool calls route to the configured
  provider (Exa MCP by default — keyless; Tavily/Brave/Jina/Exa/Kagi/
  Perplexity with per-user keys; `deepseek` delegates to the shipped provider).
  Each result carries `sources[]` (URL, title, snippet) the model can cite.
- The optional model summary issues one auxiliary LLM request over the
  collected sources using the agent default model (or an explicit
  `summary.model`); it is off by default and adds no tokens when disabled.
- The curator review page (browser-side source filtering) is dormant: the
  `curator.html` asset is not packaged, and a search with curator enabled
  degrades to returning raw results instead of blocking on the review page.

## Composition

- Host half: `lib/index.js` — web provider registration, provider routing
  (`curl.exe` through the shell service), curator HTTP+SSE routes, plugin
  manager APIs (list/check/update/reload), ModLens variant management
  (profile-patch rewrite + loader reload), and config persistence to
  `$DSH_HOME/web-search.json`.
- Client half: `lib/client.js` — the `网页搜索` (50), `插件管理` (60), and
  `视觉模型` (70) settings sections, served through the client module system.
- Bundle layer: `cordis.patch.yml` inserts the `web-search` row.

The code is hand-written plain JavaScript in the dsh ModuleLoader client
format; it intentionally does not participate in the tsc/tsdown build faces
(this package lives outside `packages/*/*` for that reason).

## Known limitations and deferred work

- `curator.html` is not packaged (the asset was lost); curator mode is off by
  default and degrades to raw results. Re-shipping it requires packing the
  asset and deriving the review-page URL from the live webserver port instead
  of the hard-coded 3080.
- The plugin manager's update control applies only to `~/.dsh/plugins`
  staged copies; template-activated bundles update with the installation.
