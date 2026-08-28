// assemble-dist.mjs — build the dsh runtime ENTIRELY from the deepseek-harness
// source checkout into dist/dsh (+ dist/dsh.zip). Replaces the retired vendor
// flow (vendor-dsh.mjs npm-release copy + pack-vendor.mjs overlay list): every
// @deepseek-ai package the backend loads now comes from THIS checkout's built
// lib/ — there is no npm-release base and no per-package overlay list.
//
// Steps:
//   1) pnpm run build in deepseek-harness (tsc -b host+client aggregates,
//      tsdown bundles, vite web frontend) — skippable with --skip-build
//   2) pnpm --filter @deepseek-ai/dsh deploy --legacy --prod --config.*=…
//      → dist/dsh: apps/cli plus its whole workspace dependency closure as
//      real files (no symlinks), third-party deps from the store
//   3) restore the direct dependencies pnpm's legacy hoister omits and
//      materialize leftover symlinks (same treatment as
//      deepseek-harness/scripts/build-exe-for-python-sdk.ts deployStaging)
//   4) structural sanity: bin.js, web-frontend dist, wire-contract types
//   5) prune runtime-irrelevant files via robocopy exclusions (~250 → ~120 MB)
//      and 7za store-mode zip → dist/dsh.zip (electron-builder
//      extraResources; the app extracts it to %APPDATA%/LX-DSH/dsh on first
//      launch)
//
// Usage:  npm run assemble [-- --skip-build]   (from the lx-dsh root)
import { existsSync, readdirSync, statSync, rmSync, mkdirSync, cpSync, lstatSync, realpathSync, readFileSync, renameSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dshSrc = join(root, '..', 'deepseek-harness');
const outDir = join(root, 'dist', 'dsh');
const outZip = join(root, 'dist', 'dsh.zip');
const stageDir = join(root, 'dist', '.dsh-stage');
const skipBuild = process.argv.includes('--skip-build');

const isWin = process.platform === 'win32';
const pnpm = () => (isWin ? 'pnpm.cmd' : 'pnpm');

// ── 1. full source build ────────────────────────────────────────────────────

function buildFromSource() {
  if (skipBuild) {
    console.log('[assemble] --skip-build: using the existing deepseek-harness lib/ build');
    return;
  }
  console.log('[assemble] pnpm run build (deepseek-harness: tsc -b host+client, tsdown, vite web)...');
  const result = spawnSync(pnpm(), ['run', 'build'], {
    cwd: dshSrc, stdio: 'inherit', shell: isWin,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error('deepseek-harness build exited with ' + String(result.status ?? result.signal));
}

// ── 2. deploy the CLI closure ───────────────────────────────────────────────

function deploy() {
  if (!existsSync(join(dshSrc, 'apps', 'cli', 'lib', 'bin.js'))) {
    throw new Error('deepseek-harness/apps/cli/lib/bin.js missing — the source build did not produce the CLI');
  }
  rmSync(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  console.log('[assemble] pnpm deploy (@deepseek-ai/dsh, legacy hoisted prod) → dist/dsh ...');
  execFileSync(pnpm(), [
    '--filter', '@deepseek-ai/dsh', 'deploy',
    '--legacy', '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true',
    outDir,
  ], { cwd: dshSrc, stdio: 'inherit', shell: isWin });
}

// ── 3. repair the deployed tree ─────────────────────────────────────────────
// Ported from build-exe-for-python-sdk.ts: pnpm's legacy hoister places some
// direct dependencies beside the deploy source instead of in the target, and
// leaves workspace symlinks behind. Both must be resolved so the packaged
// payload is a plain, self-contained file tree.

function copyDereferenced(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  const nestedNodeModules = join(source, 'node_modules');
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: (path) => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
  });
}

function restoreLegacyHoists() {
  const manifest = JSON.parse(readFileSync(join(outDir, 'package.json'), 'utf8'));
  const restored = [];
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const destination = join(outDir, 'node_modules', dependency);
    if (existsSync(destination)) continue;
    const source = join(dshSrc, 'node_modules', dependency);
    if (!existsSync(source)) {
      throw new Error(`[assemble] deployed dependency ${dependency} is absent from both ${destination} and ${source}`);
    }
    copyDereferenced(source, destination);
    restored.push(dependency);
  }
  const stillMissing = Object.keys(manifest.dependencies ?? {})
    .filter((dependency) => !existsSync(join(outDir, 'node_modules', dependency)));
  if (stillMissing.length > 0) throw new Error(`[assemble] staged dependencies remain missing: ${stillMissing.join(', ')}`);
  if (restored.length > 0) console.log(`[assemble] restored legacy deploy hoists: ${restored.join(', ')}`);
}

// ── 3b. close the workspace dependency closure ──────────────────────────────
// pnpm's legacy hoister resolves workspace packages that are only TRANSITIVE
// dependencies of other workspace packages (e.g. @deepseek-ai/cosmokit under
// cordis) from the monorepo root — a standalone deployed tree has no root, so
// those imports fail at boot. Index every workspace package by name, then walk
// the deployed manifests and copy any missing @deepseek-ai/* package straight
// from the source checkout until the closure stops growing.

function indexWorkspacePackages() {
  const byName = new Map();
  for (const area of ['packages', 'vendor', 'apps']) {
    const base = join(dshSrc, area);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidates = [join(base, entry.name)];
      // packages/<group>/<pkg> layout: one extra level for group directories.
      const nested = join(base, entry.name);
      for (const sub of readdirSync(nested, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        candidates.push(join(nested, sub.name));
      }
      for (const dir of candidates) {
        const manifestPath = join(dir, 'package.json');
        if (!existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
          if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/') && !byName.has(manifest.name)) {
            byName.set(manifest.name, dir);
          }
        } catch { /* not a readable package manifest */ }
      }
    }
  }
  return byName;
}

