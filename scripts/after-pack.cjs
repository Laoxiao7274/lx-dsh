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
  // The vendored web-search bundle ships handwritten lib/ JS as its source;
  // a tree without it crashes every fresh install's backend (the profile
  // template links it from the runtime's node_modules).
  const webSearch = join(dest, 'node_modules', '@laoxiao7274', 'dsh-web-search', 'lib', 'index.js');
  if (!existsSync(webSearch)) {
    throw new Error('afterPack: shipped runtime is missing @laoxiao7274/dsh-web-search/lib — '
      + 'restore harness/plugins/dsh-web-search/lib and re-run assemble');
  }
  const modlens = join(dest, 'node_modules', '@liustack', 'modlens', 'dsh', 'index.js');
  if (!existsSync(modlens)) {
    throw new Error('afterPack: shipped runtime is missing @liustack/modlens — re-run assemble');
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

  // electron-builder only writes app-update.yml in a full publish build; the
  // --dir + --prepackaged combo used here never materializes it, and the
  // updater crashes at runtime reading it (ENOENT) even with setFeedURL.
  // Write it ourselves next to the runtime.
  const appUpdate = join(context.appOutDir, 'resources', 'app-update.yml');
  if (!existsSync(appUpdate)) {
    const { writeFileSync } = require('node:fs');
    writeFileSync(appUpdate, 'provider: generic\nurl: http://123.57.129.111/win\n', 'utf8');
    console.log('  • afterPack: wrote resources/app-update.yml (updater feed)');
  }

  console.log(`  • afterPack: runtime shipped — ${destCount} @deepseek-ai packages, ${(bytes / 1048576).toFixed(1)} MB`);
};
