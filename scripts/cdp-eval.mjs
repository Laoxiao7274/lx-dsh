// Evaluate a JS expression in a CDP target (by url/title substring) and print the result.
// usage: node scripts/cdp-eval.mjs <port> <target-substr> <js-expression...>
// e.g.  node scripts/cdp-eval.mjs 9222 "index.html" "document.title"
const port = process.argv[2];
const targetFilter = process.argv[3];
const expr = process.argv.slice(4).join(' ');
if (!port || !targetFilter || !expr) {
  console.error('usage: cdp-eval.mjs <port> <target-substr> <js-expression>');
  process.exit(2);
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const t = targets.find((x) => `${x.title} ${x.url}`.toLowerCase().includes(targetFilter.toLowerCase()));
if (!t) {
  console.error('target not found for: ' + targetFilter);
  console.error('available: ' + targets.map((x) => x.url || x.title).join(' | '));
  process.exit(1);
}
function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => reject(new Error('eval timeout (15s)')), 15000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error.message));
        else {
          resolve(msg.result);
          ws.close();
        }
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
  });
}
try {
  const r = await evaluate(t.webSocketDebuggerUrl, expr);
  if (r.exceptionDetails) {
    console.error('exception: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    process.exit(1);
  }
  console.log(JSON.stringify(r.result?.value ?? r.result, null, 2));
} catch (e) {
  console.error('cdp-eval error: ' + e.message);
  process.exit(1);
}
