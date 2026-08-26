// enumerate every zstd frame of a session artifact; report seq gaps
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const file = process.argv[2];
const buf = readFileSync(file);
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
function findMagic(from) {
  for (let i = from; i + 4 <= buf.length; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) return i;
  }
  return -1;
}
// collect frame starts
const starts = [0];
let off = 12;
while (true) {
  const n = findMagic(off);
  if (n === -1) break;
  starts.push(n);
  off = n + 12;
}
console.log('frames: ' + starts.length + ', file bytes: ' + buf.length);
let expected = 0;
let gaps = [];
let lastOkSeq = -1;
let maxSeq = -1;
let dup = 0;
let tailBad = false;
for (let i = 1; i < starts.length; i++) {
  let decoded;
  try {
    decoded = zstdDecompressSync(buf.subarray(starts[i], starts[i + 1] ?? buf.length));
  } catch (e) {
    tailBad = true;
    if (gaps.length < 12) gaps.push('frame ' + i + ' @' + starts[i] + ' DECODE FAIL: ' + String(e.message).slice(0, 80));
    continue;
  }
  let rec;
  try {
    rec = JSON.parse(decoded.toString('utf8'));
  } catch (e) {
    if (gaps.length < 12) gaps.push('frame ' + i + ' @' + starts[i] + ' JSON FAIL (' + decoded.length + ' bytes)');
    continue;
  }
  const evs = Array.isArray(rec.events) ? rec.events : [rec];
  for (const ev of evs) {
    const sq = typeof ev.seq === 'number' ? ev.seq : (typeof ev.seq0 === 'number' ? ev.seq0 : null);
    if (sq === null) continue;
    maxSeq = Math.max(maxSeq, sq);
    if (sq === expected) {
      expected += 1;
      lastOkSeq = sq;
    } else if (sq < expected) {
      dup += 1;
    } else {
      const hasTurnEnd = evs.some((x) => x.type === 'turn/end');
      gaps.push('GAP at frame ' + i + ' (byte ' + starts[i] + '): expected ' + expected + ' got ' + sq + (hasTurnEnd ? ' [record has turn/end]' : '') + ' type=' + ev.type);
      if (gaps.length >= 12) { gaps.push('...(more, truncated)'); break; }
    }
  }
  if (gaps.length >= 12) break;
}
console.log('contiguous prefix ends at seq ' + (expected - 1) + '; dup events seen: ' + dup + '; max seq: ' + maxSeq);
console.log('--- gaps/issues ---');
console.log(gaps.join('\n') || '(none)');
if (tailBad) console.log('NOTE: decode failure in tail region (possible torn last frame)');
