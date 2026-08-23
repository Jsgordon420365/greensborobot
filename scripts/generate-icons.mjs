/**
 * Generates the PWA icon set with zero dependencies.
 *
 * Each icon is a hand-built PNG: a warm background, a simple paw-and-frond
 * mark. Original artwork, so there is nothing to attribute and nothing to
 * license. Run with `npm run gen:icons`.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');

const BG = [0x1e, 0x1a, 0x17];
const BG_MASKABLE = [0x14, 0x11, 0x0f];
const ACCENT = [0xe8, 0xa3, 0x41];
const LEAF = [0x6f, 0xb9, 0x87];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, draw) {
  const bytesPerRow = size * 4 + 1;
  const raw = Buffer.alloc(bytesPerRow * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * bytesPerRow] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = draw(x, y, size);
      const o = y * bytesPerRow + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function circle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** A paw print with a small frond beside it. */
function mark(x, y, size, opts = {}) {
  const s = size / 100;
  const bg = opts.maskable ? BG_MASKABLE : BG;
  // Maskable icons keep the mark inside the safe zone (80% of the canvas).
  const inset = opts.maskable ? 0.78 : 1;
  const cx = size / 2;
  const cy = size / 2;
  const px = (x - cx) / inset + cx;
  const py = (y - cy) / inset + cy;

  // Rounded background
  if (!opts.maskable) {
    const radius = size * 0.22;
    const inCorner =
      (x < radius && y < radius && !circle(x, y, radius, radius, radius)) ||
      (x > size - radius && y < radius && !circle(x, y, size - radius, radius, radius)) ||
      (x < radius && y > size - radius && !circle(x, y, radius, size - radius, radius)) ||
      (x > size - radius && y > size - radius && !circle(x, y, size - radius, size - radius, radius));
    if (inCorner) return [0, 0, 0, 0];
  }

  // Paw pad
  if (circle(px, py, 42 * s, 60 * s, 20 * s)) return [...ACCENT, 255];
  // Toes
  const toes = [
    [26, 36, 9],
    [38, 28, 9.5],
    [52, 29, 9.5],
    [63, 39, 9],
  ];
  for (const [tx, ty, tr] of toes) {
    if (circle(px, py, tx * s, ty * s, tr * s)) return [...ACCENT, 255];
  }

  // A frond: an arching stem with leaflets that taper toward the tip.
  const stemX = 79 * s;
  const stemTop = 24 * s;
  const stemBottom = 76 * s;
  // The stem curves slightly, so it reads as a growing thing not a mast.
  const stemAt = (yy) => stemX + Math.pow((yy - stemTop) / (stemBottom - stemTop), 2) * 5 * s;
  if (py > stemTop && py < stemBottom) {
    const sx = stemAt(py);
    if (px > sx - 2 * s && px < sx + 2 * s) return [...LEAF, 255];
  }
  for (let i = 0; i < 6; i += 1) {
    const ly = (30 + i * 8.5) * s;
    const reach = (4 + i * 1.4) * s;
    const sx = stemAt(ly);
    for (const side of [-1, 1]) {
      // Each leaflet is a small ellipse angled up and away from the stem.
      const lx = sx + side * reach * 0.62;
      const dx = (px - lx) / (reach * 0.75);
      const dy = (py - (ly - reach * 0.3)) / (2.6 * s);
      if (dx * dx + dy * dy <= 1) return [...LEAF, 255];
    }
  }

  return [...bg, 255];
}

function badge(x, y, size) {
  // Monochrome badge: a solid paw silhouette on transparency.
  const s = size / 100;
  if (circle(x, y, 50 * s, 62 * s, 22 * s)) return [255, 255, 255, 255];
  const toes = [
    [30, 36, 10],
    [44, 27, 10.5],
    [59, 28, 10.5],
    [71, 39, 10],
  ];
  for (const [tx, ty, tr] of toes) {
    if (circle(x, y, tx * s, ty * s, tr * s)) return [255, 255, 255, 255];
  }
  return [0, 0, 0, 0];
}

mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192, (x, y, s) => mark(x, y, s)],
  ['icon-512.png', 512, (x, y, s) => mark(x, y, s)],
  ['icon-maskable-512.png', 512, (x, y, s) => mark(x, y, s, { maskable: true })],
  ['badge-72.png', 72, badge],
];

for (const [name, size, draw] of targets) {
  writeFileSync(resolve(outDir, name), png(size, draw));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
