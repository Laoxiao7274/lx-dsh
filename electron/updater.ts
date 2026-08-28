// Auto-update module: checks the LX-DSH update server for new releases,
// downloads a lightweight update package (delta zip of changed files),
// verifies per-file sha512 hashes, and applies it on quit via a detached
// PowerShell helper that swaps the staged files into the install dir and
// relaunches.
//
// Two paths:
//  - Delta path: when the server's update package baseVersion matches the
//    currently installed version, download just the changed files (small).
//  - Full fallback: when fullFallback=true or baseVersion doesn't match,
//    defer to electron-updater which downloads the full NSIS installer.
//
// In dev mode (LX_DSH_DEV_URL / LX_DSH_DEV_INSTANCE) the check is skipped.
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { log } from './log.js';
import { launchApplyHelper } from './update-apply.js';

const UPDATE_SERVER = 'http://123.57.129.111';

// ── types ──────────────────────────────────────────────────────────────────

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  version: string | null;
  progress: number | null; // 0-100 download progress
  error: string | null;
  /** Release notes from the server's latest.json (may be absent). */
  notes: string | null;
  /** The currently installed version, for the update dialog's comparison row. */
  currentVersion: string;
}

// What the server returns from /update/win/latest.json
interface UpdateMeta {
  version: string;
  baseVersion: string | null;
  channel: string;
  date: string;
  url: string;
  sha512: string;
  size: number;
  fullFallback: boolean;
  /** Optional release-notes text the update dialog renders as the changelog. */
  notes?: string;
}

// What's inside the zip's update.json
interface UpdateManifest {
  kind: string;
  version: string;
  baseVersion: string | null;
  date: string;
  files: Record<string, { sha512: string; size: number }>;
  deleted: string[];
}

// ── state ──────────────────────────────────────────────────────────────────

let updateAvailable = false;
let downloadedVersion: string | null = null;
let checking = false;
let downloadProgress: number | null = null;
let lastError: string | null = null;

// The staged delta update (ready to apply on quit)
let stagedUpdate: { stagedDir: string; installDir: string; exeName: string; deleted: string[]; cleanupDir: string; needsElevation: boolean } | null = null;

// The downloaded update meta (for version comparison)
let pendingMeta: UpdateMeta | null = null;

// Whether the full NSIS installer fallback is armed (electron-updater)
let fullFallbackArmed = false;

function currentStatus(): UpdateStatus {
  return {
    checking,
    available: updateAvailable,
    version: downloadedVersion ?? pendingMeta?.version ?? null,
    progress: downloadProgress,
    error: lastError,
    notes: pendingMeta?.notes ?? null,
    currentVersion: app.getVersion(),
  };
}

