// probe session.history over the live LX-DSH backend: event types + shapes (M1 renderer input)
import { randomUUID } from 'node:crypto';

const base = process.argv[2];
const sessionId = process.argv[3];
const envelope = (method, payload) => ({ type: 'client-request', rpcId: randomUUID(), method, payload });
const post = async (method, payload) => {
  const res = await fetch(base + '/api/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(envelope(method, payload)),
  });
  return res.json();
};
const hist = await post('session.history', { sessionId, maxMessages: 14 });
console.log('history ok: ' + (hist.result ? hist.result.ok : 'NO-RESULT ' + JSON.stringify(hist).slice(0, 200)));
if (!hist.result || !hist.result.ok) process.exit(1);
const v = hist.result.value;
console.log('events: ' + v.events.length + ', hasMore: ' + v.hasMore + (v.projections ? ', projections: ' + JSON.stringify(v.projections).slice(0, 200) : ''));
const seen = new Map();
for (const e of v.events) {
  const ev = e.event;
  const t = ev.type;
  if (!seen.has(t)) seen.set(t, { count: 0, dataKeys: Object.keys((ev.data && typeof ev.data === 'object') ? ev.data : {}).slice(0, 10), view: e.view ? JSON.stringify(e.view).slice(0, 160) : null, sample: JSON.stringify(ev).slice(0, 300) });
  seen.get(t).count += 1;
}
console.log('\n=== distinct session.history event types ===');
for (const [t, x] of [...seen.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log('  ' + t + ' x' + x.count + (x.dataKeys.length ? '  data{' + x.dataKeys.join(',') + '}' : ''));
}
console.log('\n=== samples ===');
for (const [t, x] of [...seen.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12)) {
  console.log('--- ' + t + ' ---');
  console.log(x.sample);
  if (x.view) console.log('view: ' + x.view);
}
// also: session.models for a model-picker design
const models = await post('session.models', { sessionId });
console.log('\n=== session.models ===');
console.log(JSON.stringify(models.result && models.result.ok ? models.result.value : models).slice(0, 700));
