// Generates coral "B" PNG icons with no external deps (Node zlib only).
// Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// Palette
const CORAL = [0xe0, 0x88, 0x53]
const CORAL_DARK = [0xc8, 0x6c, 0x3a]
const WHITE = [0xff, 0xff, 0xff]

// A crisp "B" defined on a 5x7 cell grid (1 = white ink).
const B = [
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0],
]
const GLYPH_W = 5
const GLYPH_H = 7

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function makePng(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const radius = Math.round(size * 0.22) // rounded-corner radius

  // Glyph placement: centered, ~54% of tile height.
  const cell = Math.floor((size * 0.54) / GLYPH_H)
  const glyphPxW = cell * GLYPH_W
  const glyphPxH = cell * GLYPH_H
  const gx = Math.floor((size - glyphPxW) / 2)
  const gy = Math.floor((size - glyphPxH) / 2)

  const inRoundedRect = (x, y) => {
    // corner-clip for a rounded square
    const corners = [
      [radius, radius],
      [size - radius, radius],
      [radius, size - radius],
      [size - radius, size - radius],
    ]
    const nearLeft = x < radius
    const nearRight = x >= size - radius
    const nearTop = y < radius
    const nearBottom = y >= size - radius
    let cx = null
    let cy = null
    if (nearLeft && nearTop) [cx, cy] = corners[0]
    else if (nearRight && nearTop) [cx, cy] = corners[1]
    else if (nearLeft && nearBottom) [cx, cy] = corners[2]
    else if (nearRight && nearBottom) [cx, cy] = corners[3]
    if (cx === null) return true
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= radius * radius
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      if (!inRoundedRect(x, y)) {
        rgba[idx + 3] = 0 // transparent outside the rounded square
        continue
      }
      // Diagonal coral gradient background.
      const t = (x + y) / (2 * size)
      const bg = [
        Math.round(CORAL[0] + (CORAL_DARK[0] - CORAL[0]) * t),
        Math.round(CORAL[1] + (CORAL_DARK[1] - CORAL[1]) * t),
        Math.round(CORAL[2] + (CORAL_DARK[2] - CORAL[2]) * t),
      ]
      let color = bg
      // Stamp the glyph.
      if (x >= gx && x < gx + glyphPxW && y >= gy && y < gy + glyphPxH) {
        const col = Math.floor((x - gx) / cell)
        const row = Math.floor((y - gy) / cell)
        if (B[row]?.[col]) color = WHITE
      }
      rgba[idx] = color[0]
      rgba[idx + 1] = color[1]
      rgba[idx + 2] = color[2]
      rgba[idx + 3] = 255
    }
  }

  // Build raw image data: each scanline prefixed with filter byte 0.
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const png = makePng(size)
  writeFileSync(join(publicDir, name), png)
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`)
}
