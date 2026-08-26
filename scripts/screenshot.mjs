// CDP screenshot: electron must run with --remote-debugging-port=9222
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'shot.png';
const res = await fetch('http://127.0.0.1:9222/json');
const targets = await res.json();
const page = targets.find((t) => t.type === 'page' && t.url && t.url.indexOf('index.html') !== -1);
if (!page) {
  console.log('no page target found: ' + JSON.stringify(targets.map((t) => t.url)));
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let got = false;
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id === 2 && m.result && m.result.data) {
    writeFileSync(out, Buffer.from(m.result.data, 'base64'));
    console.log('saved ' + out);
    got = true;
    ws.close();
  }
};
ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
setTimeout(() => ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } })), 800);
setTimeout(() => {
  if (!got) console.log('screenshot timeout');
  process.exit(got ? 0 : 1);
}, 8000);
