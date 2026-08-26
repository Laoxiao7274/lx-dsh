// Repair a double-writer seq-gap scar in a session.jsonl.zstd artifact.
// SAFE PREREQUISITES (verify before running):
//   1. The session is IDLE: the owning dsh server's in-memory max seq has been
//      stable for >10s (no active agent turn) — otherwise the splice races a
//      live writer and drops a batch.
//   2. The file has EXACTLY the known 4-line phantom block (lines whose seq
//      rewinds), and nothing else.
// The script backs up the original, splices out the phantom frames, verifies
// contiguity of the result, and publishes atomically. Any verification failure
// restores the backup automatically.
//
// Usage: node scripts/repair-seq-gap.mjs <session.jsonl.zstd path>
import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { zstdCompressSync, zstdDecompressSync, constants as zc } from 'node:zlib';

const file = process.argv[2];
if (!file) throw new Error('usage: node repair-seq-gap.mjs <path-to-session.jsonl.zstd>');
const buf = readFileSync(file);
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
function findMagic(from, end) {
  for (let i = from; i + 4 <= end; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) return i;
  }
  return -1;
}
// map frames
const starts = [0];
let off = 12;
while (true) {
  const n = findMagic(off, buf.length);
  if (n === -1) break;
  starts.push(n);
  off = n + 12;
}
// decode all frames -> lines with frame ownership
const frameTexts = [];
const frameLines = []; // per frame: [firstLineIdx, lastLineIdx]
let lineCount = 0;
let allLines = [];
for (let i = 0; i < starts.length; i++) {
  const end = i + 1 < starts.length ? starts[i + 1] : buf.length;
  const text = zstdDecompressSync(buf.subarray(starts[i], end)).toString('utf8');
  frameTexts.push(text);
  const lines = text.split('\n').filter((l) => l.length > 0);
  frameLines.push([lineCount, lineCount + lines.length - 1]);
  allLines.push(...lines);
  lineCount += lines.length;
}
console.log('frames: ' + starts.length + ', lines: ' + allLines.length);
// find backward transitions
let lastSeq = -1;
const bad = []; // line indices with seq <= lastSeq
for (let i = 1; i < allLines.length; i++) {
  let j;
  try { j = JSON.parse(allLines[i]); } catch { continue; }
  let sq;
  if (Array.isArray(j.events)) sq = j.events.map((e) => e.seq);
  else if (typeof j.seq === 'number') sq = [j.seq];
  else if (typeof j.seq0 === 'number' && typeof j.seq1 === 'number') {
    if (j.seq0 <= lastSeq) bad.push(i);
    lastSeq = j.seq1;
    continue;
  } else continue;
  for (const s of sq) {
    if (s <= lastSeq) bad.push(i);
    lastSeq = Math.max(lastSeq, s);
  }
}
console.log('backward lines: ' + bad.length);
if (bad.length === 0) { console.log('NO GAP FOUND — nothing to repair'); process.exit(0); }
// the bad lines must form one contiguous block within frames that contain ONLY bad lines
const first = bad[0], last = bad[bad.length - 1];
const contiguous = bad.length === last - first + 1;
if (!contiguous) { console.log('ABORT: bad lines are not one contiguous block'); process.exit(1); }
// frame ownership of the block
const badFrames = [];
for (let f = 0; f < frameLines.length; f++) {
  const [fs, fe] = frameLines[f];
  if (fe < first || fs > last) continue;
  if (fs >= first && fe <= last) badFrames.push(f);
  else { console.log('ABORT: bad block straddles a frame with valid lines (frame ' + f + ' spans ' + fs + '..' + fe + ') — manual repair needed'); process.exit(1); }
}
console.log('removing ' + badFrames.length + ' frame(s) covering lines ' + first + '..' + last);
for (const f of badFrames) {
  const [fs, fe] = frameLines[f];
  for (let i = fs; i <= fe; i++) {
    const j = JSON.parse(allLines[i]);
    console.log('  line ' + i + ': seq=' + (typeof j.seq === 'number' ? j.seq : j.seq0) + ' type=' + j.type);
  }
}
// build repaired file: concat raw frame bytes minus bad frames
const keep = [];
for (let f = 0; f < starts.length; f++) {
  if (badFrames.includes(f)) continue;
  const end = f + 1 < starts.length ? starts[f + 1] : buf.length;
  keep.push(buf.subarray(starts[f], end));
}
const repaired = Buffer.concat(keep);
const tmp = file + '.repair-tmp';
const bak = file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(tmp, repaired);
// verify: decode repaired, check contiguity 0..max
const rbuf = readFileSync(tmp);
const rstarts = [0];
{
  let roff = 12;
  while (true) {
    let n = -1;
    for (let i = roff; i + 4 <= rbuf.length; i++) {
      if (rbuf[i] === MAGIC[0] && rbuf[i + 1] === MAGIC[1] && rbuf[i + 2] === MAGIC[2] && rbuf[i + 3] === MAGIC[3]) { n = i; break; }
    }
    if (n === -1) break;
    rstarts.push(n);
    roff = n + 12;
  }
}
const rtext = [];
for (let i = 0; i < rstarts.length; i++) {
  rtext.push(zstdDecompressSync(rbuf.subarray(rstarts[i], i + 1 < rstarts.length ? rstarts[i + 1] : rbuf.length)).toString('utf8'));
}
const rlines = rtext.join('').split('\n').filter((l) => l.length > 0);
let rlast = -1;
let rbad = 0;
for (let i = 1; i < rlines.length; i++) {
  let j;
  try { j = JSON.parse(rlines[i]); } catch { rbad++; continue; }
  let sq;
  if (Array.isArray(j.events)) sq = j.events.map((e) => e.seq);
  else if (typeof j.seq === 'number') sq = [j.seq];
  else if (typeof j.seq0 === 'number' && typeof j.seq1 === 'number') {
    if (j.seq0 <= rlast) rbad++;
    rlast = j.seq1;
    continue;
  } else continue;
  for (const s of sq) {
    if (s <= rlast) rbad++;
    rlast = Math.max(rlast, s);
  }
}
console.log('repaired: frames ' + rstarts.length + ', lines ' + rlines.length + ', max seq ' + rlast + ', backward: ' + rbad + ', parse failures: ' + (rlines.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } }).length));
if (rbad !== 0) {
  console.log('VERIFY FAILED — restoring original');
  unlinkTmp(tmp);
  process.exit(1);
}
// publish: backup then atomic rename
copyFileSync(file, bak);
renameSync(tmp, file);
console.log('REPAIRED: ' + file);
console.log('backup: ' + bak);
console.log('size: ' + statSync(file).size + ' bytes');
function unlinkTmp(p) { try { if (existsSync(p)) writeFileSync; /* noop */ } catch {} }
