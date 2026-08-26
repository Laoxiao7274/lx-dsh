try {
  const r = await fetch('http://127.0.0.1:9222/json', { signal: AbortSignal.timeout(5000) });
  const t = await r.text();
  console.log('CDP /json OK, ' + t.length + ' bytes');
  console.log(t.slice(0, 1000));
} catch (e) {
  console.log('CDP /json FAILED: ' + e.message + ' / ' + (e.cause ? e.cause.code : ''));
}
