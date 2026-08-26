// LX-DSH main process (M1): the real dsh web UI is loaded directly into the main
// webContents (so its dropdowns / popovers / dialogs are never clipped by a
// child-view rectangle). The custom titlebar is an overlay WebContentsView that
// floats on top (drag region, telemetry, window controls). While booting the
// LX-DSH startup shell shows underneath that overlay.
import { app, BrowserWindow, Menu, Tray, WebContentsView, clipboard, dialog, globalShortcut, ipcMain, nativeImage, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DshBackend } from './backend.js';
import { initUpdater } from './updater.js';
import { log } from './log.js';
import { TITLEBAR_H } from '../shared/chrome.js';

// Vendored dsh lives at <app>/vendor/dsh in dev, but in a packaged build it is
// copied to resources/vendor/dsh by post-vendor.mjs (outside the asar — a
// spawned plain-node dsh process can't read inside asar), so resolve via
// process.resourcesPath when packaged.
// LX_DSH_ROOT overrides to point at a locally-built dsh (e.g. a deepseek-harness
// monorepo apps/cli with a compiled lib/) for the "build-from-source" dev loop.
const vendorRoot = process.env.LX_DSH_ROOT
  ?? (app.isPackaged
    ? join(process.resourcesPath, 'vendor', 'dsh')
    : join(__dirname, '..', 'vendor', 'dsh'));
const backend = new DshBackend(vendorRoot);
let win: BrowserWindow | null = null;
let webview: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

let titlebarView: WebContentsView | null = null;
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
// Chrome DevTools Protocol on that port. scripts/cdp-capture.mjs uses it to
// screenshot each webContents (main window + titlebar overlay) without being
// affected by window occlusion / hide-to-tray / software-render compositing.
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

// The titlebar overlay view: a thin WebContentsView on top of the main webContents
// hosting the LX-DSH React titlebar (drag region, telemetry, window controls).
function ensureTitlebarView(): WebContentsView | null {
  if (!win || win.isDestroyed()) return null;
  if (titlebarView) return titlebarView;
  titlebarView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.contentView.addChildView(titlebarView);
  titlebarView.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  loadShell(titlebarView.webContents);
  layoutTitlebarView();
  return titlebarView;
}

function layoutTitlebarView(): void {
  if (!titlebarView || !win || win.isDestroyed()) return;
  const [w] = win.getContentSize();
  titlebarView.setBounds({ x: 0, y: 0, width: w, height: TITLEBAR_H });
}

