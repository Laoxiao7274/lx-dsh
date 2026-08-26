import { lstatSync, readdirSync, readlinkSync, rmSync, cpSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

function resolveSymlinks(dir) {
  let count = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      try {
        const st = lstatSync(full);
        if (st.isSymbolicLink()) {
          const target = readlinkSync(full);
          const absTarget = resolve(dirname(full), target);
          if (existsSync(absTarget)) {
            rmSync(full, { force: true });
            cpSync(absTarget, full, { recursive: true, force: true, dereference: true });
            count++;
            // Don't recurse into the resolved directory — it's now real files
            // but might have its own symlinks
            try {
              if (statSync(full).isDirectory()) walk(full);
            } catch (e) {}
          }
        } else if (st.isDirectory()) {
          walk(full);
        }
      } catch (e) {
        // skip
      }
    }
  };
  walk(dir);
  console.log('Resolved ' + count + ' symlinks');
}

resolveSymlinks('C:/Users/xzy/Desktop/my/DSH/lx-dsh/vendor/dsh/node_modules');
