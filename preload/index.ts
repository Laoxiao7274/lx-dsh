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
  appVersion: (): Promise<string> => ipcRenderer.invoke('lx:appVersion'),
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
  settings: {
    /** Current LX-DSH settings snapshot incl. live remote-connection state. */
    get: (): Promise<any> => ipcRenderer.invoke('lx:settings'),
    /** Toggle the local backend's LAN bind (restarts the local backend). */
    setLanBind: (enabled: boolean): Promise<any> => ipcRenderer.invoke('lx:settings:lanBind', enabled),
  },
  todos: {
    /** One workspace's persisted to-do list. */
    get: (workspaceKey: string): Promise<any> => ipcRenderer.invoke('lx:todos', workspaceKey),
    /** Open (not-done) counts per workspace key, for the reminder badge. */
    counts: (): Promise<any> => ipcRenderer.invoke('lx:todos:counts'),
    /** Add one item to a workspace; returns the post-state list. */
    add: (workspaceKey: string, text: string): Promise<any> => ipcRenderer.invoke('lx:todos:add', workspaceKey, text),
    /** Remove one item by id; returns the post-state list. */
    remove: (workspaceKey: string, id: string): Promise<any> => ipcRenderer.invoke('lx:todos:remove', workspaceKey, id),
    /** Toggle one item's done flag; returns the post-state list. */
    toggle: (workspaceKey: string, id: string): Promise<any> => ipcRenderer.invoke('lx:todos:toggle', workspaceKey, id),
  },
  remote: {
    /** Validate + connect to a remote backend (address + access key), persisting it. */
    connect: (address: string, token: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('lx:remote:connect', address, token),
    /** Drop the remote connection and boot the local backend again. */
    disconnect: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('lx:remote:disconnect'),
  },
  copy: (t: string): void => {
    void ipcRenderer.invoke('lx:copy', t);
  },
  editor: {
    open: (cwd: string, target: 'vscode' | 'cursor' | 'explorer' = 'vscode'): Promise<{ ok: boolean, error?: string }> =>
      ipcRenderer.invoke('lx:openEditor', cwd, target),
  },
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('lx:api', 'host', 'openPath', { path: p }),
  plugins: {
    open: (): Promise<any> => ipcRenderer.invoke('lx:plugins:open'),
    list: (): Promise<any[]> => ipcRenderer.invoke('lx:plugins:list'),
    install: (name: string): Promise<any> => ipcRenderer.invoke('lx:plugins:install', name),
    uninstall: (name: string): Promise<any> => ipcRenderer.invoke('lx:plugins:uninstall', name),
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
