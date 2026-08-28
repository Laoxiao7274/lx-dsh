// Print the whenReady startup block from the packaged bundle.
const { execFileSync } = require('node:child_process');
const { readFileSync, rmSync, mkdirSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const exe = join(process.env.USERPROFILE, 'Downloads', 'LX-DSH Setup 0.3.1.exe');
const tmp = join(process.env.TEMP, 'nsis-extract');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
function find7za() {
  const cache = join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache');
  if (existsSync(cache)) {
    for (const verDir of readdirSync(cache)) {
      if (!verDir.startsWith('7zip')) continue;
      for (const sub of readdirSync(join(cache, verDir))) {
        const cand = join(cache, verDir, sub, 'bin', '7za.exe');
        if (existsSync(cand)) return cand;
      }
    }
  }
  return '7za';
}
execFileSync(find7za(), ['e', exe, '-o' + tmp, 'app.asar', '-r', '-y'], { stdio: 'ignore' });
function find(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    } else if (e.name === name) return p;
  }
  return null;
}
const asar = find(tmp, 'app.asar');
const text = readFileSync(asar).toString('latin1');
// find the whenReady extraction call: search for the announce string
const needle = '\\u9996\\u6B21\\u542F\\u52A8';
let idx = text.indexOf(needle);
if (idx === -1) idx = text.indexOf('首次启动');
if (idx === -1) { console.log('announce marker not found'); process.exit(1); }
console.log(text.slice(Math.max(0, idx - 700), idx + 700).replace(/[^\x20-\x7E\n]/g, '.'));
