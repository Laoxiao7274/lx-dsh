// post-vendor.mjs — mirrors vendor/dsh (including node_modules) into the
// unpacked app between `electron-builder --win --dir` and the `--prepackaged`
// NSIS step. electron-builder's extraResources copies everything as-is (no
// NSIS path-length limits), so post-vendor handles the full copy.
//
// See the "dist" script in package.json.
import { existsSync, rmSync, readdirSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'vendor', 'dsh');
const dst = join(root, 'dist', 'win-unpacked', 'resources', 'vendor', 'dsh');

if (!existsSync(join(src, 'lib', 'bin.js'))) {
  console.error('[post-vendor] vendor/dsh missing or incomplete — run `npm run vendor` first');
  process.exit(1);
}

// Verify vendor has no symlinks — should be real files from the global npm install.
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

function countFiles(p) {
  let n = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    if (e.isDirectory()) n += countFiles(f);
    else n++;
  }
  return n;
}

// Clean destination (may have stale files from a previous build).
rmSync(dst, { recursive: true, force: true });

const t0 = Date.now();
console.log('[post-vendor] robocopy vendor/dsh -> dist/win-unpacked/resources/vendor/dsh');

// robocopy is far faster than Node cpSync for large trees on Windows.
// Exit codes 0-7 = success, 8+ = error.
try {
  execFileSync('robocopy', [src, dst, '/E', '/NJH', '/NJS', '/NDL', '/NFL', '/NC', '/NS', '/NP', '/R:1', '/W:1'], { stdio: 'inherit' });
} catch (e) {
  if (e.status === undefined || e.status >= 8) {
    console.error('[post-vendor] robocopy failed with exit code ' + e.status);
    process.exit(1);
  }
}

const n = countFiles(dst);
const expect = countFiles(src);
console.log(`[post-vendor] done: ${n}/${expect} files in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (n !== expect) {
  console.error('[post-vendor] file count mismatch — abort');
  process.exit(1);
}
