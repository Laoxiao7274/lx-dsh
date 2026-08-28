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

  // Verify the copy: package count must match, and the wire contract — the
  // file findContractRoot() resolves at every backend boot — must be present.
  const scope = (root) => join(root, 'node_modules', '@deepseek-ai');
  const count = (dir) => (existsSync(dir) ? readdirSync(dir).length : 0);
  const srcCount = count(scope(src));
  const destCount = count(scope(dest));
  if (srcCount !== destCount || srcCount === 0) {
    throw new Error(`afterPack: runtime copy incomplete — ${destCount}/${srcCount} @deepseek-ai packages`);
  }
  const contract = join(dest, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'types', 'fetch', 'client.js');
  if (!existsSync(contract)) {
    throw new Error('afterPack: wire contract dsh-host-apiproxy/lib/types/fetch/client.js missing from the shipped runtime');
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
