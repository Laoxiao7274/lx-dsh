// make-rounded-icon.mjs — take the lx-code logo icon (build/icon.png, 512x512
// square) and produce a rounded-corner version + a multi-size ICO.
// Pure Node (node:zlib), zero deps. PNG decode (8-bit, filters 0-4) + the
// encoder from make-icon.mjs.
//
//   node scripts/make-rounded-icon.mjs [src.png]
//   (src defaults to build/icon.png; outputs overwrite build/icon.png + icon.ico)
import { deflateSync, inflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = process.argv[2]
  ? (process.argv[2].match(/^[A-Za-z]:[\\\/]/) ? process.argv[2] : join(root, process.argv[2]))
  : join(root, 'build', 'icon-square.png');
const src = readFileSync(srcPath);
console.log('source icon: ' + srcPath + ' (' + src.length + ' bytes)');

// --- PNG decode (8-bit, color types 0/2/3/4/6, filters 0-4, non-interlaced) ---
function decodePng(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a png');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const depth = buf[24];
  const ctype = buf[25];
  if (depth !== 8) throw new Error('only 8-bit png supported');
  if (buf[28] !== 0) throw new Error('interlaced png not supported');
  let pos = 8, idat = null, plte = null, trns = null, n = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') n++;
    if (type === 'IDAT') idat = idat ? Buffer.concat([idat, data]) : Buffer.from(data);
    if (type === 'PLTE') plte = data;
    if (type === 'tRNS') trns = data;
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (n !== 1 || !idat) throw new Error('png parse failed');
  const ch = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 4 ? 2 : 4;
  const raw = inflateSync(idat);
  const stride = w * ch;
  const px = Buffer.alloc(w * h * ch);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    const f = raw[y * (stride + 1)];
    const cur = Buffer.from(row);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = y > 0 ? prev[x] : 0;
      const c = x >= ch && y > 0 ? prev[x - ch] : 0;
      let v = cur[x];
      if (f === 1) v = v + a;
      else if (f === 2) v = v + b;
      else if (f === 3) v = v + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = v + pr;
      }
      cur[x] = v & 0xff;
    }
    px.set(cur, y * stride);
    prev.set(cur);
  }
  const out = Buffer.alloc(w * h * 4);
  const trnsA = (i) => (trns && trns.length > i * ch) ? trns[i * ch] : 255;
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ctype === 6) { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    else if (ctype === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (ctype === 0) { r = g = b = px[i]; }
    else if (ctype === 4) { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    else { const c = plte[i * 3]; r = c; g = plte[i * 3 + 1]; b = plte[i * 3 + 2]; a = trnsA(i); }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return { w, h, rgba: out };
}

// --- PNG encode (from make-icon.mjs) ----------------------------------------
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
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- geometry helpers ---------------------------------------------------------
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = qx > 0 ? qx : 0;
  const ay = qy > 0 ? qy : 0;
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}
// anti-aliased rounded-rect mask over the whole square (3x3 supersampled)
function roundedMask(size, radiusPx) {
  const mask = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      for (const dx of [0, 1, 2]) for (const dy of [0, 1, 2]) {
        const px = x + (dx + 0.5) / 3, py = y + (dy + 0.5) / 3;
        const d = sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, radiusPx);
        a += clamp(0.5 - d, 0, 1);
      }
      mask[y * size + x] = Math.round((a / 9) * 255);
    }
  }
  return mask;
}
// 2x2 box downsample
function down2(src, w) {
  const o = Buffer.alloc((w / 2) * (w / 2) * 4);
  for (let y = 0; y < w / 2; y++) for (let x = 0; x < w / 2; x++) {
    const o4 = (y * (w / 2) + x) * 4;
    for (let c = 0; c < 4; c++) {
      const s00 = ((y * 2) * w + x * 2) * 4 + c;
      const s01 = ((y * 2) * w + x * 2 + 1) * 4 + c;
      const s10 = ((y * 2 + 1) * w + x * 2) * 4 + c;
      const s11 = ((y * 2 + 1) * w + x * 2 + 1) * 4 + c;
      o[o4 + c] = Math.round((src[s00] + src[s01] + src[s10] + src[s11]) / 4);
    }
  }
  return o;
}
function downTo(src, size, target) {
  let cur = src, w = size;
  while (w > target) { cur = down2(cur, w); w /= 2; }
  return cur;
}

// --- ICO with multiple PNG-compressed entries --------------------------------
function encodeIcoMulti(entries) {
  // entries: [{size, png}] — size 0 in header means 256
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: 1 = ICO
  header.writeUInt16LE(entries.length, 4); // count
  const dirEnd = 6 + 16 * entries.length;
  const data = [];
  let off = dirEnd;
  const dir = Buffer.alloc(16 * entries.length);
  entries.forEach((e, i) => {
    dir[i * 16 + 0] = e.size >= 256 ? 0 : e.size;
    dir[i * 16 + 1] = e.size >= 256 ? 0 : e.size;
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(e.png.length, i * 16 + 8);
    dir.writeUInt32LE(off, i * 16 + 12);
    data.push(e.png);
    off += e.png.length;
  });
  return Buffer.concat([header, dir, ...data]);
}

// --- main ---------------------------------------------------------------------
const img = decodePng(src);
const S = Math.min(img.w, img.h);
console.log('decoded ' + img.w + 'x' + img.h + ' (using ' + S + 'x' + S + ' center)');
// center-crop to square if needed
let rgba;
if (img.w === img.h) {
  rgba = img.rgba;
} else {
  rgba = Buffer.alloc(S * S * 4);
  const ox = Math.floor((img.w - S) / 2), oy = Math.floor((img.h - S) / 2);
  for (let y = 0; y < S; y++) rgba.set(img.rgba.subarray(((oy + y) * img.w + ox) * 4, ((oy + y) * img.w + ox + S) * 4), y * S * 4);
}
// rounded-corner radius ~ 21% of side (iOS-ish squircle feel)
const mask = roundedMask(S, S * 0.21);
for (let i = 0; i < S * S; i++) rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * mask[i] / 255);

const png512 = encodePng(S, rgba);
const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });
writeFileSync(join(buildDir, 'icon.png'), png512);
console.log('wrote build/icon.png (' + S + 'x' + S + ' rounded, ' + png512.length + ' bytes)');

// UI asset: same rounded 512 for the titlebar / startup badge (crisp at 16-128px)
const uiAssets = join(root, 'ui', 'src', 'assets');
mkdirSync(uiAssets, { recursive: true });
writeFileSync(join(uiAssets, 'lx-logo.png'), png512);
console.log('wrote ui/src/assets/lx-logo.png');

// ICO: 256 + 64 + 32 + 16 (PNG-compressed entries; only power-of-2 sizes are
// reachable by the 2x2 halving chain from 512)
const icoEntries = [{ size: 256, png: encodePng(256, downTo(rgba, S, 256)) }];
for (const t of [64, 32, 16]) icoEntries.push({ size: t, png: encodePng(t, downTo(rgba, S, t)) });
writeFileSync(join(buildDir, 'icon.ico'), encodeIcoMulti(icoEntries));
console.log('wrote build/icon.ico (' + icoEntries.map(e => e.size).join('/') + ' px)');
