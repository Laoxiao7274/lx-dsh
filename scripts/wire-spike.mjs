// M0 wire spike — proves the LX-DSH integration path from plain Node (no Electron):
//   1. locate global dsh install + Node binary + wire-contract package
//   2. spawn: node <dshRoot>/lib/bin.js --profile web --host 127.0.0.1 --port 0
//   3. parse the readiness banner line "dsh web: http://127.0.0.1:<port>"
//   4. phase A (raw wire): hand-crafted envelope POST + raw WebSocket, print frames
//   5. phase B (contract): runtime-import AbstractApiClient from the dsh install,
//      DesktopApiClient subclass (fetch doFetch + WebSocket openMux/openHost),
//      typed host.describe / sessions.list / workspace.list, consume both streams
//   6. kill the backend process tree (taskkill /t /f)
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { findDshRoot, findNode, findContractRoot } from '../shared/find-dsh.mjs';

const T0 = Date.now();
const ts = () => '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's';
const log = (tag, ...rest) => console.log('[' + ts() + ' ' + tag + ']', ...rest);
let exitCode = 0;
let child = null;
let outBuf = '';
let errBuf = '';

const toWs = (httpBase) => httpBase.startsWith('https://') ? 'wss://' + httpBase.slice(8) : 'ws://' + httpBase.slice(7);

function bannerWatcher() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('banner timeout (120s). outBuf tail: ' + outBuf.slice(-800))), 120000);
    const iv = setInterval(() => {
      const i = outBuf.indexOf('dsh web: http://127.0.0.1:');
      if (i !== -1) {
        const rest = outBuf.slice(i + 'dsh web: '.length);
        const url = rest.split(' ')[0].split('\n')[0];
        clearInterval(iv);
        clearTimeout(timer);
        resolve(url);
      }
    }, 150);
  });
}

