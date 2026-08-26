import { randomUUID } from 'node:crypto';
const base = 'http://127.0.0.1:3080';
const res = await fetch(base + '/api/workspace.list', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'workspace.list', payload: {} }),
});
const j = await res.json();
const v = j.result.value;
console.log('value keys: ' + Object.keys(v).join(','));
console.log('top-level archivedSessionIds: ' + JSON.stringify(v.archivedSessionIds));
// cross-check: which sessions in workspaces are archived?
const all = new Set();
for (const w of v.items || []) for (const s of w.sessionIds || []) all.add(s);
const arch = v.archivedSessionIds || [];
console.log('archived count: ' + arch.length + ' of ' + all.size + ' workspace sessions');
for (const a of arch.slice(0, 10)) console.log('  archived: ' + a);
