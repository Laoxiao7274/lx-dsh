// scripts/dev.mjs — LX-DSH dev mode.
//   1) Vite dev server for ui/  (React HMR, served at http://localhost:5273)
//   2) esbuild watch for electron/main.ts + preload/index.ts -> dist-electron/*.cjs
//   3) launch Electron with LX_DSH_DEV_URL=<vite url>; restart it when main/preload rebuild
//
// Production path is untouched: loadShell() only uses the dev URL when LX_DSH_DEV_URL
// is set, otherwise falls back to loadFile(ui/dist/index.html) exactly as before.
//
// The Vite port is fixed in ui/vite.config.ts (server.port = 5273). We read it with a
// short TCP poll instead of parsing Vite's stdout, so Vite can run with stdio:'inherit'
// — no piped stdio, which avoids EPERM in environments that forbid named pipes.
//
// Usage:  npm run dev    (from the lx-dsh root)
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const electronCli = join(root, 'node_modules', 'electron', 'cli.js');
const viteBin = join(root, 'ui', 'node_modules', 'vite', 'bin', 'vite.js');
const isWin = process.platform === 'win32';

// Must match server.port in ui/vite.config.ts.
const DEV_PORT = 5273;
const devUrl = 'http://localhost:' + DEV_PORT;

if (!existsSync(electronCli)) {
  console.error('[dev] electron not installed — run: node node_modules/electron/install.js');
  process.exit(1);
}
if (!existsSync(viteBin)) {
  console.error('[dev] ui vite not installed — run: npm install  (inside ui/)');
  process.exit(1);
}

const children = [];
let exiting = false;

function killTree(proc) {
  if (!proc || !proc.pid) return;
  if (isWin) {
    try { spawn('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore' }); } catch (e) { /* ignore */ }
  } else {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) { /* ignore */ }
    try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
  }
}

function cleanup(code) {
  if (exiting) return;
  exiting = true;
  console.log('\n[dev] shutting down…');
  killTree(electronProc);
  try { vite && vite.kill('SIGTERM'); } catch (e) { /* ignore */ }
  if (ctx) { ctx.dispose().catch(() => {}); }
  process.exit(typeof code === 'number' ? code : 0);
}
process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

// ---- 1) Vite dev server (HMR for the React UI) -----------------------------
// stdio:'inherit' streams Vite output straight to the terminal. Readiness is
// detected by polling DEV_PORT, not by parsing stdout (no piped stdio needed).
const vite = spawn(process.execPath, [viteBin], { cwd: join(root, 'ui'), stdio: 'inherit' });
children.push(vite);
vite.on('exit', (code) => { console.log('[dev] vite exited ' + code); if (!exiting) cleanup(1); });

function waitForVite(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = createConnection({ port, host: 'localhost' }, () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        if (Date.now() > deadline) reject(new Error('vite did not start on port ' + port + ' within ' + timeoutMs + 'ms'));
        else setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

// ---- 2) esbuild watch for main + preload -> dist-electron ------------------
const common = {
  bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  outdir: join(root, 'dist-electron'), outExtension: { '.js': '.cjs' },
  external: ['electron'], sourcemap: true, logLevel: 'warning',
};
// One-shot build before starting watch: esbuild's context.watch() fires onEnd
// asynchronously, and the first build can race with vite url detection —
// pre-building guarantees dist-electron/main.cjs is current before electron launches.
console.log('[dev] initial esbuild build (main + preload)...');
await esbuild.build({
  ...common,
  // Named entries -> flat dist-electron/main.cjs + index.cjs (what Electron loads).
  entryPoints: { main: join(root, 'electron', 'main.ts'), index: join(root, 'preload', 'index.ts') },
});
console.log('[dev] initial build done');
let ctx;
let buildReady = true;  // pre-build above already produced dist-electron
let firstLaunched = false;
let launching = false;
async function startWatch() {
  ctx = await esbuild.context({
    ...common,
    // Named entries -> flat dist-electron/main.cjs + index.cjs (what Electron loads).
    entryPoints: { main: join(root, 'electron', 'main.ts'), index: join(root, 'preload', 'index.ts') },
    plugins: [{
      name: 'restart-electron',
      setup(b) {
        b.onEnd((r) => {
          if (r.errors.length) { console.log('[dev] esbuild build had ' + r.errors.length + ' error(s)'); return; }
          if (!firstLaunched) { buildReady = true; void maybeLaunch(); }
          else scheduleRestart();
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[dev] esbuild watching electron/main.ts + preload/index.ts');
}
startWatch().catch((e) => { console.error('[dev] esbuild context failed:', e); cleanup(1); });

// ---- 3) Electron: launch once both vite is up + first build is ready; ----
//           restart on subsequent main/preload rebuilds --------------------
let electronProc = null;
let restartTimer = null;

// Launch once the initial esbuild build is done AND Vite is accepting
// connections on DEV_PORT. Guarded so it only fires once.
async function maybeLaunch() {
  if (firstLaunched || launching || !buildReady) return;
  launching = true;
  try {
    await waitForVite(DEV_PORT, 30000);
    console.log('[dev] vite ready at ' + devUrl);
  } catch (e) {
    console.error('[dev] ' + e.message);
    cleanup(1);
    return;
  }
  firstLaunched = true;
  launchElectron();
}
void maybeLaunch();

function launchElectron() {
  console.log('[dev] launching electron with LX_DSH_DEV_URL=' + devUrl);
  if (electronProc && !electronProc.killed) {
    console.log('[dev] restarting electron…');
    killTree(electronProc);
  }
  const env = { ...process.env, LX_DSH_DEV_URL: devUrl };
  electronProc = spawn(process.execPath, [electronCli, '.'], { cwd: root, env, stdio: 'inherit', detached: true });
  electronProc.on('exit', (code, signal) => {
    console.log('[dev] electron exited (code=' + code + ' signal=' + signal + ')');
    electronProc = null;
    if (!exiting && signal !== 'SIGTERM' && code !== 0) {
      // unexpected — leave it dead; a rebuild or manual restart will relaunch
      console.log('[dev] electron crashed; fix the error and save to rebuild, or Ctrl+C to stop.');
    }
  });
}
function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => { restartTimer = null; launchElectron(); }, 300);
}

console.log('[dev] LX-DSH dev mode starting…  (Ctrl+C to stop)');
