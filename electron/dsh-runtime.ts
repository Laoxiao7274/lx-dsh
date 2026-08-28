// dsh-runtime.ts — resolve (and on first launch, materialize) the dsh runtime
// the backend will spawn.
//
// The runtime is built ENTIRELY from the deepseek-harness source checkout:
// `npm run assemble` deploys the CLI workspace closure into dist/dsh and zips
// it to dist/dsh.zip. There is no npm-release vendor copy anymore.
//
// Dev (app.isPackaged === false): run the workspace build directly —
// <repo>/../deepseek-harness/apps/cli (its node_modules links the workspace
// packages whose lib/ the harness build emitted). No zip, no extraction.
//
// Packaged: the NSIS bundle ships resources/dsh.zip. On first launch we
// extract it to %APPDATA%/LX-DSH/dsh and spawn from there. If the zip's mtime
// is newer than our extraction marker (i.e. an app update brought a new dsh),
// we re-extract.
import { app } from 'electron';
import { existsSync, execFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './log.js';

const MARKER_NAME = '.extracted-zip-mtime';

/**
 * Return the dsh root to spawn. Blocks (execFileSync tar) only on first
 * launch or after a dsh-bumping app update — ~30-60s, one time.
 *
 * On `onExtracting` the caller should surface progress to the UI (the startup
 * view shows 'starting' meanwhile).
 */
export function ensureDshRuntime(onExtracting?: () => void): string {
  // Explicit override wins (also the escape hatch for alternate checkouts).
  if (process.env.LX_DSH_ROOT) {
    if (existsSync(join(process.env.LX_DSH_ROOT, 'lib', 'bin.js'))) return process.env.LX_DSH_ROOT;
    log('dsh-runtime: LX_DSH_ROOT set but lib/bin.js missing — falling through');
  }

  // Dev / unpackaged: run the deepseek-harness workspace build directly —
  // every @deepseek-ai package resolves through the workspace to this
  // checkout's built lib/, so dev always runs the current source.
  if (!app.isPackaged) {
    // __dirname = <lx-dsh>/dist-electron → up two levels is the DSH workspace root.
    const workspace = join(__dirname, '..', '..', 'deepseek-harness', 'apps', 'cli');
    if (existsSync(join(workspace, 'lib', 'bin.js'))) return workspace;
    log('dsh-runtime: workspace apps/cli/lib/bin.js missing — run `pnpm run build` in deepseek-harness (or npm run assemble)');
  }

  // Packaged: extract resources/dsh.zip → %APPDATA%/LX-DSH/dsh.
  const zip = join(process.resourcesPath, 'dsh.zip');
  if (!existsSync(zip)) {
    throw new Error('resources/dsh.zip missing from install — run `npm run assemble` before electron-builder');
  }
  const target = join(app.getPath('userData'), 'dsh');
  const marker = join(target, MARKER_NAME);
  const zipMtime = String(statSync(zip).mtimeMs);

  if (existsSync(join(target, 'lib', 'bin.js'))) {
    try {
      if (readFileSync(marker, 'utf8') === zipMtime) {
        return target; // already extracted from this exact zip
      }
      log('dsh-runtime: dsh.zip newer than extracted copy — re-extracting');
    } catch {
      log('dsh-runtime: extraction marker unreadable — re-extracting');
    }
  }

  onExtracting?.();
  log('dsh-runtime: extracting dsh.zip (' + (statSync(zip).size / 1048576).toFixed(1) + ' MB) to ' + target);
  const t0 = Date.now();
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  mkdirSync(target, { recursive: true });
  // bsdtar (Windows 10 1803+) extracts standard zips natively and faster than
  // PowerShell Expand-Archive. 7za-produced store-mode zips are standard zips.
  execFileSync('tar.exe', ['-xf', zip, '-C', target], { stdio: 'ignore', windowsHide: true });
  writeFileSync(marker, zipMtime);
  if (!existsSync(join(target, 'lib', 'bin.js'))) {
    throw new Error('dsh extraction incomplete: lib/bin.js missing under ' + target);
  }
  log('dsh-runtime: extraction complete in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  return target;
}
