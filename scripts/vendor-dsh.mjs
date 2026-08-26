// Vendor a self-contained copy of the global dsh install into <app>/vendor/dsh.
//
// The source MUST be a real npm install (not a pnpm workspace). pnpm uses
// symlinks to a virtual store (.pnpm) that lives outside the package directory.
// Copying with dereference would chase those symlinks into a multi-GB store,
// producing massive duplication and taking minutes instead of seconds.
//
// The global npm install at %APPDATA%/npm/node_modules/@deepseek-ai/dsh has
// real files and the full dependency closure — that is the correct source.
//
// Run `npm run vendor` after updating the global dsh to refresh the bundled copy.
// Set LX_DSH_VENDOR_SRC to vendor from a specific directory.
import { cpSync, existsSync, rmSync, lstatSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dst = join(root, 'vendor', 'dsh');

// Resolve the vendor source. Deliberately does NOT use findGlobalDshRoot()
// (from shared/find-dsh.mjs) because that checks LX_DSH_ROOT, which may point
// at a pnpm workspace whose node_modules are symlinks to a .pnpm virtual store.
// Vendoring from there produces broken or massively duplicated copies.
function resolveVendorSource() {
  if (process.env.LX_DSH_VENDOR_SRC) {
    const src = process.env.LX_DSH_VENDOR_SRC;
    if (!existsSync(join(src, 'lib', 'bin.js'))) {
      throw new Error('LX_DSH_VENDOR_SRC is set but lib/bin.js is missing: ' + src);
    }
    return src;
  }
  // Global npm install: %APPDATA%/npm/node_modules/@deepseek-ai/dsh
  if (process.env.APPDATA) {
    const global = join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh');
    if (existsSync(join(global, 'lib', 'bin.js'))) return global;
  }
  throw new Error(
    'dsh global install not found. Install it with: npm i -g @deepseek-ai/dsh\n' +
    'Or set LX_DSH_VENDOR_SRC to a real (non-pnpm) dsh install directory.'
  );
}

// Count symlinks anywhere in a directory tree (pnpm workspace indicator).
function countSymlinks(dir) {
  let n = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      let st;
      try { st = lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) { n++; continue; }
      if (st.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return n;
}

const src = resolveVendorSource();

// Refuse to vendor from a pnpm workspace (symlinked node_modules).
// A dereference copy would chase symlinks into a multi-GB .pnpm store.
const nmDir = join(src, 'node_modules');
if (existsSync(nmDir)) {
  const symCount = countSymlinks(nmDir);
  if (symCount > 0) {
    throw new Error(
      `Source has ${symCount} symlinks in node_modules (pnpm workspace?). ` +
      'Vendoring from a pnpm workspace chases symlinks into a multi-GB .pnpm store. ' +
      'Install dsh globally with npm instead: npm i -g @deepseek-ai/dsh'
    );
  }
}

console.log('vendor: source =', src);
console.log('vendor: dest   =', dst);

if (existsSync(dst)) {
  console.log('vendor: removing existing copy…');
  // Use maxRetries to handle Windows file locks. The recursive flag
  // removes symlinks as entries without following them — critical for
  // pnpm-style circular junctions (cordis -> cordis-plugin-include -> cordis).
  rmSync(dst, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
}

// Use robocopy on Windows — far faster than Node cpSync for large file trees
// (~29 000 files / ~190 MB). Falls back to cpSync on other platforms.
const isWin = process.platform === 'win32';
const t0 = Date.now();

if (isWin) {
  console.log('vendor: robocopy (~190 MB, a few seconds)...');
  // robocopy exit codes 0-7 are success; 8+ are errors.
  try {
    execFileSync('robocopy', [src, dst, '/E', '/NJH', '/NJS', '/NDL', '/NFL', '/NC', '/NS', '/NP', '/R:1', '/W:1'], { stdio: 'inherit' });
  } catch (e) {
    if (e.status === undefined || e.status >= 8) {
      throw new Error('robocopy failed with exit code ' + e.status);
    }
  }
} else {
  console.log('vendor: cpSync...');
  cpSync(src, dst, { recursive: true });
}

console.log(`vendor: copied in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Verify the result has no symlinks (a clean copy has only real files).
const resultSyms = countSymlinks(dst);
if (resultSyms > 0) {
  throw new Error(`vendored copy has ${resultSyms} symlinks — copy was not clean`);
}

// Smoke test: the vendored copy must report its version when run standalone.
const v = execFileSync(process.execPath, [join(dst, 'lib', 'bin.js'), '-V'], {
  encoding: 'utf8',
}).trim();
console.log('vendor: OK — vendored dsh reports version', v);
console.log('vendor: complete. LX-DSH will now run the self-contained copy.');
