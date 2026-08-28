// Owns the dsh web backend child process:
// locate -> spawn(--port 0) -> parse banner -> handshake (host.describe + both event
// streams open) -> running. Crashes restart with 1s/3s/9s backoff (max 5). stop()
// kills the whole process tree (taskkill /t /f).
import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { findDshRoot, findNode, findContractRoot } from '../shared/find-dsh.mjs';
import { createDesktopClient, DesktopClient, FrameMsg, StreamState } from './api-client.js';
import { log, logQuiet } from './log.js';

export type BackendState = 'idle' | 'starting' | 'handshaking' | 'running' | 'failed' | 'stopping';
export interface BackendEvent {
  state: BackendState;
  baseUrl?: string;
  pid?: number;
  dshVersion?: string;
  error?: string;
  detail?: string;
}
export interface BackendLogLine { stream: 'stdout' | 'stderr'; line: string }
export interface FrameMsgEvent { stream: 'mux' | 'host'; frame: FrameMsg }

const MAX_RESTARTS = 5;
const BANNER_TIMEOUT_MS = 120000;
const OPEN_TIMEOUT_MS = 20000;

export class DshBackend {
  state: BackendState = 'idle';
  baseUrl: string | null = null;
  dshVersion: string | null = null;
  client: DesktopClient | null = null;
  // Preferred dsh runtime root (dev: the deepseek-harness workspace build;
  // packaged: the %APPDATA%/LX-DSH/dsh extraction). When set and present, the
  // backend runs that dsh instead of a global npm install.
  private vendorRoot: string | null = null;

  constructor(vendorRoot?: string) {
    this.vendorRoot = vendorRoot ?? null;
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
  private clientAbort: AbortController | null = null;
  private eventListeners: ((e: BackendEvent) => void)[] = [];
  private logListeners: ((l: BackendLogLine) => void)[] = [];
  private frameListeners: ((m: FrameMsgEvent) => void)[] = [];

  onEvent(fn: (e: BackendEvent) => void): () => void {
    this.eventListeners.push(fn);
    return () => { this.eventListeners = this.eventListeners.filter((f) => f !== fn); };
  }
  onLog(fn: (l: BackendLogLine) => void): () => void {
    this.logListeners.push(fn);
    return () => { this.logListeners = this.logListeners.filter((f) => f !== fn); };
  }
  onFrame(fn: (m: FrameMsgEvent) => void): () => void {
    this.frameListeners.push(fn);
    return () => { this.frameListeners = this.frameListeners.filter((f) => f !== fn); };
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

  private emitFrame(stream: 'mux' | 'host', frame: FrameMsg): void {
    // Frames can arrive at high frequency (dozens per second during active
    // streaming). Logging every one with appendFileSync blocks the main
    // process event loop and causes IPC backpressure. Only log frame errors,
    // not routine frame traffic.
    for (const l of this.frameListeners) { try { l({ stream, frame }); } catch { /* listener bug */ } }
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
    this.abortClient();
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
    let contractRoot: string;
    try {
      dshRoot = findDshRoot(this.vendorRoot ?? undefined);
      nodePath = findNode();
      contractRoot = findContractRoot(dshRoot);
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
    this.child = spawn(nodePath, [binJs, '--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
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

    const openStates = new Set<string>();
    let openResolve: (() => void) | null = null;
    const openP = new Promise<void>((r) => { openResolve = r; });
    const hooks: { onStreamState: (s: StreamState) => void } = {
      onStreamState: (s) => {
        if (s.state === 'open') {
          openStates.add(s.stream);
          if (openStates.size === 2) openResolve?.();
        }
      },
    };

    let client: DesktopClient | null = null;
    let describe: any = null;
    try {
      client = await createDesktopClient(base, contractRoot, hooks);
      describe = await client.host.describe({});
      if (!describe?.result?.ok) throw new Error('host.describe answered not-ok');
    } catch (err: any) {
      this.killed = true;
      this.killTree();
      this.emit('failed', { error: 'handshake failed: ' + String(err?.message ?? err) });
      return;
    }

    const ac = new AbortController();
    this.clientAbort = ac;
    const streamGuard = (name: string, p: Promise<unknown>): void => {
      p.catch((e: any) => {
        if (this.killed || ac.signal.aborted) return;
        log('backend: ' + name + ' stream ended unexpectedly:', String(e?.message ?? e));
        this.scheduleRestart(name + ' stream ended');
      });
    };
    streamGuard('mux', (async () => {
      for await (const f of client.events.mux({}, ac.signal)) this.emitFrame('mux', f);
    })());
    streamGuard('host', (async () => {
      for await (const f of client.events.host({}, ac.signal)) this.emitFrame('host', f);
    })());

    try {
      await Promise.race([
        openP,
        new Promise<void>((_, rej) => setTimeout(() => rej(new Error('event streams did not open in ' + OPEN_TIMEOUT_MS + 'ms')), OPEN_TIMEOUT_MS)),
      ]);
    } catch (err: any) {
      ac.abort();
      this.killed = true;
      this.killTree();
      this.emit('failed', { error: 'handshake failed: ' + String(err?.message ?? err) });
      return;
    }
    this.client = client;
    this.emit('running', { detail: 'handshake ok: ' + JSON.stringify(describe?.result?.value ?? {}).slice(0, 200) });
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
    this.abortClient();
    if (this.state === 'failed' || this.state === 'stopping' || this.state === 'idle') return;
    this.scheduleRestart('backend exited (code ' + code + ')');
  }

  private scheduleRestart(reason: string): void {
    this.abortClient();
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

  private abortClient(): void {
    if (this.clientAbort) { this.clientAbort.abort(); this.clientAbort = null; }
    this.client = null;
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
