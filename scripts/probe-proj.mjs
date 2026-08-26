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
// show projections key shapes across items
const shapes = new Map();
for (const i of items) {
  const keys = i.projections ? Object.keys(i.projections).sort().join(',') : '(none)';
  shapes.set(keys, (shapes.get(keys) || 0) + 1);
}
console.log('projections key shapes:');
for (const [k, c] of shapes) console.log('  [' + c + 'x] ' + k);
// one full sample
const withProj = items.find(i => i.projections);
console.log('sample item: ' + JSON.stringify(withProj).slice(0, 400));