try {
  const dshRoot = findDshRoot();
  const nodePath = findNode();
  const contractRoot = findContractRoot(dshRoot);
  const dshVersion = execFileSync(nodePath, [join(dshRoot, 'lib', 'bin.js'), '-V'], { encoding: 'utf8', windowsHide: true }).trim();
  log('locate', 'dshRoot  =', dshRoot);
  log('locate', 'node      =', nodePath);
  log('locate', 'contract  =', contractRoot);
  log('locate', 'dsh -V    =', dshVersion);

  const binJs = join(dshRoot, 'lib', 'bin.js');
  const bannerP = bannerWatcher();
  child = spawn(nodePath, [binJs, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (d) => { outBuf += String(d); });
  child.stderr.on('data', (d) => { errBuf += String(d); });
  child.on('exit', (code) => log('backend', 'child exited, code =', code));

  const base = await bannerP;
  log('banner', base);

  // ---- phase A: raw wire (no contract) --------------------------------
  const rawPost = async (method, payload) => {
    const res = await fetch(base + '/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: payload ?? {} }),
    });
    const text = await res.text();
    return { status: res.status, body: text };
  };
  const desc = await rawPost('host.describe');
  log('A:host.describe', 'HTTP', desc.status, desc.body.slice(0, 300));
  const sess = await rawPost('session.list');
  log('A:session.list', 'HTTP', sess.status, sess.body.slice(0, 200));

  const rawWs = (path) => new Promise((resolve) => {
    const ws = new WebSocket(toWs(base) + path);
    const frames = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(frames);
    };
    const timer = setTimeout(finish, 4000);
    ws.onopen = () => log('A:ws', path, 'OPEN (fence passed)');
    ws.onmessage = (ev) => {
      frames.push(String(ev.data).slice(0, 160));
      if (frames.length >= 3) finish();
    };
    ws.onerror = () => log('A:ws', path, 'ERROR');
    ws.onclose = () => finish();
  });
  const [hostFrames, muxFrames] = await Promise.all([rawWs('/api/events.host'), rawWs('/api/events.mux')]);
  log('A:events.host', hostFrames.length + ' frames in 4s; first: ' + (hostFrames[0] ?? '(none)'));
  log('A:events.mux', muxFrames.length + ' frames in 4s; first: ' + (muxFrames[0] ?? '(none)'));
  if (desc.status !== 200) throw new Error('raw host.describe failed: HTTP ' + desc.status);

  // ---- phase B: contract client (runtime import) ----------------------
  const clientMod = await import(pathToFileURL(join(contractRoot, 'lib', 'types', 'fetch', 'client.js')).href);
  const rpcMod = await import(pathToFileURL(join(contractRoot, 'lib', 'types', 'api', 'rpc.schema.js')).href);
  const evMod = await import(pathToFileURL(join(contractRoot, 'lib', 'types', 'api', 'events.schema.js')).href);
  log('B:import', 'AbstractApiClient =', typeof clientMod.AbstractApiClient, '| rpc schemas =', Object.keys(rpcMod).join(','), '| event schemas =', Object.keys(evMod).join(','));

  class DesktopApiClient extends clientMod.AbstractApiClient {
    constructor(baseUrl, timeoutMs) {
      super(timeoutMs ?? 30000);
      this.base = baseUrl;
    }
    resolveBase() { return this.base; }
    doFetch(input, init) { return fetch(input, init); }
    async *openMux(_payload, signal, onOpen) { yield* this.wsStream('/api/events.mux', evMod.muxFrameSchema, signal, onOpen); }
    async *openHost(_payload, signal, onOpen) { yield* this.wsStream('/api/events.host', evMod.hostFrameSchema, signal, onOpen); }
    async *wsStream(path, frameSchema, signal, onOpen) {
      const ws = new WebSocket(toWs(this.base) + path);
      const END = Symbol('end');
      let queue = [];
      let waiter = null;
      let closed = false;
      const push = (v) => {
        if (waiter) { const w = waiter; waiter = null; w(v); } else { queue.push(v); }
      };
      ws.onopen = () => { log('B:ws', path, 'OPEN'); if (onOpen) onOpen(); };
      ws.onmessage = (ev) => {
        let full;
        let frame;
        try {
          full = rpcMod.serverRequestSchema.parse(JSON.parse(String(ev.data)));
          frame = frameSchema.parse(full.payload);
        } catch (err) {
          log('B:ws', path, 'dropped malformed frame:', String(err).slice(0, 120));
          return;
        }
        this.onEnvelope(full);
        push({ rpcId: full.rpcId, payload: frame });
      };
      ws.onclose = () => { if (!closed) log('B:ws', path, 'CLOSED'); closed = true; push(END); };
      if (signal) signal.addEventListener('abort', () => { try { ws.close(); } catch {} }, { once: true });
      try {
        while (true) {
          const v = queue.length ? queue.shift() : await new Promise((r) => { waiter = r; });
          if (v === END) return;
          yield v;
        }
      } finally {
        try { ws.close(); } catch {}
      }
    }
  }

  const client = new DesktopApiClient(base);
  const tDesc = Date.now();
  const describe = await client.host.describe({});
  log('B:host.describe', (Date.now() - tDesc) + 'ms, ok =', describe.result.ok);
  log('B:host.describe value', JSON.stringify(describe.result.value).slice(0, 500));

  const sessions = await client.sessions.list({});
  log('B:sessions.list', 'ok =', sessions.result.ok, '|', JSON.stringify(sessions.result.value).slice(0, 400));
  const workspaces = await client.workspace.list({});
  log('B:workspace.list', 'ok =', workspaces.result.ok, '|', JSON.stringify(workspaces.result.value).slice(0, 300));

  const ac = new AbortController();
  const consumed = { mux: 0, host: 0, sampleMux: null, sampleHost: null };
  const consumeMux = (async () => {
    for await (const f of client.events.mux({}, ac.signal)) {
      consumed.mux += 1;
      if (!consumed.sampleMux) consumed.sampleMux = JSON.stringify(f.payload).slice(0, 200);
    }
  })();
  const consumeHost = (async () => {
    for await (const f of client.events.host({}, ac.signal)) {
      consumed.host += 1;
      if (!consumed.sampleHost) consumed.sampleHost = JSON.stringify(f.payload).slice(0, 200);
    }
  })();
  await new Promise((r) => setTimeout(r, 6000));
  ac.abort();
  await Promise.allSettled([consumeMux, consumeHost]);
  log('B:streams', 'consumed mux = ' + consumed.mux + ', host = ' + consumed.host);
  log('B:sample host frame', consumed.sampleHost ?? '(none)');
  log('B:sample mux frame', consumed.sampleMux ?? '(none)');

  log('SPIKE', 'ALL PHASES PASSED — fence, banner, raw wire, contract client, streams: OK');
} catch (err) {
  exitCode = 1;
  console.error('[spike] FAILED:', err && err.stack ? err.stack : err);
} finally {
  if (child && !child.killed) {
    child.killed = true;
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      log('cleanup', 'taskkill /pid ' + child.pid + ' /t /f');
    } catch {
      try { child.kill(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 500));
    console.log('\n--- backend stdout tail ---');
    console.log(outBuf.slice(-1500));
    if (errBuf) {
      console.log('--- backend stderr tail ---');
      console.log(errBuf.slice(-1500));
    }
  }
  process.exit(exitCode);
}
