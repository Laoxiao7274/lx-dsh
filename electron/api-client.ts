// Desktop protocol client: subclass of AbstractApiClient (runtime-imported from the
// installed dsh so the wire contract always matches the running backend).
//  - doFetch      = Node fetch to http://127.0.0.1:P/api/* (no Origin header -> passes fence)
//  - openMux/openHost = WebSocket overloads of the SSE streams (downlink-only)
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { logQuiet } from './log.js';

export interface FrameMsg {
  rpcId: string;
  payload: any;
}
export interface StreamState {
  stream: 'mux' | 'host';
  state: 'open' | 'closed' | 'error';
}
export interface ClientHooks {
  onStreamState?(s: StreamState): void;
}
export interface DesktopClient {
  base: string;
  host: any;
  sessions: any;
  subagents: any;
  workspace: any;
  skills: any;
  agentPresets: any;
  goals: any;
  settings: any;
  credentials: any;
  llm: any;
  events: {
    mux(payload: object, signal?: AbortSignal, onOpen?: () => void): AsyncGenerator<FrameMsg>;
    host(payload: object, signal?: AbortSignal, onOpen?: () => void): AsyncGenerator<FrameMsg>;
  };
  respond(message: object, signal?: AbortSignal): Promise<any>;
}

const toWs = (httpBase: string): string =>
  httpBase.startsWith('https://') ? 'wss://' + httpBase.slice(8) : 'ws://' + httpBase.slice(7);

export async function createDesktopClient(baseUrl: string, contractRoot: string, hooks: ClientHooks): Promise<DesktopClient> {
  const clientMod: any = await import(pathToFileURL(join(contractRoot, 'lib', 'types', 'fetch', 'client.js')).href);
  const rpcMod: any = await import(pathToFileURL(join(contractRoot, 'lib', 'types', 'api', 'rpc.schema.js')).href);
  const evMod: any = await import(pathToFileURL(join(contractRoot, 'lib', 'types', 'api', 'events.schema.js')).href);
  if (typeof clientMod.AbstractApiClient !== 'function') {
    throw new Error('contract import failed: AbstractApiClient missing (dsh layout changed?)');
  }

  class DesktopApiClient extends (clientMod.AbstractApiClient as any) {
    base: string;
    hooks: ClientHooks;
    constructor(base: string, hooks: ClientHooks) {
      super(30000);
      this.base = base;
      this.hooks = hooks;
    }
    resolveBase(): string {
      return this.base;
    }
    doFetch(input: URL, init?: RequestInit): Promise<Response> {
      return fetch(input, init);
    }
    async *openMux(_payload: object, signal: AbortSignal | undefined, onOpen?: () => void): AsyncGenerator<FrameMsg> {
      yield* this.wsStream('/api/events.mux', evMod.muxFrameSchema, signal, onOpen, 'mux');
    }
    async *openHost(_payload: object, signal: AbortSignal | undefined, onOpen?: () => void): AsyncGenerator<FrameMsg> {
      yield* this.wsStream('/api/events.host', evMod.hostFrameSchema, signal, onOpen, 'host');
    }
    private async *wsStream(
      path: string,
      frameSchema: any,
      signal: AbortSignal | undefined,
      onOpen: (() => void) | undefined,
      tag: 'mux' | 'host',
    ): AsyncGenerator<FrameMsg> {
      const ws = new WebSocket(toWs(this.base) + path);
      const END = Symbol('end');
      let queue: any[] = [];
      let waiter: ((v: any) => void) | null = null;
      let opened = false;
      const push = (v: any): void => {
        if (waiter) { const w = waiter; waiter = null; w(v); } else { queue.push(v); }
      };
      ws.onopen = () => { opened = true; this.hooks.onStreamState?.({ stream: tag, state: 'open' }); if (onOpen) onOpen(); };
      ws.onmessage = (ev: any) => {
        let full: any;
        let frame: any;
        try {
          full = rpcMod.serverRequestSchema.parse(JSON.parse(String(ev.data)));
          frame = frameSchema.parse(full.payload);
        } catch (err: any) {
          logQuiet('dropped malformed frame on ' + path + ': ' + String(err).slice(0, 160));
          return;
        }
        this.onEnvelope(full);
        push({ rpcId: full.rpcId, payload: frame });
      };
      ws.onerror = () => { this.hooks.onStreamState?.({ stream: tag, state: 'error' }); };
      ws.onclose = () => { this.hooks.onStreamState?.({ stream: tag, state: 'closed' }); push(END); };
      const onAbort = (): void => { try { ws.close(); } catch { /* ignore */ } };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        while (true) {
          const v = queue.length ? queue.shift() : await new Promise<any>((r) => { waiter = r; });
          if (v === END) {
            if (!opened && !(signal && signal.aborted)) {
              throw new Error('stream ' + path + ' closed before open (fence rejection?)');
            }
            return;
          }
          yield v;
        }
      } finally {
        if (signal) signal.removeEventListener('abort', onAbort);
        try { ws.close(); } catch { /* ignore */ }
      }
    }
  }

  return new DesktopApiClient(baseUrl, hooks) as DesktopClient;
}
