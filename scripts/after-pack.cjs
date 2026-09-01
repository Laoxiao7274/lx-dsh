// afterPack — copy the dsh runtime into the packaged app verbatim.
//
// electron-builder's extraResources file matcher silently DROPS the
// node_modules subdirectory (its dependency-pruning logic assumes asar
// bundling owns node_modules), which shipped a runtime without a single
// workspace package (0.3.2 first build). Copying it ourselves here is
// byte-exact and verified before the build is allowed to finish.
const { cpSync, existsSync, readdirSync, rmSync, statSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const src = join(context.packager.projectDir, 'dist', 'dsh');
  const dest = join(context.appOutDir, 'resources', 'dsh');
  if (!existsSync(join(src, 'lib', 'bin.js'))) {
    throw new Error(`afterPack: ${src} is missing lib/bin.js — run \`pnpm run assemble\` first`);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true, dereference: true });

  // Verify the copy: package count must match, and the runtime must be the
  // post-merge (0.1.2+) tree — the retired apiproxy package must be absent
  // and the API gateway (the wire stack the backend now resolves) present.
  const scope = (root) => join(root, 'node_modules', '@deepseek-ai');
  const count = (dir) => (existsSync(dir) ? readdirSync(dir).length : 0);
  const srcCount = count(scope(src));
  const destCount = count(scope(dest));
  if (srcCount !== destCount || srcCount === 0) {
    throw new Error(`afterPack: runtime copy incomplete — ${destCount}/${srcCount} @deepseek-ai packages`);
  }
  const legacy = join(dest, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy');
  if (existsSync(legacy)) {
    throw new Error('afterPack: shipped runtime still carries dsh-host-apiproxy — assemble from the merged harness');
  }
  const pnpmStore = join(dest, 'node_modules', '.pnpm');
  if (!existsSync(pnpmStore)) {
    throw new Error('afterPack: shipped runtime lost its pnpm package layout — assemble from the merged harness');
  }
  let bytes = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else bytes += statSync(p).size;
    }
  };
  walk(dest);
  console.log(`  • afterPack: runtime shipped — ${destCount} @deepseek-ai packages, ${(bytes / 1048576).toFixed(1)} MB`);
};
