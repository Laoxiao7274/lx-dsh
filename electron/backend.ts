// Owns the dsh web backend child process:
// locate -> spawn(--port 0) -> parse banner -> probe (HTTP GET on the web
// root) -> running. Crashes restart with 1s/3s/9s backoff (max 5). stop()
// kills the whole process tree (taskkill /t /f).
//
// The 0.1.2 upstream removed the apiproxy RPC surface this shell used to
// handshake with (host.describe + mux/host streams over AbstractApiClient).
// The desktop shell no longer speaks RPC to the backend: the dsh web UI is
// loaded straight into the main webContents and talks to the backend itself,
// so the shell only needs the web server to answer.
import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';
import { findDshRoot, findNode, findContractRoot } from '../shared/find-dsh.mjs';
import { ensureDshRuntime } from './dsh-runtime.js';
import { log, logQuiet } from './log.js';

export type BackendState = 'idle' | 'starting' | 'handshaking' | 'running' | 'failed' | 'stopping';
export interface BackendEvent {
  state: BackendState;
  baseUrl?: string;
  pid?: number;
  dshVersion?: string;
  error?: string;
  detail?: string;
  /** Present when the web UI is served by a remote backend this shell connected to. */
  remoteUrl?: string;
}
export interface BackendLogLine { stream: 'stdout' | 'stderr'; line: string }

const MAX_RESTARTS = 5;
const BANNER_TIMEOUT_MS = 120000;
const OPEN_TIMEOUT_MS = 20000;

export class DshBackend {
  state: BackendState = 'idle';
  baseUrl: string | null = null;
  dshVersion: string | null = null;
  // Preferred dsh runtime root (dev: the harness/ workspace build;
  // packaged: resources/dsh/ shipped inside the installer). When set and
  // present, the backend runs that dsh instead of a global npm install.
  private vendorRoot: string | null = null;
  // Bind host for the spawned backend: '127.0.0.1' (default, loopback only)
  // or '0.0.0.0' (LAN serving; the user must allow the firewall prompt).
  private bindHost: '127.0.0.1' | '0.0.0.0';

  constructor(vendorRoot?: string, opts: { bindHost?: '127.0.0.1' | '0.0.0.0' } = {}) {
    this.vendorRoot = vendorRoot ?? null;
    this.bindHost = opts.bindHost ?? '127.0.0.1';
  }

  /** Change the bind host for the next boot (the caller restarts the backend). */
  setBindHost(host: '127.0.0.1' | '0.0.0.0'): void {
    this.bindHost = host;
  }

  /** The bind host the next boot will use. */
  get currentBindHost(): '127.0.0.1' | '0.0.0.0' {
    return this.bindHost;
  }

  /** Called by main after ensureDshRuntime() resolves the runtime location. */
  setVendorRoot(vendorRoot: string): void {
    this.vendorRoot = vendorRoot;
  }

  /** Current vendor root (used by the plugin manager to locate dsh's bin.js). */
  get vendorRootPath(): string | null {
    return this.vendorRoot;
  }

  /** Surface a pre-boot note to UI listeners (e.g. "extracting dsh on first
   *  run") so the startup view doesn't sit on 'idle' during slow one-time work. */
  announce(detail: string): void {
    if (this.state === 'idle' || this.state === 'failed') this.emit('starting', { detail });
  }

  /** Terminal failure before boot (e.g. extraction error). */
  reportStartupError(error: string): void {
    this.emit('failed', { error });
  }

  private child: ChildProcess | null = null;
  private outBuf = '';
  private errBuf = '';
  private killed = false;
  private restartCount = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private eventListeners: ((e: BackendEvent) => void)[] = [];
  private logListeners: ((l: BackendLogLine) => void)[] = [];

  onEvent(fn: (e: BackendEvent) => void): () => void {
    this.eventListeners.push(fn);
    return () => { this.eventListeners = this.eventListeners.filter((f) => f !== fn); };
  }
  onLog(fn: (l: BackendLogLine) => void): () => void {
    this.logListeners.push(fn);
    return () => { this.logListeners = this.logListeners.filter((f) => f !== fn); };
  }
  info(): BackendEvent {
    return {
      state: this.state,
      baseUrl: this.baseUrl ?? undefined,
      pid: this.child?.pid,
      dshVersion: this.dshVersion ?? undefined,
    };
  }

  private emit(state: BackendState, extra?: Partial<BackendEvent>): void {
    this.state = state;
    const e: BackendEvent = {
      state,
      baseUrl: this.baseUrl ?? undefined,
      pid: this.child?.pid,
      dshVersion: this.dshVersion ?? undefined,
      ...extra,
    };
    log('backend:', e.state, extra?.error ?? extra?.detail ?? '');
    for (const l of this.eventListeners) { try { l(e); } catch { /* listener bug */ } }
  }

