// make-portable.mjs — After electron-builder --win --dir + post-vendor.mjs,
// the win-unpacked directory is complete. Create a portable exe by:
// 1. Running electron-builder --win portable (from source, not --prepackaged)
//    which succeeds but strips node_modules from extraResources
// 2. Then we can't fix it post-hoc because the exe is already sealed.
//
// So instead: just zip the complete win-unpacked directory. The user extracts
// and runs LX-DSH.exe directly. This is the fastest reliable path.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist', 'win-unpacked');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const out = join(root, 'dist', `LX-DSH-${version}-portable.zip`);

if (!existsSync(join(src, 'LX-DSH.exe'))) {
  console.error('[make-portable] dist/win-unpacked/LX-DSH.exe missing');
  process.exit(1);
}
if (!existsSync(join(src, 'resources', 'vendor', 'dsh', 'node_modules'))) {
  console.error('[make-portable] vendor/dsh/node_modules missing — run post-vendor first');
  process.exit(1);
}

// Find 7za from electron-builder's cache
import { readdirSync } from 'node:fs';
const cache7z = join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', '7zip@1.0.0');
let sevenZip = '7za';
if (existsSync(cache7z)) {
  for (const dir of readdirSync(cache7z)) {
    const candidate = join(cache7z, dir, 'bin', '7za.exe');
    if (existsSync(candidate)) { sevenZip = candidate; break; }
  }
}

console.log('[make-portable] creating store-mode zip from complete win-unpacked...');
const t0 = Date.now();
try {
  execFileSync(sevenZip, ['a', '-bd', '-mx=0', '-mtc=off', out, '.'], {
    cwd: src,
    stdio: 'inherit',
  });
} catch (e) {
  console.error('[make-portable] 7za failed:', e.message);
  process.exit(1);
}
const size = (await import('node:fs')).statSync(out).size;
console.log(`[make-portable] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${(size / 1048576).toFixed(1)} MB`);
console.log(`[make-portable] output: ${out}`);
