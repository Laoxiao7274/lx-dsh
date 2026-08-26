// Re-vendor the workspace-built HEAD lib over the vendored rc.8 dsh tree, so
// the packaged backend matches the HEAD frontend (no WebSocket/SSE drift).
//   - apps/cli/lib/**  -> vendor/dsh/lib/**
//   - packages/*/*/lib/** -> vendor/dsh/node_modules/@deepseek-ai/dsh-<name>/lib/**
// Only overwrites lib/ where the vendored target exists, so packages not in the
// rc.8 install are skipped (the HEAD bin.js must not require absent packages).
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const harness = join(root, '..', 'deepseek-harness');
const vendor = join(root, 'vendor', 'dsh');
const nm = join(vendor, 'node_modules', '@deepseek-ai');

let copied = 0, skipped = 0, missing = 0;

// 1. apps/cli/lib -> vendor/dsh/lib (the bin.js entry + profile booters)
const cliLib = join(harness, 'apps', 'cli', 'lib');
if (existsSync(cliLib)) {
  cpSync(cliLib, join(vendor, 'lib'), { recursive: true, force: true });
  console.log('revendor: apps/cli/lib -> vendor/dsh/lib (' + readdirSync(cliLib).length + ' entries)');
} else {
  console.error('revendor: apps/cli/lib missing — was the full build run?');
  process.exit(1);
}

// 2. packages/*/*/lib -> vendor/dsh/node_modules/@deepseek-ai/dsh-<name>/lib
for (const group of readdirSync(join(harness, 'packages'))) {
  const gp = join(harness, 'packages', group);
  if (!statSync(gp).isDirectory()) continue;
  for (const name of readdirSync(gp)) {
    const pkgLib = join(gp, name, 'lib');
    if (!existsSync(pkgLib)) continue;
    const target = join(nm, 'dsh-' + name, 'lib');
    if (!existsSync(join(nm, 'dsh-' + name))) {
      missing++;
      continue; // package not in the rc.8 vendored install; skip
    }
    cpSync(pkgLib, target, { recursive: true, force: true });
    copied++;
  }
}
console.log('revendor: copied ' + copied + ' package libs, skipped ' + missing + ' not-in-vendor');

// 3. fresh frontend dist -> vendor/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist
const webDist = join(harness, 'apps', 'web', 'dist');
const feDst = join(nm, 'dsh-web-frontend', 'dist');
if (existsSync(webDist) && existsSync(feDst)) {
  cpSync(webDist, feDst, { recursive: true, force: true });
  console.log('revendor: refreshed web frontend dist');
}

// 4. re-apply the boot-facade patch to the freshly-copied index.html (the rc.8
// backend's injectBootManifest predates the facade queue script the HEAD shell
// expects). Idempotent: skip if already patched.
const idxPath = join(feDst, 'index.html');
if (existsSync(idxPath)) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const html = readFileSync(idxPath, 'utf8');
  if (!html.includes('__ModuleLoader__')) {
    const queue = [
      '<script>(()=>{',
      'const pendingQueue=[]',
      'window.__ModuleLoader__={mode:"queue",pendingQueue,load(r){pendingQueue.push(r)},create(o){',
      'if(this.mode!=="queue")throw new Error("client-modules: window.__ModuleLoader__.create called after module-system boot")',
      'const i=pendingQueue.findIndex(r=>r.id==="@deepseek-ai/dsh-client-modules")',
      'const r=pendingQueue[i];if(!r)throw new Error("client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js")',
      'pendingQueue.splice(i,1);const x=r.factory(s=>{throw new Error("client-modules: external before boot: "+s)})',
      'if(!x||typeof x.createClientModuleSystem!=="function"||typeof x.apply!=="function")throw new Error("client-modules: bad bootstrap face")',
      'return x.createClientModuleSystem(this,{id:r.id,exports:x},o)}}})()</script>',
      '<script src="/plugins/@deepseek-ai/dsh-client-modules/client.js"></script>',
      '<script src="/plugins/@deepseek-ai/dsh-client-runtime/client.js"></script>',
    ].join('\n');
    const marker = '<head>';
    const i = html.indexOf(marker);
    if (i >= 0) {
      writeFileSync(idxPath, html.slice(0, i + marker.length) + '\n' + queue + html.slice(i + marker.length));
      console.log('revendor: re-applied boot-facade patch to index.html');
    }
  } else {
    console.log('revendor: index.html already patched');
  }
}

console.log('revendor: complete');