  private emitLog(stream: 'stdout' | 'stderr', text: string): void {
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (line === '') continue;
      logQuiet('[dsh:' + stream + '] ' + line);
      for (const l of this.logListeners) { try { l({ stream, line }); } catch { /* listener bug */ } }
    }
  }

  start(): void {
    if (this.state === 'starting' || this.state === 'handshaking' || this.state === 'running') return;
    this.restartCount = 0;
    void this.boot();
  }

  restart(): void {
    this.stop();
    setTimeout(() => this.start(), 300);
  }

  stop(): void {
    if (this.state === 'idle' || this.state === 'stopping') return;
    this.emit('stopping');
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this.killed = true;
    this.killTree();
    this.baseUrl = null;
    this.restartCount = 0;
    this.emit('idle');
  }

  private async boot(): Promise<void> {
    this.killed = false;
    this.emit('starting');
    let dshRoot: string;
    let nodePath: string;
    try {
      // A packaged build never falls back to the npm-global install: that copy
      // is whatever official release was installed once, and running it made
      // the app serve a stale UI while claiming to be current (0.3.0 incident).
      // A restart without a resolved root (e.g. retry after a failed
      // remote-connect boot) resolves the runtime here instead of reaching the
      // npm-global fallback.
      dshRoot = findDshRoot(this.vendorRoot ?? ensureDshRuntime(), { allowGlobal: !app.isPackaged });
      nodePath = findNode();
      findContractRoot(dshRoot);
      this.dshVersion = execFileSync(nodePath, [join(dshRoot, 'lib', 'bin.js'), '-V'], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim();
    } catch (err: any) {
      this.emit('failed', { error: String(err?.message ?? err) });
      return;
    }
    log('backend: dsh root = ' + dshRoot + (this.vendorRoot ? ' [vendored/self-contained]' : ' [global npm install]'));

    const binJs = join(dshRoot, 'lib', 'bin.js');
    this.outBuf = '';
    this.errBuf = '';
    // Spawn BEFORE creating the banner promise: watchBanner registers an exit
    // listener on the child, and it must see the real ChildProcess (previously
    // it was called before assignment, so `this.child` was still null/old and
    // the optional chain silently skipped — the exit listener was never attached
    // to the actual process, leaving bannerP to wait out the full 120s timeout
    // when the child died before printing the banner).
    this.child = spawn(nodePath, [binJs, '--profile', 'web', '--host', this.bindHost, '--port', '0', '--no-open'], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout?.on('data', (d) => { this.outBuf += String(d); this.emitLog('stdout', String(d)); });
    this.child.stderr?.on('data', (d) => { this.errBuf += String(d); this.emitLog('stderr', String(d)); });
    this.child.on('exit', (code) => this.onChildExit(code));
    this.child.on('error', (err) => {
      if (!this.killed) this.emit('failed', { error: String(err?.message ?? err) });
    });
    const bannerP = this.watchBanner(this.child, BANNER_TIMEOUT_MS);

    let base: string;
    try {
      base = await bannerP;
    } catch (err: any) {
      // If the child exited before the banner, onChildExit already drove
      // scheduleRestart (armed this.restartTimer + emit 'starting'). Don't
      // clobber that with 'failed' — let the restart proceed. Only emit failed
      // for a genuine banner timeout where the child is still alive.
      this.killed = true;
      if (this.restartTimer) return;
      this.killTree();
      this.emit('failed', { error: String(err?.message ?? err) });
      return;
    }
    this.baseUrl = base;
    this.emit('handshaking');

    // The web server answering on its root proves the backend is serving the
    // web UI; the shell keeps no RPC client of its own (the dsh web UI talks
    // to the backend directly from the renderer). The banner URL carries the
    // launch token, whose GET answers 303 (it mints the browser session
    // cookie) — both that and a direct 2xx count as serving.
    try {
      const res = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(OPEN_TIMEOUT_MS) });
      if (!res.ok && res.status !== 303) throw new Error('web root answered HTTP ' + res.status);
    } catch (err: any) {
      this.killed = true;
      this.killTree();
      this.emit('failed', { error: 'handshake failed: ' + String(err?.message ?? err) });
      return;
    }
    this.emit('running', { detail: 'web root answering on ' + base });
  }

  private watchBanner(child: ChildProcess, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearInterval(iv);
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        finish(() => reject(new Error('backend banner timeout (' + timeoutMs + 'ms). tail: ' + this.outBuf.slice(-600))));
      }, timeoutMs);
      const iv = setInterval(() => {
        const i = this.outBuf.indexOf('dsh web: http://127.0.0.1:');
        if (i === -1) return;
        const rest = this.outBuf.slice(i + 'dsh web: '.length);
        const url = rest.split(' ')[0].split('\n')[0];
        finish(() => resolve(url));
      }, 100);
      // Reject early if the child dies before printing the banner — otherwise
      // bannerP would wait the full timeout. onChildExit handles the restart,
      // but this lets boot() stop waiting immediately.
      child.once('exit', (code) => {
        finish(() => reject(new Error('backend exited (code ' + code + ') before banner. stderr tail: ' + this.errBuf.slice(-600))));
      });
    });
  }

  private onChildExit(code: number | null): void {
    if (this.killed) return;
    if (this.state === 'failed' || this.state === 'stopping' || this.state === 'idle') return;
    this.scheduleRestart('backend exited (code ' + code + ')');
  }

  private scheduleRestart(reason: string): void {
    this.killTree();
    this.baseUrl = null;
    if (this.restartCount >= MAX_RESTARTS) {
      this.emit('failed', { error: reason + ' — giving up after ' + MAX_RESTARTS + ' restarts', detail: this.errBuf.slice(-600) });
      return;
    }
    this.restartCount += 1;
    const delay = Math.min(1000 * Math.pow(3, this.restartCount - 1), 9000);
    log('backend: ' + reason + ' -> restart #' + this.restartCount + ' in ' + delay + 'ms');
    this.emit('starting', { detail: reason });
    this.restartTimer = setTimeout(() => void this.boot(), delay);
    (this.restartTimer as { unref?: () => void }).unref?.();
  }

  private killTree(): void {
    const child = this.child;
    this.child = null;
    if (!child || child.pid === undefined) return;
    try { child.kill(); } catch { /* ignore */ }
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      log('backend: taskkill /pid ' + child.pid + ' /t /f');
    } catch { /* already gone */ }
  }
}