function restoreWorkspaceClosure() {
  const byName = indexWorkspacePackages();
  const deployedScope = join(outDir, 'node_modules', '@deepseek-ai');
  const present = new Set(existsSync(deployedScope) ? readdirSync(deployedScope) : []);
  // Some workspace imports are dynamic/speculative and never appear in any
  // manifest (dsh-app-boot → cordis-plugin-group); scan the deployed JS text
  // for @deepseek-ai/* specifiers instead of trusting the manifests alone.
  const referenced = new Set();
  const scanJs = (dir, depth) => {
    if (depth > 6) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'types') continue;
        scanJs(path, depth + 1);
      } else if (/\.(mjs|cjs|js)$/.test(entry.name)) {
        const text = readFileSync(path, 'utf8');
        for (const match of text.matchAll(/@deepseek-ai\/([a-z0-9-]+)/g)) {
          // A name ending in '-' is the static prefix of a template-literal
          // specifier (`@deepseek-ai/dsh-${kind}`) — not a real package.
          if (!match[1].endsWith('-')) referenced.add(`@deepseek-ai/${match[1]}`);
        }
      }
    }
  };
  for (const name of present) scanJs(join(deployedScope, name), 0);
  const missing = [...referenced].filter(name => !present.has(name.slice('@deepseek-ai/'.length)));
  const copied = [];
  while (missing.length > 0) {
    const name = missing.shift();
    const dir = byName.get(name);
    if (dir === undefined) {
      // A specifier with no workspace package is a dead reference (a planned
      // or renamed plugin behind a conditional import); the boot smoke below
      // decides whether anything actually reachable is broken.
      console.warn(`[assemble] skipping referenced-but-absent workspace package: ${name}`);
      continue;
    }
    const destination = join(deployedScope, name.slice('@deepseek-ai/'.length));
    copyDereferenced(dir, destination);
    present.add(name.slice('@deepseek-ai/'.length));
    copied.push(name);
    scanJs(destination, 0);
  }
  if (copied.length > 0) console.log(`[assemble] restored workspace closure: ${copied.join(', ')}`);
}

function findSymlink(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) return path;
    if (metadata.isDirectory()) {
      const nested = findSymlink(path);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function materializeStagedLinks() {
  const nodeModules = join(outDir, 'node_modules');
  let remaining = findSymlink(nodeModules);
  while (remaining !== undefined) {
    const segments = remaining.slice(nodeModules.length + 1).split(sep);
    const binIndex = segments.lastIndexOf('.bin');
    if (binIndex >= 0) {
      // .bin shims are irrelevant (the backend spawns lib/bin.js directly).
      rmSync(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true });
      remaining = findSymlink(nodeModules);
      continue;
    }
    const source = realpathSync(remaining);
    rmSync(remaining, { recursive: true, force: true });
    copyDereferenced(source, remaining);
    remaining = findSymlink(nodeModules);
  }
  console.log('[assemble] symlinks materialized (plain file tree)');
}

// ── 5. prune + zip (robocopy exclusions from pack-vendor.mjs) ───────────────

function find7za() {
  const cache = join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache');
  if (existsSync(cache)) {
    for (const verDir of readdirSync(cache)) {
      if (!verDir.startsWith('7zip')) continue;
      const verRoot = join(cache, verDir);
      if (!existsSync(verRoot) || !statSync(verRoot).isDirectory()) continue;
      for (const sub of readdirSync(verRoot)) {
        const cand = join(verRoot, sub, 'bin', '7za.exe');
        if (existsSync(cand)) return cand;
      }
    }
  }
  try {
    execFileSync('where.exe', ['7za'], { stdio: 'ignore' });
    return '7za';
  } catch {
    /* not on PATH */
  }
  throw new Error('7za not found (electron-builder cache or PATH)');
}

