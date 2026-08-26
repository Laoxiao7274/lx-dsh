// Generate build/icon.png (256 RGBA) and build/icon.ico (PNG-compressed 256 entry).
// Pure Node (node:zlib), zero dependencies.
// Design: rounded square, indigo -> cyan diagonal gradient, white bolt (harness).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 256;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

// rounded-rect signed distance
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = qx > 0 ? qx : 0;
  const ay = qy > 0 ? qy : 0;
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}

// ray-casting point-in-polygon
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const hit = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

const BOLT = [
  [0.62, 0.05], [0.18, 0.56], [0.43, 0.56], [0.33, 0.95], [0.82, 0.40], [0.53, 0.40],
];
// scaled to pixel space (BOLT is normalized 0..1)
const BOLT_PX = [];
for (let i = 0; i < BOLT.length; i++) BOLT_PX.push([BOLT[i][0] * S, BOLT[i][1] * S]);
const C1 = [79, 70, 229];  // indigo
const C2 = [6, 182, 212];  // cyan
const WHITE = [255, 255, 255];

function pixel(x, y) {
  let bgA = 0;
  let boltHits = 0;
  const offs = [0, 1, 2];
  for (const dx of offs) {
    for (const dy of offs) {
      const px = x + (dx + 0.5) / 3;
      const py = y + (dy + 0.5) / 3;
      const d = sdRoundRect(px, py, S / 2, S / 2, S / 2, S / 2, S * 0.21);
      bgA += clamp(0.5 - d, 0, 1);
      if (inPoly(px, py, BOLT_PX)) boltHits += 1;
    }
  }
  bgA /= 9;
  const t = (x + y) / (2 * S);
  const boltA = boltHits / 9;
  let r = lerp(lerp(C1[0], C2[0], t), WHITE[0], boltA);
  let g = lerp(lerp(C1[1], C2[1], t), WHITE[1], boltA);
  let b = lerp(lerp(C1[2], C2[2], t), WHITE[2], boltA);
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(bgA * 255)];
}

// --- PNG encoder -----------------------------------------------------------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- ICO (single 256px PNG entry, Vista+) ----------------------------------
function encodeIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 (0 means 256)
  entry[1] = 0; // height 256
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, pngBuf]);
}

// --- main -------------------------------------------------------------------
const rgba = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const p = pixel(x, y);
    const i = (y * S + x) * 4;
    rgba[i] = p[0];
    rgba[i + 1] = p[1];
    rgba[i + 2] = p[2];
    rgba[i + 3] = p[3];
  }
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });
const png = encodePng(S, rgba);
writeFileSync(join(buildDir, 'icon.png'), png);
writeFileSync(join(buildDir, 'icon.ico'), encodeIco(png));
console.log('wrote icon.png (' + png.length + ' bytes) + icon.ico in ' + buildDir);