function broadcast(win: BrowserWindow | null, channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

// Simple semver compare: a > b -> positive. Good enough for x.y.z[-tag].
function cmpVer(a: string, b: string): number {
  const pa = String(a).split(/[.+\-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.+\-]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function sha512File(p: string): string {
  return createHash('sha512').update(readFileSync(p)).digest('hex');
}

// Extract a zip using PowerShell's built-in Expand-Archive (Windows 10+).
// Unlike 7za (which only exists on build machines), Expand-Archive is always
// available on user machines — critical for the delta update path to work.
function extractZip(zipPath: string, destDir: string): void {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
  // In PowerShell single-quoted strings, a literal single quote is doubled.
  const esc = (s: string) => s.replace(/'/g, "''");
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${esc(zipPath)}' -DestinationPath '${esc(destDir)}' -Force`,
  ], { stdio: 'pipe' });
}

// Check if the install directory is writable (Program Files is not without elevation).
function isDirWritable(dir: string): boolean {
  try {
    const test = join(dir, '.lx-dsh-write-test-' + Date.now());
    writeFileSync(test, '');
    rmSync(test, { force: true });
    return true;
  } catch {
    return false;
  }
}

// ── delta download + verify + stage ─────────────────────────────────────────

/**
 * Download the delta update package, verify it, and stage the files.
 * Resolves true on success, throws on failure.
 */
async function downloadAndStageDelta(win: BrowserWindow | null, meta: UpdateMeta): Promise<boolean> {
  const updateDir = join(app.getPath('userData'), 'updates', meta.version);
  rmSync(updateDir, { recursive: true, force: true });
  mkdirSync(updateDir, { recursive: true });
  const zipPath = join(updateDir, 'update.zip');

  // 1) download
  log('updater: downloading delta ' + meta.version + ' from ' + meta.url);
  downloadProgress = 0;
  broadcast(win, 'updater:status', currentStatus());

  const resp = await fetch(UPDATE_SERVER + meta.url);
  if (!resp.ok) throw new Error('download failed: HTTP ' + resp.status);
  const total = Number(resp.headers.get('content-length') || meta.size);
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('no response body');
  const chunks: Buffer[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    received += value.length;
    if (total > 0) {
      downloadProgress = Math.round((received / total) * 100);
      broadcast(win, 'updater:progress', { percent: downloadProgress });
    }
  }
  const buf = Buffer.concat(chunks);
  writeFileSync(zipPath, buf);
  downloadProgress = null;

  // 2) verify zip-level sha512
  const zipHash = createHash('sha512').update(buf).digest('hex');
  if (meta.sha512 && zipHash !== meta.sha512) {
    throw new Error('zip sha512 mismatch');
  }
  log('updater: zip verified (' + (buf.length / 1048576).toFixed(1) + ' MB)');

  // 3) extract
  const extractDir = join(updateDir, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  extractZip(zipPath, extractDir);

  // 4) read + verify the manifest
  const manifestPath = join(extractDir, 'update.json');
  if (!existsSync(manifestPath)) throw new Error('update.json not found in package');
  const manifest: UpdateManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  log('updater: manifest version=' + manifest.version + ' base=' + manifest.baseVersion + ' files=' + Object.keys(manifest.files).length);

  // Guard against baseVersion mismatch: the delta was computed against a
  // specific version. If the installed version differs, the changed-file set
  // is wrong and applying it would corrupt the install. The server's
  // latest.json baseVersion was already checked, but the manifest inside the
  // zip is authoritative — verify it matches too.
  if (manifest.baseVersion && manifest.baseVersion !== app.getVersion()) {
    throw new Error('manifest baseVersion ' + manifest.baseVersion + ' does not match installed ' + app.getVersion());
  }

  // verify every file's sha512 before staging (fail fast, don't apply partial/corrupt)
  for (const [rel, info] of Object.entries(manifest.files)) {
    const filePath = join(extractDir, rel);
    if (!existsSync(filePath)) throw new Error('missing file in package: ' + rel);
    const hash = sha512File(filePath);
    if (hash !== info.sha512) throw new Error('sha512 mismatch: ' + rel);
  }
  log('updater: all ' + Object.keys(manifest.files).length + ' files verified');

  // 5) stage: the extracted dir already mirrors the install layout,
  //    so the apply helper can robocopy it directly over the install dir.
  const installDir = dirname(process.execPath);
  const needsElevation = !isDirWritable(installDir);
  if (needsElevation) {
    log('updater: install dir not writable (Program Files?) — apply will request elevation');
  }
  stagedUpdate = {
    stagedDir: extractDir,
    installDir,
    exeName: 'LX-DSH.exe',
    deleted: manifest.deleted,
    cleanupDir: updateDir,
    needsElevation,
  };
  return true;
}

// ── full NSIS fallback (electron-updater) ────────────────────────────────────

function armFullFallback(win: BrowserWindow | null): void {
  if (fullFallbackArmed) return;
  fullFallbackArmed = true;
  log('updater: arming full NSIS fallback (electron-updater)');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_SERVER + '/win/' });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = Math.round(progress.percent);
    broadcast(win, 'updater:progress', { percent: downloadProgress });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log('updater: full installer downloaded ' + info.version);
    downloadedVersion = info.version;
    broadcast(win, 'updater:downloaded', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    log('updater: electron-updater error: ' + String(err));
    lastError = String(err);
    broadcast(win, 'updater:error', { message: String(err) });
  });

  void autoUpdater.checkForUpdates().catch((e) => log('updater: fallback check failed: ' + String(e)));
}

// ── public init ───────────────────────────────────────────────────────────────

/**
 * Initialize the auto-updater. Call once after the app is ready.
 * In dev mode the check is skipped.
 */
