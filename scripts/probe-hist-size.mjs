// measure session.history payload size for the monster session
import { randomUUID } from 'node:crypto';
const base = process.argv[2];
const sessionId = process.argv[3];
for (const maxMessages of [10, 100]) {
  const t0 = Date.now();
  const res = await fetch(base + '/api/session.history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session.history', payload: { sessionId, maxMessages } }),
  });
  const text = await res.text();
  const dt = Date.now() - t0;
  console.log('maxMessages=' + maxMessages + ' -> ' + (text.length / 1024 / 1024).toFixed(2) + ' MB in ' + dt + 'ms (HTTP ' + res.status + ')');
}
