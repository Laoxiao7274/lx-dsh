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
console.log('items: ' + items.length);
const withFlag = items.filter(i => 'archived' in i);
console.log('items with archived flag: ' + withFlag.length);
for (const i of withFlag.slice(0, 8)) console.log('  archived=' + i.archived + ' ' + i.sessionId + ' cwd=' + (i.cwd || ''));
console.log('sample item keys: ' + Object.keys(items[0]).join(','));
// any archived list method?
const tryM = await post('session.listArchived', {}).catch(() => null);
console.log('session.listArchived -> ' + (tryM ? JSON.stringify(tryM.result && tryM.result.ok ? 'ok' : tryM.result.error) : 'no'));
