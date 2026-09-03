// LX-DSH main process: the dsh web UI is loaded directly into the main
// webContents (so its dropdowns / popovers / dialogs are never clipped by a
// child-view rectangle). There is no titlebar overlay — the window is frameless
// and its chrome (drag region, window controls) lives inside the web UI's
// Session Header (ui-lx-shell). While booting the LX-DSH startup shell shows.
import { app, BrowserWindow, Menu, Tray, clipboard, dialog, globalShortcut, ipcMain, nativeImage, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DshBackend } from './backend.js';
import { ensureDshRuntime } from './dsh-runtime.js';
import { initUpdater } from './updater.js';
import { log } from './log.js';
import { composeRemoteUrl, readSettings, writeSettings } from './settings.js';

// The dsh runtime is built from the in-repo harness/ subtree: in dev
// the backend runs the workspace build (harness/apps/cli) directly;
// in a packaged build the runtime ships as resources/dsh/ — plain files, no
// extraction (electron/dsh-runtime.ts). The
// resolved root is handed to the backend after ensureDshRuntime() completes.
const backend = new DshBackend();
let win: BrowserWindow | null = null;
let webview: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
/** Remote-backend mode: when set, the web UI is served by this URL instead of a spawned local backend. */
let remoteMode: { url: string } | null = null;

let webUILoadedUrl: string | null = null;
// what the main webContents currently shows, so we never abort an in-flight load
// with a competing loadFile/loadURL ('startup' | 'webui' | null = unknown).
let showing: 'startup' | 'webui' | null = null;

// Software rendering by default (GPU-less / remote contexts kill the GPU process).
if (!process.env.LX_DSH_ENABLE_GPU) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('in-process-gpu');
}

// Optional CDP for inspection (dev): set LX_DSH_CDP_PORT=<port> to expose the
// Chrome DevTools Protocol on that port, so external tooling can screenshot /
// inspect webContents without being affected by window occlusion / hide-to-tray
// / software-render compositing.
if (process.env.LX_DSH_CDP_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.LX_DSH_CDP_PORT);
}

const iconPath = (): string => join(__dirname, '..', 'build', 'icon.png');

// Load the LX-DSH shell (titlebar/startup). In dev, LX_DSH_DEV_URL points at the
// Vite dev server for HMR; otherwise load the built ui/dist/index.html.
function loadShell(wc: Electron.WebContents): void {
  const devUrl = process.env.LX_DSH_DEV_URL;
  void (devUrl
    ? wc.loadURL(devUrl).catch((e: unknown) => log('shell loadURL error: ' + String(e)))
    : wc.loadFile(join(__dirname, '..', 'ui', 'dist', 'index.html')).catch((e: unknown) => log('shell loadFile error: ' + String(e))));
}

function showWebUI(baseUrl: string): void {
  if (!win || win.isDestroyed()) return;
  // The hosted web UI fills the window: there is no titlebar overlay, so no
  // inset applies — the shell's window chrome lives inside the web UI itself
  // (ui-lx-shell's Session Header chrome + drag region).
  if (webUILoadedUrl === baseUrl && isWebUiShowing(baseUrl)) return; // already showing — never abort an in-flight load
  webUILoadedUrl = baseUrl;
  showing = 'webui';
  log('webui loadURL: ' + baseUrl);
  const wc = win.webContents;
  wc.once('dom-ready', () => {
    log('webui dom-ready — devtools');
    if (process.env.LX_DSH_DEV_URL) {
      try { wc.openDevTools(); } catch (e) { log('openDevTools failed: ' + String(e)); }
    }
  });
  void wc.loadURL(baseUrl)
    .catch((e: unknown) => log('webui loadURL error: ' + String(e)));
}

/**
 * The cached `webUILoadedUrl` alone can go stale when the webContents was
 * navigated elsewhere (shell reload, dev navigation). Serving is real only
 * while the live document's origin still matches the web UI's.
 */