function pruneAndZip() {
  const t0 = Date.now();
  rmSync(stageDir, { recursive: true, force: true });
  rmSync(outZip, { force: true });
  mkdirSync(stageDir, { recursive: true });

  console.log('[assemble] pruning via robocopy...');
  // robocopy exit codes 0-7 = success (1 = files copied), 8+ = error.
  // CAUTION: do NOT exclude `doc`/`docs` — the `yaml` package has a runtime
  // `dist/doc/` source dir (Document/Node classes) that crashes dsh boot if
  // pruned. Only exclude names that are unambiguously non-runtime.
  try {
    execFileSync('robocopy', [
      outDir, stageDir, '/E',
      '/NJH', '/NJS', '/NDL', '/NFL', '/NC', '/NS', '/NP',
      '/R:1', '/W:1',
      // directories
      '/XD', '@types', '*arm64*', '*darwin*', '*linux*',
      'tests', 'example', 'examples', 'benchmark', 'benchmarks',
      // files
      '/XF', '*.map', '*.d.ts', '*.d.cts', '*.d.mts', '*.markdown', '*.tsbuildinfo',
      '*.flow', '*.md',
      'LICENSE*', 'LICENCE*', 'AUTHORS*', 'CHANGELOG*', 'CONTRIBUTING*', 'HISTORY*',
    ], { stdio: 'inherit' });
  } catch (e) {
    if (e.status === undefined || e.status >= 8) {
      throw new Error('robocopy failed with exit code ' + e.status);
    }
  }

  let kept = 0, keptBytes = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else { kept++; keptBytes += statSync(f).size; }
    }
  };
  walk(stageDir);
  console.log(`[assemble] pruned tree: ${kept} files, ${(keptBytes / 1048576).toFixed(1)} MB`);

  // Boot the PRUNED tree: the exclusion list is the last thing that touches
  // the runtime before it ships, so the smoke test must run against exactly
  // what ships — not the unpruned deploy tree.
  const probe = spawnSync(process.execPath, [join(stageDir, 'lib', 'bin.js'), '-V'], {
    cwd: stageDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
  });
  if (probe.status !== 0) {
    throw new Error(`[assemble] pruned tree does not boot\n${probe.stderr || probe.stdout || ''}`.slice(0, 2000));
  }
  console.log(`[assemble] pruned tree boots (dsh ${probe.stdout.trim()})`);

  console.log('[assemble] zipping (store mode, no compression CPU)...');
  const sevenZip = find7za();
  execFileSync(sevenZip, ['a', '-bd', '-tzip', '-mx=0', outZip, join(stageDir, '*')], { stdio: 'inherit' });

  const size = statSync(outZip).size;
  console.log(`[assemble] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — dist/dsh.zip ${(size / 1048576).toFixed(1)} MB`);
  // The PRUNED tree becomes dist/dsh: electron-builder ships it directly as
  // resources/dsh/ (plain files — no zip, no first-launch extraction). The
  // zip stays only for the future delta-update flow.
  rmSync(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  renameSync(stageDir, outDir);
}

// ── 4. structural sanity ────────────────────────────────────────────────────

function sanity() {
  const required = [
    join(outDir, 'lib', 'bin.js'),
    join(outDir, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'),
    join(outDir, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'types', 'fetch', 'client.js'),
  ];
  for (const f of required) {
    if (!existsSync(f)) throw new Error(`[assemble] sanity failed: ${f} missing from the deployed tree`);
  }
  let packages = 0;
  const scopeDir = join(outDir, 'node_modules', '@deepseek-ai');
  if (existsSync(scopeDir)) packages = readdirSync(scopeDir).length;
  // Boot smoke: module resolution is the one thing file checks cannot prove —
  // the 0.3.0 release shipped a tree that was missing @deepseek-ai/cosmokit
  // and only failed at spawn time on the user's machine.
  const probe = spawnSync(process.execPath, [join(outDir, 'lib', 'bin.js'), '-V'], {
    cwd: outDir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
  });
  if (probe.status !== 0 || (probe.stderr ?? '').includes('ERR_MODULE_NOT_FOUND')) {
    throw new Error(`[assemble] sanity failed: the deployed CLI does not boot\n${probe.stderr || probe.stdout || ''}`.slice(0, 2000));
  }
  console.log(`[assemble] sanity ok — ${packages} @deepseek-ai packages, CLI boots (dsh ${probe.stdout.trim()})`);
}

// ── main: build → deploy → repair → sanity → prune+zip ──────────────────────

const t0 = Date.now();
console.log('[assemble] building the dsh runtime from deepseek-harness source...');
buildFromSource();
deploy();
restoreLegacyHoists();
materializeStagedLinks();
restoreWorkspaceClosure();
sanity();
pruneAndZip();
console.log(`[assemble] complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
