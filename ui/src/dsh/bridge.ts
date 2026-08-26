// window.lx access (contextBridge surface from preload/index.ts) + unwrap helpers.

import type { RpcError, RpcResponse, RpcResult } from './types';

export interface LxBridge {
  api(domain: string, method: string, payload?: unknown): Promise<RpcResponse<any>>;
  backend: {
    info(): Promise<{ state: string; baseUrl?: string; pid?: number; dshVersion?: string }>;
    restart(): void;
    onEvent(cb: (e: any) => void): () => void;
    onLog(cb: (l: any) => void): () => void;
    onFrame(cb: (m: any) => void): () => void;
  };
  win: { min(): void; max(): void; close(): void };
  webview(): void;
  copy(text: string): void;
  openPath(p: string): Promise<string>;
  plugins: {
    open(): Promise<boolean>;
    list(): Promise<PluginInfo[]>;
    install(name: string): Promise<{ ok: boolean; error?: string }>;
    uninstall(name: string): Promise<{ ok: boolean; error?: string }>;
  };
  debug?: { onOpen(cb: (id: string) => void): () => void };
  updater: {
    check(): Promise<UpdateStatus>;
    install(): Promise<boolean>;
    status(): Promise<UpdateStatus>;
    onStatus(cb: (data: UpdateStatus) => void): () => void;
    onAvailable(cb: (data: { version: string; releaseNotes?: string }) => void): () => void;
    onProgress(cb: (data: { percent: number }) => void): () => void;
    onDownloaded(cb: (data: { version: string }) => void): () => void;
    onError(cb: (data: { message: string }) => void): () => void;
  };
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  version: string | null;
  progress: number | null;
  error: string | null;
}

declare global {
  interface Window {
    lx: LxBridge;
  }
}

export function errText(e: RpcError | undefined | null): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  return e.message ? e.code ? e.code + ': ' + e.message : e.message : JSON.stringify(e);
}

export function unwrap<T>(res: RpcResponse<T> | undefined | null): T {
  if (!res || !res.result) throw new Error('no response from backend');
  if (!res.result.ok) throw new Error(errText((res.result as { error?: RpcError }).error));
  return (res.result as RpcResult<T> & { ok: true }).value;
}

export const api = (domain: string, method: string, payload?: unknown): Promise<RpcResponse<any>> =>
  window.lx.api(domain, method, payload ?? {});
