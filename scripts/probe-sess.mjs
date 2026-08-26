import { randomUUID } from 'node:crypto';
const base = process.argv[2];
const post = async (method, payload) => {
  const res = await fetch(base + '/api/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }),
  });
  return res.json();
};
const sess = await post('session.list', {});
const items = sess.result.value.items;
console.log('sessions: ' + items.length);
for (const s of items) {
  if (s.blank) continue;
  console.log(s.sessionId + '  cwd=' + (s.cwd || '?') + '  running=' + s.running + '  preset=' + (s.agentPreset || '-') + '  updated=' + new Date(s.updatedAt).toISOString().slice(5, 16));
}
