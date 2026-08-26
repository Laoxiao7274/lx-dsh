import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
const buf = readFileSync(process.argv[2]);
// first frame: decode from 0 (first frame only)
const first = zstdDecompressSync(buf.subarray(0, Math.min(4096, buf.length)));
console.log('header frame decoded: ' + first.length + ' bytes');
console.log(first.toString('utf8'));
