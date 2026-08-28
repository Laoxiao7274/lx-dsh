// Locate the global dsh install, a Node binary, and the wire-contract package.
// Dependency-free; used by the M0 spike and (later) the Electron main process.
// (The normal runtime path no longer lands here: dev runs the deepseek-harness
// workspace build and packaged builds extract dist/dsh.zip — see dsh-runtime.ts.)
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
// workspace build / packaged extraction); fall back to the global npm install
// as a last resort when neither was materialized yet.
export function findDshRoot(vendorRoot) {
  if (vendorRoot && existsSync(join(vendorRoot, 'lib', 'bin.js'))) return vendorRoot;
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
  const c = join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy');
  if (existsSync(join(c, 'lib', 'types', 'fetch', 'client.js'))) return c;
  throw new Error('wire contract @deepseek-ai/dsh-host-apiproxy not found under ' + dshRoot);
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
