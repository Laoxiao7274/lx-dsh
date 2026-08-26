// probe the shape of a session artifact JSON document
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const dir = 'C:/Users/xzy/.dsh/sessions/--C-Users-xzy-Desktop-my-DSH--';
const sessions = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
const sized = sessions.map((s) => {
  const files = readdirSync(join(dir, s.name));
  const f = files.find((x) => x.endsWith('.zstd'));
  return f ? { name: s.name, size: statSync(join(dir, s.name, f)).size, file: f } : null;
}).filter(Boolean).sort((a, b) => b.size - a.size);
const target = sized[0];
const o = JSON.parse(zstdDecompressSync(readFileSync(join(dir, target.name, target.file))).toString('utf8'));
console.log('top-level keys: ' + Object.keys(o).join(', '));
function describe(v, depth, label) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(v)) {
    console.log(pad + label + ': array(' + v.length + ')');
    if (v.length > 0 && depth < 3) {
      const first = v[0];
      if (first && typeof first === 'object') {
        console.log(pad + '  [0] keys: ' + Object.keys(first).join(', '));
        for (const k of Object.keys(first).slice(0, 6)) describe(first[k], depth + 2, k);
      }
    }
  } else if (v && typeof v === 'object') {
    console.log(pad + label + ': object{' + Object.keys(v).slice(0, 12).join(', ') + '}');
    if (depth < 2) for (const k of Object.keys(v).slice(0, 12)) describe(v[k], depth + 1, k);
  } else {
    const s = String(v);
    console.log(pad + label + ': ' + (typeof v) + (s.length > 60 ? ' (' + s.length + 'ch)' : ' ' + s));
  }
}
describe(o, 0, 'root');
