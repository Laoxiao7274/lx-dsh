// LX-DSH local settings (userData/settings.json): the remote-backend
// connection and the LAN bind option. Everything is user-editable state that
// must survive restarts but never leaves this machine.
import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './log.js';

/** User-editable LX-DSH settings persisted under userData. */
export interface LxSettings {
  /** Remote-backend connection: the authenticated root URL (token included). null = run the local backend. */
  remote: { url: string } | null;
  /** Bind the local backend to all interfaces (0.0.0.0) so other devices can connect. */
  lanBind: boolean;
}

const DEFAULTS: LxSettings = { remote: null, lanBind: false };

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

/** Read the settings, filling defaults for absent fields (never throws). */
export function readSettings(): LxSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<LxSettings>;
    const remote = parsed.remote;
    return {
      remote: remote !== null && remote !== undefined && typeof (remote as { url?: unknown }).url === 'string'
        ? { url: (remote as { url: string }).url }
        : null,
      lanBind: parsed.lanBind === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Atomically persist the settings (best-effort; failures are logged only). */
export function writeSettings(next: LxSettings): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    log('settings write failed: ' + String(err));
  }
}

/**
 * Normalize a user-supplied remote address + access key into the authenticated
 * root URL the backend serves (mirrors the harness bookmark URL shape).
 * @returns the URL, or an error message when the input is unusable.
 */
export function composeRemoteUrl(address: string, token: string): { url: string } | { error: string } {
  let trimmed = address.trim();
  if (trimmed === '') return { error: '地址不能为空' };
  if (!/^https?:\/\//i.test(trimmed)) trimmed = `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: '地址无法解析' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: '仅支持 http/https' };
  // Drop any path/query the user pasted; keep host[:port] only.
  const root = `${parsed.protocol}//${parsed.host}/`;
  const key = token.trim();
  return { url: key === '' ? root : `${root}?token=${encodeURIComponent(key)}` };
}
