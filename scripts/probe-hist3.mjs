import { randomUUID } from 'node:crypto';
const base = process.argv[2];
const sid = process.argv[3];
for (let attempt = 1; attempt <= 3; attempt++) {
  const t0 = Date.now();
  try {
    const res = await fetch(base + '/api/session.history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session.history', payload: { sessionId: sid, maxMessages: 10 } }),
    });
    const j = await res.json();
    if (j.result && j.result.ok) {
      console.log('attempt ' + attempt + ': OK ' + (j.result.value.events ? j.result.value.events.length : 0) + ' events in ' + (Date.now() - t0) + 'ms');
      break;
    } else {
      console.log('attempt ' + attempt + ': FAIL ' + (Date.now() - t0) + 'ms: ' + JSON.stringify(j.result.error).slice(0, 300));
    }
  } catch (e) {
    console.log('attempt ' + attempt + ': THROW ' + String(e.message).slice(0, 200));
  }
  await new Promise((r) => setTimeout(r, 3000));
}
