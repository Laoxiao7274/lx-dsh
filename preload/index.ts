// contextBridge surface for the LX-DSH renderer (M1).
import { contextBridge, ipcRenderer } from 'electron';
import { DSH_HOST_ENV } from '../shared/chrome.js';

const api = (domain: string, method: string, payload?: unknown): Promise<any> =>
  ipcRenderer.invoke('lx:api', domain, method, payload ?? {});

const on = (channel: string, cb: (data: any) => void): (() => void) => {
  const listener = (_e: Electron.IpcRendererEvent, data: any): void => {
    if (channel !== 'backend:frame') console.log('[lx-pre] recv ' + channel);
    cb(data);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

// Hosted-form-factor declaration for the dsh web UI (see shared/chrome.ts and
// the dsh host contract): the web UI's boot kernel turns this into the
// --dsh-app-inset-* layout tokens before any plugin bundle paints.
contextBridge.exposeInMainWorld('__DSH_HOST__', DSH_HOST_ENV);

contextBridge.exposeInMainWorld('lx', {
  api,
  backend: {
    info: (): Promise<any> => ipcRenderer.invoke('lx:backend'),
    restart: (): void => {
      void ipcRenderer.invoke('lx:restart');
    },
    onEvent: (cb: (e: any) => void): (() => void) => on('backend:event', cb),
    onLog: (cb: (l: any) => void): (() => void) => on('backend:log', cb),
    onFrame: (cb: (m: any) => void): (() => void) => on('backend:frame', cb),
  },
  win: {
    min: (): void => {
      void ipcRenderer.invoke('lx:win:min');
    },
    max: (): void => {
      void ipcRenderer.invoke('lx:win:max');
    },
    close: (): void => {
      void ipcRenderer.invoke('lx:win:close');
    },
    // Manual window drag (pointer events in the renderer -> main follows the
    // cursor). fire-and-forget sends: drag smoothness beats delivery guarantees.
    dragStart: (): void => {
      ipcRenderer.send('lx:win:drag:start');
    },
    dragMove: (screenX: number, screenY: number): void => {
      ipcRenderer.send('lx:win:drag:move', screenX, screenY);
    },
    dragEnd: (): void => {
      ipcRenderer.send('lx:win:drag:end');
    },
  },
  webview: (): void => {
    void ipcRenderer.invoke('lx:webview');
  },
  copy: (t: string): void => {
    void ipcRenderer.invoke('lx:copy', t);
  },
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('lx:api', 'host', 'openPath', { path: p }),
  plugins: {
    open: (): Promise<any> => ipcRenderer.invoke('lx:plugins:open'),
    list: (): Promise<any[]> => ipcRenderer.invoke('lx:plugins:list'),
    install: (name: string): Promise<any> => ipcRenderer.invoke('lx:plugins:install', name),
    uninstall: (name: string): Promise<any> => ipcRenderer.invoke('lx:plugins:uninstall', name),
  },
  debug: {
    onOpen: (cb: (id: string) => void): (() => void) => on('debug:open', cb),
  },
  updater: {
    check: (): Promise<any> => ipcRenderer.invoke('updater:check'),
    install: (): Promise<boolean> => ipcRenderer.invoke('updater:install'),
    status: (): Promise<any> => ipcRenderer.invoke('updater:status'),
    onStatus: (cb: (data: any) => void): (() => void) => on('updater:status', cb),
    onAvailable: (cb: (data: any) => void): (() => void) => on('updater:available', cb),
    onProgress: (cb: (data: any) => void): (() => void) => on('updater:progress', cb),
    onDownloaded: (cb: (data: any) => void): (() => void) => on('updater:downloaded', cb),
    onError: (cb: (data: any) => void): (() => void) => on('updater:error', cb),
  },
});
