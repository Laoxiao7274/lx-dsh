import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1) renderer (Vite) -> ui/dist  (vite bin run under node — .cmd spawn needs shell mode)
console.log('building ui/ (vite)…');
execFileSync(
  process.execPath,
  [join(root, 'ui', 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
  { cwd: join(root, 'ui'), stdio: 'inherit' },
);

// 2) main + preload (esbuild) -> dist-electron
// Clean the outdir first: esbuild writes FLAT (main.cjs + index.cjs), but stale
// subdirs from an older dir-preserving layout (dist-electron/electron/…,
// dist-electron/preload/…) would otherwise survive on disk and get bundled
// into app.asar by electron-builder's "dist-electron/**" glob — dead duplicates.
const outDir = join(root, 'dist-electron');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: outDir,
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  // Production build: no sourcemaps (a 1MB+ .map would otherwise be packed
  // into app.asar). The dev loop (scripts/dev.mjs) keeps sourcemap: true.
  sourcemap: false,
  logLevel: 'warning',
};
// Named entry points so output lands FLAT (dist-electron/main.cjs + index.cjs) —
// the paths package.json "main" and the preload actually load. Array entryPoints
// would preserve the source directories (dist-electron/electron/main.cjs), which
// nothing loads.
await esbuild.build(Object.assign({ entryPoints: { main: join(root, 'electron', 'main.ts'), index: join(root, 'preload', 'index.ts') } }, common));
console.log('built dist-electron/ (main.cjs, index.cjs)');