export function initUpdater(win: BrowserWindow | null): void {
  // In dev mode / unpackaged: register no-op IPC handlers so the titlebar's
  // update button doesn't throw "No handler registered for 'updater:status'".
  if (process.env.LX_DSH_DEV_URL || process.env.LX_DSH_DEV_INSTANCE) {
    log('updater: skipped in dev mode');
    // LX_DSH_FAKE_UPDATE=1 fabricates an available update so the header
    // button and its dialog can be developed and inspected without a server.
    if (process.env.LX_DSH_FAKE_UPDATE) {
      log('updater: LX_DSH_FAKE_UPDATE set — fabricating an available update');
      updateAvailable = true;
      pendingMeta = {
        version: '9.9.9',
        baseVersion: null,
        channel: 'stable',
        date: new Date().toISOString(),
        url: '',
        sha512: '',
        size: 0,
        fullFallback: true,
        notes: '• 演示更新日志第一行\n• 演示更新日志第二行\n• 修复了会话损坏后的自动修复',
      };
    }
    ipcMain.handle('updater:check', () => currentStatus());
    ipcMain.handle('updater:install', () => false);
    ipcMain.handle('updater:status', () => currentStatus());
    return;
  }
  if (!app.isPackaged) {
    log('updater: skipped (not packaged)');
    ipcMain.handle('updater:check', () => currentStatus());
    ipcMain.handle('updater:install', () => false);
    ipcMain.handle('updater:status', () => currentStatus());
    return;
  }

  // IPC: renderer can trigger a manual check
  ipcMain.handle('updater:check', async () => {
    if (checking) return currentStatus();
    await checkForUpdate(win);
    return currentStatus();
  });

  // IPC: renderer can apply immediately
  ipcMain.handle('updater:install', () => {
    if (stagedUpdate) {
      log('updater: applying delta update on quit (user triggered)');
      app.quit();
      return true;
    }
    if (downloadedVersion) {
      log('updater: quitting and installing (full) ' + downloadedVersion);
      autoUpdater.quitAndInstall();
      return true;
    }
    return false;
  });

  // IPC: get current status
  ipcMain.handle('updater:status', () => currentStatus());

  // apply staged delta on quit
  app.on('before-quit', () => {
    if (stagedUpdate) {
      log('updater: applying staged delta on quit');
      launchApplyHelper(stagedUpdate);
    }
  });

  // Auto-check 10s after startup, then every 4 hours
  setTimeout(() => { void checkForUpdate(win).catch(() => {}); }, 10_000);
  const interval = setInterval(() => { void checkForUpdate(win).catch(() => {}); }, 4 * 60 * 60 * 1000);
  (interval as { unref?: () => void }).unref?.();
}

/** Check the update server for a newer version and download if available. */
async function checkForUpdate(win: BrowserWindow | null): Promise<void> {
  checking = true;
  lastError = null;
  broadcast(win, 'updater:status', currentStatus());
  try {
    const currentVersion = app.getVersion();
    const resp = await fetch(UPDATE_SERVER + '/update/win/latest.json' + '?t=' + Date.now());
    if (!resp.ok) {
      log('updater: no update info (HTTP ' + resp.status + ')');
      checking = false;
      updateAvailable = false;
      broadcast(win, 'updater:status', currentStatus());
      return;
    }
    const meta: UpdateMeta = await resp.json();
    pendingMeta = meta;

    if (cmpVer(meta.version, currentVersion) <= 0) {
      log('updater: up to date (' + currentVersion + ')');
      checking = false;
      updateAvailable = false;
      broadcast(win, 'updater:status', currentStatus());
      return;
    }

    // Newer version available
    log('updater: update available ' + meta.version + ' (base=' + meta.baseVersion + ', fullFallback=' + meta.fullFallback + ')');
    updateAvailable = true;
    downloadedVersion = null; // not yet downloaded
    checking = false;
    broadcast(win, 'updater:status', currentStatus());
    broadcast(win, 'updater:available', { version: meta.version });

    // Decide delta vs full fallback:
    //  - Delta: baseVersion matches current installed version AND not fullFallback
    //  - Full: otherwise (fullFallback, or baseVersion mismatch → too big a gap)
    const canDelta = !meta.fullFallback && meta.baseVersion === currentVersion;
    if (canDelta) {
      try {
        await downloadAndStageDelta(win, meta);
        downloadedVersion = meta.version;
        log('updater: delta staged for ' + meta.version + ' — will apply on quit');
        broadcast(win, 'updater:downloaded', { version: meta.version });
      } catch (err) {
        log('updater: delta failed (' + String(err) + ') — falling back to full');
        lastError = 'delta failed, using full installer';
        armFullFallback(win);
      }
    } else {
      log('updater: using full NSIS installer fallback');
      armFullFallback(win);
    }
  } catch (err) {
    log('updater: check error: ' + String(err));
    lastError = String(err);
    checking = false;
    broadcast(win, 'updater:error', { message: String(err) });
  }
}