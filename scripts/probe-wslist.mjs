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
const ws = await post('workspace.list', {});
const items = ws.result.value.items;
console.log('workspaces: ' + items.length);
for (const w of items) {
  console.log('ws ' + w.id + ' title=' + JSON.stringify(w.title) + ' sessions=' + (w.sessionIds || []).length + ' archivedSessionIds=' + JSON.stringify(w.archivedSessionIds || null));
}
const keys = items[0] ? Object.keys(items[0]).join(',') : '';
console.log('workspace item keys: ' + keys);
