// scripts/build-update.mjs — build the lightweight update package.
//
// After the full build (electron-builder --win --dir with assemble-dist's
// dsh.zip in resources), the dist/win-unpacked directory is the complete
// release. This script:
//
//   1. sha512-hashes every file in win-unpacked
//   2. diffs against the previous full manifest (.update-base.json at repo root)
//   3. stages changed + new files alongside an update.json manifest
//   4. zips them into dist/LX-DSH-update-<version>.zip  (the update package)
//   5. saves the current full manifest as the new base for the next build
//
// The update.json inside the zip carries version + baseVersion + per-file
// sha512 + a deleted[] list, so the client verifies every file before applying
// the patch and removes obsolete files after.
//
// If no previous base exists (first build) every file is "changed" — the
// update package becomes a full snapshot, functionally equivalent to a fresh
// install payload.  That is fine for the very first release.
//
// Usage:  node scripts/build-update.mjs   (after electron-builder --win --dir)
import { createHash } from 'node:crypto';
import {
  existsSync, readFileSync, writeFileSync, statSync, lstatSync,
  copyFileSync, mkdirSync, rmSync, readdirSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist', 'win-unpacked');
// Base manifest lives outside dist/ (which is gitignored and rebuilt from
// scratch). Keeping it at the project root preserves the delta baseline
// across clean rebuilds, so the next build produces a real delta instead
// of a full snapshot.
const basePath = join(root, '.update-base.json');
const stageDir = join(root, 'dist', '.update-stage');

// ── helpers ──────────────────────────────────────────────────────────────────

function sha512File(p) {
  return createHash('sha512').update(readFileSync(p)).digest('hex');
}

// walk win-unpacked, hash every file -> Map<relPath, { sha512, size }>
function hashTree(dir) {
  const files = new Map();
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      const full = join(d, name);
      let st;
      try { st = lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full);
      else files.set(
        relative(dir, full).split('\\').join('/'),
        { sha512: sha512File(full), size: st.size },
      );
    }
  };
  walk(dir);
  return files;
}

// find 7za (same lookup as make-portable.mjs / build-delta.mjs)
function find7za() {
  const cache7z = join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', '7zip@1.0.0');
  if (existsSync(cache7z)) {
    for (const dir of readdirSync(cache7z)) {
      const candidate = join(cache7z, dir, 'bin', '7za.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  return '7za';
}

// simple semver compare (a > b → positive) — good enough for x.y.z
function cmpVer(a, b) {
  const pa = String(a).split(/[.+\-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.+\-]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ── main ─────────────────────────────────────────────────────────────────────

if (!existsSync(join(src, 'LX-DSH.exe'))) {
  console.error('[build-update] dist/win-unpacked/LX-DSH.exe missing — run build + electron-builder --win --dir first');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

console.log('[build-update] hashing win-unpacked...');
const current = hashTree(src);
const prev = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : null;
const baseVersion = prev?.version ?? null;

// diff
const changed = [];
for (const [path, info] of current) {
  if (!prev?.files[path] || prev.files[path].sha512 !== info.sha512) changed.push(path);
}
const deleted = prev ? Object.keys(prev.files).filter((p) => !current.has(p)) : [];
console.log(`[build-update] base=${baseVersion ?? 'none'} changed=${changed.length} deleted=${deleted.length} total=${current.size}`);

// stage: copy changed files + write manifest
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
for (const p of changed) {
  const full = join(src, p);
  const staged = join(stageDir, p);
  mkdirSync(dirname(staged), { recursive: true });
  copyFileSync(full, staged);
}

// The manifest the client reads after extracting the zip.
const manifest = {
  kind: 'lx-dsh-update',
  version,
  baseVersion, // null on first build → client treats as full payload
  date: new Date().toISOString(),
  files: Object.fromEntries(
    changed.map((p) => [p, { sha512: current.get(p).sha512, size: current.get(p).size }]),
  ),
  deleted, // rel paths removed since baseVersion
};
writeFileSync(join(stageDir, 'update.json'), JSON.stringify(manifest, null, 2));

// zip it (store mode is fastest; update payloads are small after delta)
const out = join(root, 'dist', `LX-DSH-update-${version}.zip`);
rmSync(out, { force: true });
console.log('[build-update] zipping update package...');
execFileSync(find7za(), ['a', '-bd', '-mx=6', '-mtc=off', out, '.'], {
  cwd: stageDir,
  stdio: 'inherit',
});
rmSync(stageDir, { recursive: true, force: true });

// The ready-to-upload server manifest: /update/win/latest.json. `notes` feeds
// the in-app update dialog's changelog section — author it in RELEASE_NOTES.md
// at the repo root before running this script; absent file → no notes field.
const notesPath = join(root, 'RELEASE_NOTES.md');
const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8').trim() : undefined;
const latest = {
  version,
  baseVersion,
  channel: 'stable',
  date: new Date().toISOString(),
  url: `/download/${version}/LX-DSH-update-${version}.zip`,
  sha512: createHash('sha512').update(readFileSync(out)).digest('hex'),
  size: statSync(out).size,
  fullFallback: false,
  ...notes !== undefined ? { notes } : {},
};
writeFileSync(join(root, 'dist', 'latest.json'), JSON.stringify(latest, null, 2));
console.log('[build-update] server manifest: dist/latest.json — upload it next to the zip on the update server');

// save current full manifest as new base
writeFileSync(basePath, JSON.stringify({ version, files: Object.fromEntries(current) }));

const size = statSync(out).size;
console.log(`[build-update] done — ${(size / 1048576).toFixed(1)} MB (${changed.length} files, ${deleted.length} deleted)`);
console.log('[build-update] output:', out);
