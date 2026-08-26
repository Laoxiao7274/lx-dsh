// enumerate assistant/chunk variants + content block types from a full history page
import { randomUUID } from 'node:crypto';

const base = process.argv[2];
const sessionId = process.argv[3];
const res = await fetch(base + '/api/session.history', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session.history', payload: { sessionId, maxMessages: 999 } }),
});
const j = await res.json();
const v = j.result.value;
console.log('events on page: ' + v.events.length + ', hasMore: ' + v.hasMore);
const chunkTypes = new Map();
const blockTypes = new Map();
const contentTypes = new Map();
const sourceKinds = new Map();
for (const e of v.events) {
  const d = e.event.data ?? {};
  if (e.event.type === 'assistant/chunk') {
    const ct = d.chunk && d.chunk.type;
    chunkTypes.set(ct, (chunkTypes.get(ct) || 0) + 1);
    if (d.chunk && d.chunk.blockType) blockTypes.set('chunk.' + d.chunk.type + '.' + d.chunk.blockType, (blockTypes.get('chunk.' + d.chunk.type + '.' + d.chunk.blockType) || 0) + 1);
  }
  if (e.event.type === 'assistant/message' || e.event.type === 'user/message') {
    for (const b of d.message && d.message.content ? d.message.content : d.content ? d.content : []) {
      contentTypes.set(e.event.type + ': ' + b.type, (contentTypes.get(e.event.type + ': ' + b.type) || 0) + 1);
    }
    const sk = d.source && d.source.kind;
    if (sk) sourceKinds.set(e.event.type + ' source.' + sk + (d.source.plugin ? '/' + d.source.plugin : ''), (sourceKinds.get(e.event.type + ' source.' + sk + (d.source.plugin ? '/' + d.source.plugin : '')) || 0) + 1);
  }
  if (e.event.type === 'tool/result') {
    for (const b of d.message && d.message.content ? d.message.content : []) {
      contentTypes.set('tool/result: ' + b.type, (contentTypes.get('tool/result: ' + b.type) || 0) + 1);
      if (b.type === 'tool-result') {
        for (const c of b.content || []) contentTypes.set('tool/result inner: ' + c.type, (contentTypes.get('tool/result inner: ' + c.type) || 0) + 1);
      }
    }
  }
}
const dump = (m) => { for (const [k, n] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + k + ' x' + n); };
console.log('\n=== assistant/chunk.type ==='); dump(chunkTypes);
console.log('\n=== chunk blockType combos ==='); dump(blockTypes);
console.log('\n=== message content block types ==='); dump(contentTypes);
console.log('\n=== message source kinds ==='); dump(sourceKinds);
// one sample of each chunk type
console.log('\n=== chunk samples ===');
const shown = new Set();
for (const e of v.events) {
  const d = e.event.data;
  if (e.event.type === 'assistant/chunk' && d.chunk && !shown.has(d.chunk.type + (d.chunk.blockType || ''))) {
    shown.add(d.chunk.type + (d.chunk.blockType || ''));
    console.log('--- ' + d.chunk.type + ' ' + (d.chunk.blockType || '') + ' ---');
    console.log(JSON.stringify(d.chunk).slice(0, 300));
  }
}
