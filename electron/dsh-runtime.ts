// dsh-runtime.ts — resolve the dsh runtime root the backend will spawn.
//
// The harness is PART of this app: `npm run assemble` deploys the CLI
// workspace closure into dist/dsh and electron-builder ships it verbatim as
// resources/dsh/. There is NO zip, NO first-launch extraction, NO %APPDATA%
// copy, and NO fallback to a global npm install — the runtime the app runs
// is byte-for-byte the one built into this exact installer, and an app update
// replaces it wholesale with the NSIS install.
//
// (The 0.3.0/0.3.1 zip-and-extract layer — marker files, tar invocations,
// partial-extraction recovery, silent global-npm fallback — was inherited
// from the retired vendor flow and caused every runtime incident in that
// release; it is gone on purpose.)
//
// Dev (app.isPackaged === false): run the workspace build directly —
// <repo>/harness/apps/cli, whose node_modules links the workspace
// packages to this checkout's built lib/.
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from './log.js';

export function ensureDshRuntime(): string {
  // Explicit override wins (also the escape hatch for alternate checkouts).
  if (process.env.LX_DSH_ROOT) {
    if (existsSync(join(process.env.LX_DSH_ROOT, 'lib', 'bin.js'))) return process.env.LX_DSH_ROOT;
    log('dsh-runtime: LX_DSH_ROOT set but lib/bin.js missing — falling through');
  }

  // Dev / unpackaged: run the harness workspace build directly —
  // every @deepseek-ai package resolves through the workspace to this
  // checkout's built lib/, so dev always runs the current source.
  if (!app.isPackaged) {
    // __dirname = <lx-dsh>/dist-electron → up ONE level is the repo root,
    // where the harness subtree lives after the single-repo merge.
    const workspace = join(__dirname, '..', 'harness', 'apps', 'cli');
    if (existsSync(join(workspace, 'lib', 'bin.js'))) return workspace;
    log('dsh-runtime: workspace apps/cli/lib/bin.js missing — run `pnpm run build` in harness/ (or npm run assemble)');
  }

  // Packaged: the runtime lives beside the app, already materialized.
  const root = join(process.resourcesPath, 'dsh');
  if (!existsSync(join(root, 'lib', 'bin.js'))) {
    throw new Error('resources/dsh runtime incomplete (lib/bin.js missing) — rebuild the installer with `pnpm run dist:full`');
  }
  return root;
}
