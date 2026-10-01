#!/usr/bin/env node
// Generates build/icon.ico (the app, installer and shortcut icon): a bar chart on a rounded
// square, drawn in code so the icon has a reproducible source. Run: node scripts/make-icon.mjs
//
// An .ico is a small directory of images; each entry here is a PNG (supported since Vista).

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const BACKGROUND = [3, 105, 161]; // sky-700, the app's accent colour
const BARS = [
  // x0, x1, top (fractions of the inner area); bottoms share a baseline
  [0.18, 0.34, 0.5],
  [0.42, 0.58, 0.25],
  [0.66, 0.82, 0.62],
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA for pixel (x, y) of a size×size icon, with 4×4 supersampling for smooth edges. */
function pixel(x, y, size) {
  const radius = size * 0.2;
  let bg = 0;
  let bar = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4;
      const py = y + (sy + 0.5) / 4;
      // Rounded square: distance to the nearest corner centre when inside a corner box.
      const cx = Math.min(Math.max(px, radius), size - radius);
      const cy = Math.min(Math.max(py, radius), size - radius);
      if ((px - cx) ** 2 + (py - cy) ** 2 > radius ** 2) continue;
      bg++;
      const u = px / size;
      const v = py / size;
      if (BARS.some(([x0, x1, top]) => u >= x0 && u <= x1 && v >= 0.18 + top * 0.64 && v <= 0.82)) {
        bar++;
      }
    }
  }
  const alpha = Math.round((bg / 16) * 255);
  const t = bg === 0 ? 0 : bar / bg; // share of white within the covered part
  return [...BACKGROUND.map((c) => Math.round(c + (255 - c) * t)), alpha];
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      Buffer.from(pixel(x, y, size)).copy(raw, row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const images = SIZES.map(png);
const dir = Buffer.alloc(6 + 16 * images.length);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(images.length, 4);
let offset = dir.length;
images.forEach((image, i) => {
  const size = SIZES[i];
  const entry = 6 + i * 16;
  dir[entry] = size === 256 ? 0 : size; // 0 means 256
  dir[entry + 1] = size === 256 ? 0 : size;
  dir.writeUInt16LE(1, entry + 4); // colour planes
  dir.writeUInt16LE(32, entry + 6); // bits per pixel
  dir.writeUInt32LE(image.length, entry + 8);
  dir.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.ico', Buffer.concat([dir, ...images]));
console.log(`build/icon.ico: ${String(SIZES.length)} sizes, ${String(offset)} bytes`);
