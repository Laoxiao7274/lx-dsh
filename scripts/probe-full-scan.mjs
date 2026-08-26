// full-file backward-transition scan with proper batch handling + tail report
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const buf = readFileSync(process.argv[2]);
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
function findMagic(from) {
  for (let i = from; i + 4 <= buf.length; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) return i;
  }
  return -1;
}
const starts = [0];
let off = 12;
while (true) {
  const n = findMagic(off);
  if (n === -1) break;
  starts.push(n);
  off = n + 12;
}
const parts = [];
for (let i = 0; i < starts.length; i++) {
  parts.push(zstdDecompressSync(buf.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : buf.length)));
}
const lines = Buffer.concat(parts).toString('utf8').split('\n').filter((l) => l.length > 0);
let lastSeq = -1;
let transitions = [];
for (let i = 1; i < lines.length; i++) {
  let j;
  try { j = JSON.parse(lines[i]); } catch { transitions.push(i + ': PARSEFAIL'); continue; }
  let range;
  if (Array.isArray(j.events)) range = j.events.map((e) => e.seq);
  else if (typeof j.seq === 'number') range = [j.seq];
  else if (typeof j.seq0 === 'number' && typeof j.seq1 === 'number') {
    // batch: check continuity of the batch range against lastSeq
    if (j.seq0 <= lastSeq) transitions.push(i + ': BATCH BACKWARDS lastSeq=' + lastSeq + ' seq0=' + j.seq0 + ' seq1=' + j.seq1);
    lastSeq = j.seq1;
    continue;
  } else continue;
  for (const s of range) {
    if (s <= lastSeq) transitions.push(i + ': BACKWARDS lastSeq=' + lastSeq + ' got=' + s + ' type=' + (Array.isArray(j.events) ? j.events[0].type : j.type));
    lastSeq = Math.max(lastSeq, s);
  }
}
console.log('total lines: ' + lines.length);
console.log('file max seq: ' + lastSeq);
console.log('backward transitions: ' + transitions.length);
for (const t of transitions.slice(0, 30)) console.log('  ' + t);
// tail lines
console.log('--- last 5 lines ---');
for (let i = lines.length - 5; i < lines.length; i++) {
  let j;
  try { j = JSON.parse(lines[i]); } catch { console.log(i + ': PARSEFAIL ' + lines[i].slice(0, 60)); continue; }
  const s = typeof j.seq === 'number' ? j.seq : (Array.isArray(j.events) ? j.events.map((e) => e.seq).join('.') : (j.seq0 ?? '?'));
  console.log(i + '  [' + s + '] ' + (j.type || 'events') + ' ' + lines[i].slice(0, 90));
}