function showWebUI(baseUrl: string): void {
  if (!win || win.isDestroyed()) return;
  // The hosted web UI is meant to read window.__DSH_HOST__ (declared by the
  // preload) and apply the titlebar inset itself via --dsh-app-inset-*. The
  // vendored dsh web frontend has not wired up that boot contract yet, so until
  // it does we push #root down by TITLEBAR_H from the shell side after load.
  if (webUILoadedUrl === baseUrl) return; // already showing — never abort an in-flight load
  webUILoadedUrl = baseUrl;
  showing = 'webui';
  log('webui loadURL: ' + baseUrl);
  const wc = win.webContents;
  // The hosted web UI consumes --dsh-app-inset-top itself: its base CSS sets
  // body { padding-top: var(--dsh-app-inset-top, 0px) } and fixed/overlay
  // surfaces (modals, toasts, onboarding) offset from the same variable. We
  // only need to declare the variable; the web UI handles all layout.
  const applyInset = (): void => {
    void wc.insertCSS(`:root{--dsh-app-inset-top:${TITLEBAR_H}px}`)
      .catch((e: unknown) => log('webui insertCSS error: ' + String(e)));
  };
  wc.once('dom-ready', () => {
    log('webui dom-ready — applying inset + devtools');
    applyInset();
    if (process.env.LX_DSH_DEV_URL) {
      try { wc.openDevTools(); } catch (e) { log('openDevTools failed: ' + String(e)); }
    }
  });
  void wc.loadURL(baseUrl)
    .then(applyInset)
    .catch((e: unknown) => { wc.removeListener('dom-ready', applyInset); log('webui loadURL error: ' + String(e)); });
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
    console.log('[lx-dsh] renderer gone: reason=' + details.reason + ' exitCode=' + details.exitCode);
  });
  win.webContents.on('unresponsive', () => console.log('[lx-dsh] renderer unresponsive'));
  win.webContents.on('responsive', () => console.log('[lx-dsh] renderer responsive again'));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log('[lx-dsh] load failed: ' + code + ' ' + desc + ' ' + url);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('[lx-dsh] did-finish-load: ' + win.webContents.getURL());
    win.setTitle('LX-DSH');
  });
  win.on('resize', () => layoutTitlebarView());
  win.once('ready-to-show', () => {
    console.log('[lx-dsh] ready-to-show');
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
  ensureTitlebarView();
  // Auto-open DevTools in dev mode for debugging.
  if (process.env.LX_DSH_DEV_URL || process.env.LX_DSH_DEV_INSTANCE) {
    win.webContents.openDevTools({ mode: 'right' });
  }
}

// Dev-only probes (env-gated): capture screenshots, auto-open a session.
// Probe state is mirrored to <shotBase>.probe.log so it is readable even when
// stdout capture is truncated.
function probeLog(shotBase: string | undefined, msg: string): void {
  if (!shotBase) return;
  try {
    const { appendFileSync } = require('node:fs') as typeof import('node:fs');
    appendFileSync(shotBase + '.probe.log', new Date().toISOString() + ' ' + msg + '\n');
  } catch {
    /* ignore */
  }
}
function installDebugProbes(w: BrowserWindow): void {
  const shotBase = process.env.LX_DSH_SHOT;
  const openId = process.env.LX_DSH_OPEN;
  probeLog(shotBase, 'probes installed open=' + (openId ?? 'none'));
  log('debug probes installed: shot=' + (shotBase ?? 'none') + ' open=' + (openId ?? 'none'));
  let runningAt: number | null = null;
  backend.onEvent((e) => {
    if (e.state === 'running' && runningAt === null) {
      runningAt = Date.now();
      probeLog(shotBase, 'backend running (t0 for shots)');
      if (openId) {
        probeLog(shotBase, 'will send debug:open in 2.5s');
        setTimeout(() => {
          probeLog(shotBase, 'sending debug:open ' + openId);
          if (!w.isDestroyed()) w.webContents.send('debug:open', openId);
        }, 2500);
      }
    }
  });
  if (shotBase) {
    // Boot shot: capture the startup view (new loading page) ~1.2s after launch,
    // while the dsh backend is still coming up (warm boots reach running in ~2.5s).
    let bootShotDone = false;
    setTimeout(() => {
      if (bootShotDone) return;
      bootShotDone = true;
      void fireShot(shotBase + '.boot.png');
    }, 1200);
    let tbarShotDone = false;
    const poll = setInterval(() => {
      if (runningAt === null) return;
      const dt = Date.now() - runningAt;
      if (dt >= 10000 && !shotDone[0]) {
        shotDone[0] = true;
        void fireShot(shotBase);
      }
      // Also capture the titlebar OVERLAY's own webContents (unaffected by window
      // occlusion/hiding) so the chrome can be inspected on its own.
      if (dt >= 15000 && !tbarShotDone) {
        tbarShotDone = true;
        void (async () => {
          const p = shotBase + '.tbar.png';
          try {
            if (titlebarView && !titlebarView.webContents.isDestroyed()) {
              const img = await Promise.race([
                titlebarView.webContents.capturePage(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('tbar capture timeout (8s)')), 8000)),
              ]);
              writeFileSync(p, img.toPNG());
              probeLog(shotBase, 'titlebar overlay shot saved: ' + p);
            } else {
              probeLog(shotBase, 'titlebar overlay not available (titlebarView null/destroyed)');
            }
          } catch (err) {
            probeLog(shotBase, 'titlebar overlay shot failed: ' + String(err));
          }
        })();
      }
      if (dt >= 40000 && !shotDone[1]) {
        shotDone[1] = true;
        const dot = shotBase.lastIndexOf('.');
        void fireShot(dot === -1 ? shotBase + 'b.png' : shotBase.slice(0, dot) + 'b' + shotBase.slice(dot));
        clearInterval(poll);
      }
    }, 1000);
    setTimeout(() => {
      if (runningAt === null) {
        clearInterval(poll);
        probeLog(shotBase, 'shots cancelled: backend never reached running within 180s');
      }
    }, 180000);
    const shotDone = [false, false];
    const fireShot = async (path: string): Promise<void> => {
      probeLog(shotBase, 'shot firing: ' + path + ' (t+' + Math.round((Date.now() - (runningAt ?? 0)) / 1000) + 's after running)');
      log('debug shot firing: ' + path);
      try {
        if (w.isDestroyed()) {
          probeLog(shotBase, 'shot aborted: window destroyed');
          return;
        }
        const img = await Promise.race([
          w.webContents.capturePage(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('capturePage timeout (10s)')), 10000)),
        ]);
        writeFileSync(path, img.toPNG());
        probeLog(shotBase, 'shot saved: ' + path);
        log('debug shot saved: ' + path);
      } catch (err) {
        probeLog(shotBase, 'shot failed: ' + String(err));
        log('debug shot failed: ' + String(err));
      }
    };
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
      const r = await dialog.showOpenDialog(e.sender.getBrowserWindow() ?? new BrowserWindow({ show: false }), {
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
      const dshBin = join(vendorRoot, 'lib', 'bin.js');
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
      const dshBin = join(vendorRoot, 'lib', 'bin.js');
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
    if (win) installDebugProbes(win);
    buildTray();
    registerIpc();
    const sendIfAlive = (channel: string, payload: unknown): void => {
      try {
        if (win && !win.isDestroyed()) {
          // backend:frame is only consumed by the titlebar overlay's React app.
          // The main webContents runs the dsh web UI which has no listener for
          // it — forwarding there is pure IPC serialization overhead.
          if (channel === 'backend:frame') {
            if (titlebarView && !titlebarView.webContents.isDestroyed()) {
              titlebarView.webContents.send(channel, payload);
            }
          } else {
            win.webContents.send(channel, payload);
            if (titlebarView && !titlebarView.webContents.isDestroyed()) {
              titlebarView.webContents.send(channel, payload);
            }
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
    backend.start();
    // auto-update check (skipped in dev)
    initUpdater(win);
    try {
      globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
    } catch (err) {
      console.warn('[lx-dsh] global shortcut registration failed:', String(err));
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
