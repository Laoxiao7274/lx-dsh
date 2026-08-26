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
const list = await post('session.list', {});
const items = list.result.value.items;
const keyset = new Set();
for (const i of items) {
  const v = i.projections && i.projections.values;
  if (v) for (const k of Object.keys(v)) keyset.add(k);
}
console.log('all projection value keys: ' + [...keyset].sort().join(', '));
