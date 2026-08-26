// count complete zstd frames in a session artifact; detect truncated tail
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const file = process.argv[2];
const buf = readFileSync(file);
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
function findMagic(from) {
  for (let i = from; i + 4 <= buf.length; i++) {
    let ok = true;
    for (let j = 0; j < 4; j++) {
      if (buf[i + j] !== MAGIC[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}
let offset = 0;
let n = 0;
let totalDecoded = 0;
let bad = false;
while (offset < buf.length) {
  const start = findMagic(offset);
  if (start === -1) {
    console.log('no frame magic from ' + offset + ' to end (' + (buf.length - offset) + ' bytes of tail)');
    bad = true;
    break;
  }
  if (start > offset) console.log('note: ' + (start - offset) + ' bytes between frames (possibly a false magic inside frame data)');
  try {
    const dec = zstdDecompressSync(buf.subarray(start));
    totalDecoded += dec.length;
    const head = dec.toString('utf8').slice(0, 70).replace(/\n/g, ' ');
    console.log('frame ' + (n + 1) + ' @' + start + ' decodes OK (' + dec.length + ' bytes): ' + head);
    n += 1;
    const next = findMagic(start + 12);
    if (next === -1) {
      console.log('no further magic after frame ' + n + ': last frame spans ' + start + ' .. ' + buf.length + ' (size ' + (buf.length - start) + ' bytes)');
      break;
    }
    offset = next;
    if (n > 400) {
      console.log('(stopping enumeration at 400 frames)');
      break;
    }
  } catch (e) {
    console.log('frame ' + (n + 1) + ' @' + start + ' FAILED: ' + String(e.message).slice(0, 120));
    bad = true;
    break;
  }
}
console.log('---');
console.log('frames enumerated: ' + n + ', decoded bytes: ' + totalDecoded + ', file bytes: ' + buf.length + (bad ? '  [PROBLEM DETECTED]' : '  [last frame reached file end]'));
