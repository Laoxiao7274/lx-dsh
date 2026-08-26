// fully decompress the zstd-framed session log, analyze the seq structure around the gap
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const file = process.argv[2];
const centerLine = parseInt(process.argv[3] || '17460', 10);
const buf = readFileSync(file);
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
// decode every frame, concatenate -> full JSONL
const parts = [];
let fails = 0;
for (let i = 0; i < starts.length; i++) {
  const end = i + 1 < starts.length ? starts[i + 1] : buf.length;
  try {
    parts.push(zstdDecompressSync(buf.subarray(starts[i], end)));
  } catch (e) {
    fails++;
    if (fails < 4) console.log('frame ' + i + ' decode fail: ' + String(e.message).slice(0, 100));
  }
}
console.log('frames decoded: ' + (starts.length - fails) + '/' + starts.length);
const full = Buffer.concat(parts);
console.log('full JSONL bytes: ' + full.length);
const lines = full.toString('utf8').split('\n').filter((l) => l.length > 0);
console.log('lines: ' + lines.length);
// seq of each line near center
function seqOf(lineStr) {
  try {
    const j = JSON.parse(lineStr);
    if (Array.isArray(j.events)) return j.events.map((e) => e.seq).join('.');
    if (typeof j.seq === 'number') return String(j.seq);
    if (typeof j.seq0 === 'number') return 'batch' + j.seq0 + '-' + (j.seq1 ?? '?');
    return '?(' + (j.type || 'no-type') + ')';
  } catch {
    return 'PARSEFAIL:' + lineStr.slice(0, 60);
  }
}
const from = Math.max(0, centerLine - 8);
const to = Math.min(lines.length, centerLine + 12);
console.log('--- lines ' + from + '..' + to + ' (0-based, header=line0) ---');
for (let i = from; i < to; i++) {
  console.log(i + '  [' + seqOf(lines[i]) + ']  ' + lines[i].slice(0, 110));
}
// global structure: find ALL lines whose seq goes backwards (dup/rewind points)
console.log('--- backwards seq transitions (global) ---');
let lastSeq = -1;
let trans = 0;
for (let i = 1; i < lines.length && trans < 20; i++) {
  let j;
  try { j = JSON.parse(lines[i]); } catch { continue; }
  let sq;
  if (Array.isArray(j.events)) sq = j.events.map((e) => e.seq);
  else if (typeof j.seq === 'number') sq = [j.seq];
  else if (typeof j.seq0 === 'number') { trans++; if (trans < 20) console.log(i + ': batch record seq0=' + j.seq0 + ' (type=' + j.type + ')'); lastSeq = Math.max(lastSeq, j.seq0); continue; }
  else continue;
  for (const s of sq) {
    if (s < lastSeq) { trans++; console.log(i + ': SEQ BACKWARDS ' + lastSeq + ' -> ' + s + ' (type=' + (Array.isArray(j.events) ? j.events[0].type : j.type) + ')'); if (trans >= 20) break; }
    lastSeq = Math.max(lastSeq, s);
  }
  if (trans >= 20) break;
}
if (trans === 0) console.log('(none found in scan)');