function isWebUiShowing(baseUrl: string): boolean {
  if (!win || win.isDestroyed()) return false;
  try {
    return new URL(win.webContents.getURL()).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function hideWebUI(): void {
  webUILoadedUrl = null;
  if (!win || win.isDestroyed()) return;
  if (showing === 'startup') return; // already on the startup shell — no reload needed
  showing = 'startup';
  // return to the LX-DSH startup shell while the backend is down / restarting
  loadShell(win.webContents);
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 640,
    title: 'LX-DSH',
    frame: false,
    backgroundColor: '#ffffff',
    show: false,
    ...(existsSync(iconPath()) ? { icon: iconPath() } : {}),
    webPreferences: {
      preload: join(__dirname, 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.on('render-process-gone', (_e, details) => {
    log('renderer gone: reason=' + details.reason + ' exitCode=' + details.exitCode);
  });
  win.webContents.on('unresponsive', () => log('renderer unresponsive'));
  win.webContents.on('responsive', () => log('renderer responsive again'));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('load failed: ' + code + ' ' + desc + ' ' + url);
  });
  win.webContents.on('did-finish-load', () => {
    log('did-finish-load: ' + win.webContents.getURL());
    win.setTitle('LX-DSH');
  });
  win.on('resize', () => { /* frameless: no overlay to relayout */ });
  win.once('ready-to-show', () => {
    log('ready-to-show');
    win?.show();
  });
  // links opened from chat go to the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // close = hide to tray; real quit goes through the tray / before-quit
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  showing = 'startup';
  loadShell(win.webContents);
  // Auto-open DevTools in dev mode for debugging.
  if (process.env.LX_DSH_DEV_URL || process.env.LX_DSH_DEV_INSTANCE) {
    win.webContents.openDevTools({ mode: 'right' });
  }
}

function openWebview(): void {
  const url = remoteMode?.url ?? backend.baseUrl;
  if (!url) return;
  if (webview && !webview.isDestroyed()) {
    webview.show();
    webview.focus();
    return;
  }
  webview = new BrowserWindow({
    width: 1320,
    height: 860,
    title: 'LX-DSH — Web View',
    backgroundColor: '#ffffff',
    ...(existsSync(iconPath()) ? { icon: iconPath() } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  void webview.loadURL(url);
  webview.on('closed', () => {
    webview = null;
  });
}

// ── Remote-backend mode ──────────────────────────────────────────────────────
// The shell either spawns its own local dsh backend or connects to another
// backend's web UI by URL (address + access key, both shown in that
// backend's settings → 外网访问). Connected clients fully share that backend's
// sessions, live streaming, and control — the multi-client story.

/** Probe one remote backend URL (the authenticated root). */
async function validateRemote(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    // 303 = the token-minting redirect; 2xx = already-cooked serving.
    if (res.ok || res.status === 303) return { ok: true };
    return { ok: false, error: `远端返回 HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: `连接失败：${String((err as Error)?.message ?? err)}` };
  }
}

/** Emit the backend event carrying the remote mode so the shell hides / the web UI loads. */
function emitRemoteState(): void {
  if (win === null || win.isDestroyed()) return;
  const payload = remoteMode === null
    ? undefined
    : { state: 'running' as const, baseUrl: remoteMode.url, remoteUrl: remoteMode.url };
  try {
    if (payload !== undefined) win.webContents.send('backend:event', payload);
  } catch (err) {
    log('remote state send failed: ' + String(err));
  }
}

/** Connect to a remote backend URL and persist the choice. */
async function connectRemote(url: string): Promise<{ ok: boolean; error?: string }> {
  const probe = await validateRemote(url);
  if (!probe.ok) {
    if (remoteMode === null) backend.reportStartupError(`远端后端不可用 — ${probe.error}`);
    return { ok: false, error: probe.error };
  }
  remoteMode = { url };
  const settings = readSettings();
  writeSettings({ ...settings, remote: { url } });
  // A local backend that was running is superseded: stop it so only the
  // remote connection serves this shell.
  if (backend.state !== 'idle' && backend.state !== 'stopping') backend.stop();
  log('remote backend connected: ' + url);
  showWebUI(url);
  emitRemoteState();
  buildTray();
  buildMenu();
  return { ok: true };
}

/** Drop the remote connection and boot the local backend again. */
function disconnectRemote(): void {
  remoteMode = null;
  const settings = readSettings();
  writeSettings({ ...settings, remote: null });
  hideWebUI();
  log('remote backend disconnected — starting local backend');
  startLocalBackend(settings);
  buildTray();
  buildMenu();
}

/** Boot the local backend honoring the LAN-bind setting. */
function startLocalBackend(settings: ReturnType<typeof readSettings>): void {
  backend.setBindHost(settings.lanBind ? '0.0.0.0' : '127.0.0.1');
  try {
    const dshRoot = ensureDshRuntime();
    backend.setVendorRoot(dshRoot);
    log('dsh root: ' + dshRoot);
    backend.start();
  } catch (err) {
    backend.reportStartupError(String((err as Error)?.message ?? err));
  }
}

/** Remote-connect manager window: the startup shell routed to #remote. */
let remoteWin: BrowserWindow | null = null;
function openRemoteConnect(): void {
  if (remoteWin && !remoteWin.isDestroyed()) {
    remoteWin.focus();
    return;
  }
  remoteWin = new BrowserWindow({
    width: 620,
    height: 560,
    resizable: true,
    minimizable: true,
    title: '连接远端后端',
    frame: false,
    parent: win ?? undefined,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  remoteWin.once('ready-to-show', () => remoteWin?.show());
  const pluginUrl = process.env.LX_DSH_DEV_URL;
  if (pluginUrl) {
    void remoteWin.loadURL(pluginUrl + '#remote');
  } else {
    void remoteWin.loadFile(join(__dirname, '..', 'ui', 'dist', 'index.html'), { hash: 'remote' });
  }
  remoteWin.on('closed', () => { remoteWin = null; });
}

function toggleWindow(): void {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

function buildMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'LX-DSH',
      submenu: [
        { label: 'Copy backend URL', click: () => { if (backend.baseUrl) clipboard.writeText(backend.baseUrl); } },
        { type: 'separator' },
        { role: 'quit', label: 'Quit LX-DSH' },
      ],
    },
    {
      label: 'Backend',
      submenu: [
        { label: 'Restart backend', enabled: remoteMode === null, click: () => backend.restart() },
        { label: '连接远端后端…', click: () => openRemoteConnect() },
        {
          label: '断开远端，使用本地后端',
          enabled: remoteMode !== null,
          click: () => { disconnectRemote(); },
        },
        { type: 'separator' },
        { label: 'Open web view', enabled: !!backend.baseUrl || remoteMode !== null, click: () => openWebview() },
        {
          label: 'Open in system browser',
          enabled: !!backend.baseUrl || remoteMode !== null,
          click: () => { const url = remoteMode?.url ?? backend.baseUrl; if (url) void shell.openExternal(url); },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function buildTray(): void {
  const img = nativeImage.createFromPath(iconPath());
  const trayIcon = img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 24, height: 24 });
  tray = new Tray(trayIcon);
  const rebuild = (): void => {
    const port = backend.baseUrl ? backend.baseUrl.split(':').pop() : '';
    const remote = remoteMode !== null ? `remote ${new URL(remoteMode.url).host}` : '';
    if (tray) tray.setToolTip('LX-DSH — ' + (remote !== '' ? remote : backend.state + (port ? ' : ' + port : '')));
    if (!tray) return;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show / hide LX-DSH', click: () => toggleWindow() },
        { label: 'Open web view', enabled: !!backend.baseUrl || remoteMode !== null, click: () => openWebview() },
        {
          label: 'Copy backend URL',
          enabled: !!backend.baseUrl || remoteMode !== null,
          click: () => {
            const url = remoteMode?.url ?? backend.baseUrl;
            if (url) clipboard.writeText(url);
          },
        },
        { type: 'separator' },
        { label: '连接远端后端…', click: () => openRemoteConnect() },
        {
          label: '断开远端，使用本地后端',
          enabled: remoteMode !== null,
          click: () => { disconnectRemote(); },
        },
        ...(remoteMode === null ? [
          { label: 'Restart backend', click: () => backend.restart() },
        ] : [] as Electron.MenuItemConstructorOptions[]),
        { type: 'separator' },
        {
          label: 'Quit LX-DSH',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  };
  rebuild();
  backend.onEvent(rebuild);
  tray.on('click', () => toggleWindow());
}

function registerIpc(): void {
  ipcMain.handle('lx:api', async (e, domain: string, method: string, payload: unknown) => {
    // D5 native intercepts: these drive the desktop, do them locally
    if (domain === 'host' && method === 'pickDirectory') {
      const bw = e.sender.getBrowserWindow();
      if (!bw) return { rpcId: randomUUID(), result: { ok: false, error: { code: 'no-window', message: 'no browser window attached' } } };
      const r = await dialog.showOpenDialog(bw, {
        properties: ['openDirectory'],
      });
      const path = r.canceled ? null : r.filePaths[0];
      return { rpcId: randomUUID(), result: { ok: true, value: { path } } };
    }
    if (domain === 'host' && method === 'openPath') {
      const p = String((payload as Record<string, unknown> | undefined)?.path ?? '');
      if (!p) return { rpcId: randomUUID(), result: { ok: false, error: { code: 'bad-request', message: 'empty path' } } };
      const err = await shell.openPath(p);
      if (err) return { rpcId: randomUUID(), result: { ok: false, error: { code: 'internal', message: err } } };
      return { rpcId: randomUUID(), result: { ok: true, value: { opened: true } } };
    }
    // The 0.1.2 upstream removed the apiproxy RPC surface this forwarding
    // relied on; the dsh web UI talks to the backend directly from the
    // renderer. Only the local intercepts above still answer.
    throw new Error('backend RPC retired: the dsh web UI connects to the backend directly');
  });
  ipcMain.handle('lx:backend', () => {
    if (remoteMode !== null) {
      return { state: 'running', baseUrl: remoteMode.url, remoteUrl: remoteMode.url };
    }
    return backend.info();
  });
  ipcMain.handle('lx:appVersion', () => app.getVersion());
  ipcMain.handle('lx:restart', () => {
    backend.restart();
    return true;
  });
  // ── Remote-backend mode + local settings ────────────────────────────────
  ipcMain.handle('lx:settings', () => {
    const settings = readSettings();
    return {
      remote: remoteMode !== null ? { url: remoteMode.url } : settings.remote,
      lanBind: settings.lanBind,
      connected: remoteMode !== null,
    };
  });
  ipcMain.handle('lx:remote:compose', (_e, address: string, token: string) => {
    return composeRemoteUrl(String(address ?? ''), String(token ?? ''));
  });
  ipcMain.handle('lx:remote:connect', async (_e, address: string, token: string) => {
    const composed = composeRemoteUrl(String(address ?? ''), String(token ?? ''));
    if ('error' in composed) return { ok: false, error: composed.error };
    return connectRemote(composed.url);
  });
  ipcMain.handle('lx:remote:disconnect', () => {
    if (remoteMode === null) return { ok: true };
    disconnectRemote();
    return { ok: true };
  });
  ipcMain.handle('lx:settings:lanBind', (_e, enabled: boolean) => {
    const settings = readSettings();
    writeSettings({ ...settings, lanBind: enabled === true });
    if (remoteMode === null) {
      // Rebind needs a backend restart; do it immediately so the toggle is
      // observable (the shell shows the boot state again).
      backend.stop();
      setTimeout(() => startLocalBackend(readSettings()), 300);
    }
    return { ok: true };
  });
  ipcMain.handle('lx:webview', () => {
    openWebview();
    return true;
  });
  ipcMain.handle('lx:copy', (_e, t: string) => {
    clipboard.writeText(String(t ?? ''));
  });
  // Open a project folder in the chosen desktop tool: VS Code and Cursor ride
  // their registered URL protocols (file form); the explorer reveal opens the
  // directory itself. A missing protocol handler rejects and is reported.
  ipcMain.handle('lx:openEditor', async (_e, cwd: string, target: 'vscode' | 'cursor' | 'explorer'): Promise<{ ok: boolean, error?: string }> => {
    const dir = String(cwd ?? '').trim();
    if (dir === '') return { ok: false, error: 'no working directory' };
    try {
      if (target === 'explorer') {
        const openError = await shell.openPath(dir);
        return openError === '' ? { ok: true } : { ok: false, error: openError };
      }
      const scheme = target === 'cursor' ? 'cursor' : 'vscode';
      const uri = `${scheme}://file/` + encodeURI(dir.replace(/\\/g, '/'));
      await shell.openExternal(uri);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  // Window controls act on the CALLING window (main, quick-answers popup), so
  // a frameless child's chrome never reaches into the main window. The main
  // window keeps its close-to-tray behavior; child windows really close.
  const senderWindow = (e: Electron.IpcInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle('lx:win:min', (e) => senderWindow(e)?.minimize());
  ipcMain.handle('lx:win:max', (e) => {
    const target = senderWindow(e);
    if (!target) return;
    if (target.isMaximized()) target.unmaximize();
    else target.maximize();
  });
  ipcMain.handle('lx:win:close', (e) => {
    const target = senderWindow(e);
    if (!target) return;
    if (target === win) target.hide();
    else target.close();
  });

  // ── Plugin management: read/modify the web profile's package.json ──
  const OFFICIAL_PREFIX = '@deepseek-ai/';
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');

  // Plugin manager window: a standalone BrowserWindow that loads the same
  // shell but with a query flag to show the plugin view instead of startup.
  let pluginWin: BrowserWindow | null = null;
  function openPluginManager(): void {
    if (pluginWin && !pluginWin.isDestroyed()) {
      pluginWin.focus();
      return;
    }
    pluginWin = new BrowserWindow({
      width: 680,
      height: 560,
      resizable: true,
      minimizable: false,
      maximizable: false,
      title: '插件管理',
      frame: false,
      parent: win ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      show: false,
      webPreferences: {
        preload: join(__dirname, 'index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    pluginWin.once('ready-to-show', () => pluginWin?.show());
    // In dev mode load from the Vite dev server (HMR); otherwise load the built file.
    const pluginUrl = process.env.LX_DSH_DEV_URL;
    if (pluginUrl) {
      void pluginWin.loadURL(pluginUrl + '#plugins');
      pluginWin.webContents.openDevTools({ mode: 'right' });
    } else {
      void pluginWin.loadFile(join(__dirname, '..', 'ui', 'dist', 'index.html'), { hash: 'plugins' });
    }
    pluginWin.on('closed', () => { pluginWin = null; });
  }

  ipcMain.handle('lx:plugins:open', () => {
    openPluginManager();
    return true;
  });

  ipcMain.handle('lx:plugins:list', async () => {
    try {
      const profileDir = join(dshHome, 'profiles', 'web');
      const pkgPath = join(profileDir, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const deps = (pkg.dependencies ?? {}) as Record<string, string>;
      const bundles = (pkg.dsh?.profile?.bundles ?? []) as string[];
      const result = [];
      for (const [name, version] of Object.entries(deps)) {
        if (name.startsWith(OFFICIAL_PREFIX)) continue; // skip official dsh-* packages
        const isOfficial = false;
        const installed = await readPluginPackageJson(profileDir, name);
        result.push({
          name,
          version: installed?.version ?? String(version),
          description: installed?.description ?? '',
          source: name.startsWith('@') && !name.startsWith('@deepseek-ai/') ? 'third-party' : 'self',
          official: isOfficial,
          readme: installed?.readme,
        });
      }
      return result;
    } catch (err) {
      log('plugins:list error: ' + String(err));
      return [];
    }
  });
  ipcMain.handle('lx:plugins:install', async (_e, name: string) => {
    try {
      const { execFileSync } = await import('node:child_process');
      const vr = backend.vendorRootPath;
      if (!vr) return { ok: false, error: 'dsh runtime not ready' };
      const dshBin = join(vr, 'lib', 'bin.js');
      execFileSync(process.execPath, [dshBin, 'plugin', '--profile', 'web', 'add', name], {
        cwd: join(dshHome, 'profiles', 'web'),
        stdio: 'pipe',
        timeout: 120_000,
        encoding: 'utf8',
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });
  ipcMain.handle('lx:plugins:uninstall', async (_e, name: string) => {
    try {
      const { execFileSync } = await import('node:child_process');
      const vr = backend.vendorRootPath;
      if (!vr) return { ok: false, error: 'dsh runtime not ready' };
      const dshBin = join(vr, 'lib', 'bin.js');
      execFileSync(process.execPath, [dshBin, 'plugin', '--profile', 'web', 'remove', name], {
        cwd: join(dshHome, 'profiles', 'web'),
        stdio: 'pipe',
        timeout: 60_000,
        encoding: 'utf8',
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  });

  // Manual titlebar drag: the renderer reports pointer deltas from the grab
  // point; the main process anchors only the window position at drag start.
  // (Anchoring the cursor too double-subtracts — the delta already encodes it.)
  // Per-window drag state, keyed by the dragging WebContents id: the main
// window and the quick-answers popup can both be dragged concurrently.
let dragOrigin: Map<number, number[]> = new Map();
  ipcMain.on('lx:win:drag:start', (e) => {
    const target = BrowserWindow.fromWebContents(e.sender);
    if (!target || target.isDestroyed()) return;
    if (target.isMaximized()) target.unmaximize();
    dragOrigin.set(e.sender.id, target.getPosition());
  });
  ipcMain.on('lx:win:drag:move', (e, dx: number, dy: number) => {
    const target = BrowserWindow.fromWebContents(e.sender);
    const origin = dragOrigin.get(e.sender.id);
    if (!origin || !target || target.isDestroyed()) return;
    target.setPosition(origin[0] + dx, origin[1] + dy);
  });
  ipcMain.on('lx:win:drag:end', (e) => {
    dragOrigin.delete(e.sender.id);
  });
  // Safety net: losing focus mid-drag ends it (alt-tab, notification click…).
  app.on('browser-window-blur', () => {
    dragOrigin.clear();
  });
}

// Dev instances (pnpm run dev) share the productName with the installed app and
// would lose the single-instance lock to it; give them their own userData dir so
// the lock (and settings/tray state) never collide with the installed instance.
// LX_DSH_DEV_URL (vite dev server) or LX_DSH_DEV_INSTANCE (standalone dev build)
// both trigger the dev identity.
if (process.env.LX_DSH_DEV_URL || process.env.LX_DSH_DEV_INSTANCE) {
  app.setName('LX-DSH-Dev');
  app.setPath('userData', join(app.getPath('appData'), 'LX-DSH-Dev'));
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => toggleWindow());
  app.whenReady().then(() => {
    app.setName('LX-DSH');
    buildMenu();
    createWindow();
    buildTray();
    registerIpc();
    const sendIfAlive = (channel: string, payload: unknown): void => {
      try {
        if (win && !win.isDestroyed()) {
          // backend:frame has no listener in the main webContents (the dsh web
          // UI reads the backend directly over HTTP) — sending there is pure
          // IPC serialization overhead, so it is dropped.
          if (channel !== 'backend:frame') {
            win.webContents.send(channel, payload);
            log('ipc send ' + channel);
          }
        } else if (channel !== 'backend:frame') {
          log('ipc send ' + channel + ' SKIPPED (win null/destroyed)');
        }
      } catch (err) {
        log('ipc send ' + channel + ' THREW: ' + String(err));
      }
    };
    backend.onEvent((e) => sendIfAlive('backend:event', e));
    backend.onLog((l) => sendIfAlive('backend:log', l));
    // Load the real dsh web UI into the main webContents once the backend is
    // running (dropdowns/overlays are never clipped this way); fall back to the
    // LX-DSH startup shell while booting / failed.
    backend.onEvent((e) => {
      if (e.state === 'running' && e.baseUrl) {
        showWebUI(e.baseUrl);
      } else {
        hideWebUI();
      }
    });
    // Boot per settings: a persisted remote connection validates and shows
    // that backend's web UI directly (no local spawn); otherwise the local
    // dsh backend boots (loopback by default, all interfaces with lanBind).
    const settings = readSettings();
    if (settings.remote !== null) {
      log('remote backend configured: ' + settings.remote.url);
      void connectRemote(settings.remote.url);
    } else {
      startLocalBackend(settings);
    }
    // auto-update check (skipped in dev)
    initUpdater(win);
    try {
      globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
    } catch (err) {
      log('global shortcut registration failed: ' + String(err));
    }
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('before-quit', () => {
    quitting = true;
    backend.stop();
  });
  // tray-resident: no quit on window-all-closed
}

/** Read a plugin's own package.json from its node_modules directory. */
async function readPluginPackageJson(
  profileDir: string,
  name: string,
): Promise<{ version?: string; description?: string; readme?: string } | null> {
  try {
    const pkgPath = join(profileDir, 'node_modules', name, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    let readme: string | undefined;
    const readmePath = join(profileDir, 'node_modules', name, 'README.md');
    if (existsSync(readmePath)) {
      const text = readFileSync(readmePath, 'utf8');
      // Truncate to first 500 chars for preview
      readme = text.slice(0, 500) + (text.length > 500 ? '…' : '');
    }
    return { version: pkg.version, description: pkg.description, readme };
  } catch {
    return null;
  }
}
