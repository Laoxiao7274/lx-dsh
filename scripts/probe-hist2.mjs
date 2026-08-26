import { randomUUID } from 'node:crypto';
const base = process.argv[2];
const t0 = Date.now();
const res = await fetch(base + '/api/session.history', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session.history', payload: { sessionId: 'session-f231f108-60fd-4343-bd3d-523eafedaaf3', maxMessages: 100 } }),
});
const text = await res.text();
console.log('HTTP ' + res.status + ', ' + (text.length / 1024 / 1024).toFixed(2) + ' MB, ' + (Date.now() - t0) + 'ms');
try {
  const j = JSON.parse(text);
  console.log('result.ok = ' + (j.result && j.result.ok));
  const v = j.result && j.result.value;
  console.log('value keys: ' + (v ? Object.keys(v).join(',') : 'NULL'));
  if (v) {
    console.log('events: ' + (v.events ? v.events.length : typeof v.events));
    console.log('hasMore: ' + v.hasMore);
    if (v.events && v.events.length) console.log('first event type: ' + v.events[0].event.type + ' seq ' + v.events[0].event.seq);
  }
  if (j.result && !j.result.ok) console.log('error: ' + JSON.stringify(j.result.error).slice(0, 300));
} catch (e) {
  console.log('not json: ' + e.message);
  console.log(text.slice(0, 300));
}
