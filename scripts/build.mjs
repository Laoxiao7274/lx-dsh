import { execFileSync } from 'node:child_process';
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
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: join(root, 'dist-electron'),
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
};
// Named entry points so output lands FLAT (dist-electron/main.cjs + index.cjs) —
// the paths package.json "main" and the preload actually load. Array entryPoints
// would preserve the source directories (dist-electron/electron/main.cjs), which
// nothing loads.
await esbuild.build(Object.assign({ entryPoints: { main: join(root, 'electron', 'main.ts'), index: join(root, 'preload', 'index.ts') } }, common));
console.log('built dist-electron/ (main.cjs, index.cjs)');
