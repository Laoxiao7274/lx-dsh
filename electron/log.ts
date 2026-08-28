// File-first logger: the app must never depend on stdout being drained.
// (Heavy console.log into an unread pipe/file blocks the main event loop on
// Windows and freezes timers — learned the hard way during M1 bring-up.)
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Rotate app.log once it passes this size: a crash-restart loop once produced
// a 543 MB app.log because every retry logged the same failure forever.
const MAX_LOG_BYTES = 16 * 1024 * 1024;

let logPath: string | null = null;
let lastDir: string | null = null;

function ensurePath(): string | null {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const dir = join(appData, 'LX-DSH', 'logs');
  if (dir !== lastDir) {
    try {
      mkdirSync(dir, { recursive: true });
      lastDir = dir;
    } catch {
      return null;
    }
  }
  const p = join(dir, 'app.log');
  if (!logPath || !existsSync(p)) logPath = p;
  return logPath;
}

function writeLine(line: string): void {
  try {
    const p = ensurePath();
    if (!p) return;
    try {
      if (existsSync(p) && statSync(p).size > MAX_LOG_BYTES) {
        renameSync(p, p.replace(/\.log$/, '.old.log'));
      }
    } catch {
      /* rotation is best-effort */
    }
    appendFileSync(p, line + '\n');
  } catch {
    /* logging must never throw */
  }
}

export function log(...args: unknown[]): void {
  const line =
    new Date().toISOString() +
    ' ' +
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  writeLine(line);
  // console only for state-level messages (very low volume): safe for dev terminals
  try {
    console.log('[lx-dsh] ' + line);
  } catch {
    /* ignore */
  }
}

export function logQuiet(...args: unknown[]): void {
  const line =
    new Date().toISOString() +
    ' ' +
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  writeLine(line);
}
