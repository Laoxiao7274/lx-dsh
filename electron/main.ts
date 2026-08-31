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

// The dsh runtime is built from the deepseek-harness source checkout: in dev
// the backend runs the workspace build (deepseek-harness/apps/cli) directly;
// in a packaged build the runtime ships as resources/dsh/ — plain files, no
// extraction (electron/dsh-runtime.ts). The
// resolved root is handed to the backend after ensureDshRuntime() completes.
const backend = new DshBackend();
let win: BrowserWindow | null = null;
let webview: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

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
  if (webUILoadedUrl === baseUrl) return; // already showing — never abort an in-flight load
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
  if (!backend.baseUrl) return;
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
  void webview.loadURL(backend.baseUrl);
  webview.on('closed', () => {
    webview = null;
  });
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
        { label: 'Restart backend', click: () => backend.restart() },
        { label: 'Open web view', click: () => openWebview() },
        { label: 'Open in system browser', click: () => { if (backend.baseUrl) void shell.openExternal(backend.baseUrl); } },
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
    if (tray) tray.setToolTip('LX-DSH — ' + backend.state + (port ? ' : ' + port : ''));
    if (!tray) return;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show / hide LX-DSH', click: () => toggleWindow() },
        { label: 'Open web view', enabled: !!backend.baseUrl, click: () => openWebview() },
        {
          label: 'Copy backend URL',
          enabled: !!backend.baseUrl,
          click: () => {
            if (backend.baseUrl) clipboard.writeText(backend.baseUrl);
          },
        },
        { type: 'separator' },
        { label: 'Restart backend', click: () => backend.restart() },
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
    const client = backend.client;
    if (!client) throw new Error('backend not ready (state=' + backend.state + ')');
    const d = (client as Record<string, unknown>)[domain] as Record<string, unknown> | undefined;
    const fn = d ? (d[method] as ((p: unknown) => Promise<unknown>) | undefined) : undefined;
    if (typeof fn !== 'function') throw new Error('unknown api: ' + domain + '.' + method);
    try {
      const receipt = await fn.call(d, payload ?? {});
      if (domain === 'sessions' && method === 'history') {
        const v = (receipt as any)?.result?.value;
        log(
          'history receipt: ok=' + (receipt as any)?.result?.ok +
            ' events=' + (v && Array.isArray(v.events) ? v.events.length : String(typeof v?.events)) +
            ' hasMore=' + (v?.hasMore ?? '?'),
        );
      }
      return receipt;
    } catch (err) {
      log('api ' + domain + '.' + method + ' failed: ' + String((err as Error)?.message ?? err).slice(0, 500));
      throw err;
    }
  });
  ipcMain.handle('lx:backend', () => backend.info());
  ipcMain.handle('lx:appVersion', () => app.getVersion());
  ipcMain.handle('lx:restart', () => {
    backend.restart();
    return true;
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
  ipcMain.handle('lx:win:min', () => win?.minimize());
  ipcMain.handle('lx:win:max', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('lx:win:close', () => win?.hide());

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
  let dragOrigin: { x: number; y: number } | null = null;
  ipcMain.on('lx:win:drag:start', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) win.unmaximize();
    const [x, y] = win.getPosition();
    dragOrigin = { x, y };
  });
  ipcMain.on('lx:win:drag:move', (_e, dx: number, dy: number) => {
    if (!dragOrigin || !win || win.isDestroyed()) return;
    win.setPosition(dragOrigin.x + dx, dragOrigin.y + dy);
  });
  ipcMain.on('lx:win:drag:end', () => {
    dragOrigin = null;
  });
  // Safety net: losing focus mid-drag ends it (alt-tab, notification click…).
  app.on('browser-window-blur', () => {
    dragOrigin = null;
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
    backend.onFrame((m) => sendIfAlive('backend:frame', m));
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
    // Resolve the dsh runtime before booting the backend. In dev this is the
    // deepseek-harness workspace build; packaged it is resources/dsh/ — plain
    // files shipped inside the installer, no extraction step at all.
    try {
      const dshRoot = ensureDshRuntime();
      backend.setVendorRoot(dshRoot);
      log('dsh root: ' + dshRoot);
      backend.start();
    } catch (err) {
      // The startup view shows the error; the user can retry via tray / menu.
      backend.reportStartupError(String((err as Error)?.message ?? err));
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
