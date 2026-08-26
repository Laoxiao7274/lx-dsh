import { randomUUID } from 'node:crypto';
const base = 'http://127.0.0.1:3080';
const post = async (method, payload) => {
  const res = await fetch(base + '/api/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }),
  });
  return res.json();
};
// page backwards from after the collision: find the events holding seq 209168-209171 in 3080 memory
const h = await post('session.history', { sessionId: 'session-7c83723d-2612-47e0-84ae-affca3c15dbc', beforeSeq: 209172, maxMessages: 2 });
const v = h.result.value;
console.log('3080 page beforeSeq=209172: ' + v.events.length + ' events, hasMore=' + v.hasMore);
let min = Infinity, max = -1;
for (const e of v.events) { min = Math.min(min, e.event.seq); max = Math.max(max, e.event.seq); }
console.log('page seq range: ' + min + '..' + max);
// does 3080 contain the interrupt events (tool/result interrupted + turn/end interrupted + end-seed)?
for (const e of v.events) {
  if (e.event.seq >= 209160 && e.event.seq <= 209180) {
    console.log('  ' + e.event.seq + ' ' + e.event.type + ' ' + JSON.stringify(e.event.data ?? {}).slice(0, 80));
  }
}
// and the very latest seq in 3080 memory
const h2 = await post('session.history', { sessionId: 'session-7c83723d-2612-47e0-84ae-affca3c15dbc', maxMessages: 1 });
const last = h2.result.value.events;
if (last.length) console.log('3080 latest events: ' + last.length + ', max seq ' + Math.max(...last.map((e) => e.event.seq)) + ' (tail type ' + last[last.length - 1].event.type + ')');
