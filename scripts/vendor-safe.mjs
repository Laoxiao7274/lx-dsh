import { lstatSync, readdirSync, readlinkSync, mkdirSync, copyFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

const src = 'C:/Users/xzy/Desktop/my/DSH/deepseek-harness/apps/cli';
const dst = 'C:/Users/xzy/Desktop/my/DSH/lx-dsh/vendor/dsh';
const visited = new Set();
let fileCount = 0, linkCount = 0;

function copyRecursive(s, d) {
  const realS = realpathSync(s);
  if (visited.has(realS)) return; // cycle detected
  visited.add(realS);
  
  mkdirSync(d, { recursive: true });
  for (const entry of readdirSync(s, { withFileTypes: true })) {
    const srcPath = join(s, entry.name);
    const dstPath = join(d, entry.name);
    
    const st = lstatSync(srcPath);
    if (st.isSymbolicLink()) {
      linkCount++;
      const target = readlinkSync(srcPath);
      const absTarget = resolve(dirname(srcPath), target);
      if (existsSync(absTarget)) {
        // Follow the link and copy the real content
        copyRecursive(absTarget, dstPath);
      }
    } else if (st.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
      fileCount++;
    }
  }
}

console.log('Copying with cycle detection...');
copyRecursive(src, dst);
console.log('Done: ' + fileCount + ' files, ' + linkCount + ' symlinks resolved');
