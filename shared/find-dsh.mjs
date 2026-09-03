// Locate the global dsh install, a Node binary, and the wire-contract package.
// Dependency-free; used by the M0 spike and (later) the Electron main process.
// (The normal runtime path no longer lands here: dev runs the harness/
// workspace build and packaged builds ship resources/dsh/ — see dsh-runtime.ts.)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Locate the npm-global (or LX_DSH_ROOT) dsh install. Last-resort lookup used
// by findDshRoot when no resolved runtime root was handed in.
export function findGlobalDshRoot() {
  if (process.env.LX_DSH_ROOT) {
    if (existsSync(join(process.env.LX_DSH_ROOT, 'lib', 'bin.js'))) return process.env.LX_DSH_ROOT;
    throw new Error('LX_DSH_ROOT is set but lib/bin.js is missing under ' + process.env.LX_DSH_ROOT);
  }
  const candidates = [];
  try {
    const out = execFileSync('where.exe', ['dsh'], { encoding: 'utf8', windowsHide: true });
    for (const line of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
      candidates.push(join(dirname(line), 'node_modules', '@deepseek-ai', 'dsh'));
    }
  } catch {
    // dsh not on PATH; fall through to the default npm global location
  }
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh'));
  }
  for (const c of candidates) {
    if (c && existsSync(join(c, 'lib', 'bin.js'))) return c;
  }
  throw new Error('dsh not found. Install it with: npm i -g @deepseek-ai/dsh (or set LX_DSH_ROOT to the package dir)');
}

// Resolve the dsh root to run: the caller's resolved runtime root wins (dev
// workspace build / packaged resources/dsh). `allowGlobal` keeps the npm-global
// install as a dev-time last resort; a PACKAGED build must never run it — the
// global copy is whatever official release was installed once, which silently
// replaced the app's own runtime and surfaced a stale UI (the 0.3.0 incident).
export function findDshRoot(vendorRoot, { allowGlobal = true } = {}) {
  if (vendorRoot && existsSync(join(vendorRoot, 'lib', 'bin.js'))) return vendorRoot;
  if (!allowGlobal) {
    throw new Error(
      'packaged runtime unresolved: resources/dsh is missing lib/bin.js. '
      + 'Reinstall LX-DSH so the runtime ships intact.',
    );
  }
  return findGlobalDshRoot();
}

export function findNode() {
  if (process.env.LX_NODE_PATH && existsSync(process.env.LX_NODE_PATH)) return process.env.LX_NODE_PATH;
  try {
    const out = execFileSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true });
    const first = out.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    if (first && existsSync(first)) return first;
  } catch {
    // no node on PATH
  }
  return process.execPath;
}

export function findContractRoot(dshRoot) {
  // Since upstream 0.1.2 the apiproxy RPC layer is retired; a tree that still
  // carries it is a pre-merge dsh (0.1.1 or older) whose wire stack this
  // shell no longer speaks. Absence of the package is the version marker.
  const legacy = join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy');
  if (existsSync(legacy)) {
    throw new Error('dsh under ' + dshRoot + ' is pre-0.1.2 (still ships dsh-host-apiproxy) — this build needs the merged runtime');
  }
  return dshRoot;
}

// CLI: node shared/find-dsh.mjs
// When bundled to CJS by esbuild, import.meta is unavailable; the try/catch
// keeps the CLI entry check dead in that context without a build warning.
let metaUrl = '';
try { metaUrl = import.meta.url; } catch { /* CJS bundle: no import.meta */ }
if (metaUrl && process.argv[1] === fileURLToPath(metaUrl)) {
  const dshRoot = findDshRoot();
  console.log(JSON.stringify({ dshRoot, node: findNode(), contract: findContractRoot(dshRoot) }, null, 2));
}
