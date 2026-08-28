// Grep the INSTALLED app's main.cjs (inside app.asar) for the extraction call
// shape: sync try/catch vs async .then — and print the around-context.
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');

const asar = join(process.env.LOCALAPPDATA, 'Programs', 'LX-DSH', 'resources', 'app.asar');
const st = statSync(asar);
console.log(`installed app.asar: ${(st.size / 1048576).toFixed(2)}MB  mtime ${st.mtime}`);
const text = readFileSync(asar).toString('latin1');
const needle = '\\u9996\\u6B21\\u542F\\u52A8';
let idx = text.indexOf(needle);
if (idx === -1) idx = text.indexOf('首次启动');
if (idx === -1) { console.log('announce marker not found'); process.exit(1); }
console.log(text.slice(Math.max(0, idx - 500), idx + 600).replace(/[^\x20-\x7E\n]/g, '.'));
