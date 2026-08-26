// CDP screenshot utility for LX-DSH.
//
// Launch the app with CDP enabled:  electron . --remote-debugging-port=9222
// (or set LX_DSH_CDP_PORT and the app appends the switch itself).
//
// Then:  node scripts/cdp-capture.mjs [port] [outputPrefix]
//   - lists every CDP target (main window, titlebar overlay, webview)
//   - saves a PNG screenshot of each to <outputPrefix>_<n>_<type>.png
//   - with `--target <substr>` only captures targets whose url/title match
//
// CDP capture is unaffected by window occlusion / hide-to-tray / software-render
// compositing, unlike CopyFromScreen — use this as the default inspection path.
import { writeFileSync } from 'node:fs';

const port = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '9222';
let prefix = 'shot';
let targetFilter = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--target') targetFilter = process.argv[++i];
  else if (!a.startsWith('--')) prefix = a;
}
const base = `http://127.0.0.1:${port}`;

function capture(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let mid = 0;
    const pending = new Map();
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = ++mid;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const timer = setTimeout(() => reject(new Error('cdp timeout (15s)')), 15000);
    ws.onopen = async () => {
      try {
        await send('Page.enable');
        const r = await send('Page.captureScreenshot', { format: 'png' });
        clearTimeout(timer);
        resolve(r.result.data);
        ws.close();
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
  });
}

async function main() {
  const targets = await (await fetch(`${base}/json`)).json();
  console.log(`=== ${targets.length} CDP target(s) on port ${port} ===`);
  targets.forEach((t, i) => console.log(`  [${i}] (${t.type}) ${t.title || ''} :: ${t.url || ''}`));
  if (targets.length === 0) return;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.webSocketDebuggerUrl) continue;
    const label = `${t.title || 'untitled'} ${t.url || ''}`.toLowerCase();
    if (targetFilter && !label.includes(targetFilter.toLowerCase())) continue;
    const out = `${prefix}_${i}_${(t.type || 'target').replace(/[^a-z0-9]/gi, '')}.png`;
    try {
      const data = await capture(t.webSocketDebuggerUrl);
      writeFileSync(out, Buffer.from(data, 'base64'));
      console.log(`saved ${out}  <-  (${t.type}) ${t.url || t.title}`);
    } catch (e) {
      console.log(`capture failed for [${i}] ${t.url || t.title}: ${e.message}`);
    }
  }
}

main().catch((e) => { console.error('cdp-capture error:', e.message); process.exit(1); });
