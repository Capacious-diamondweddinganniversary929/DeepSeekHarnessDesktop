'use strict'
// 用 sharp 渲染 log.svg → 多尺寸 ICO（BMP DIB 帧，兼容 Inno Setup）+ 各平台图标
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')

const SRC = process.argv[2] || 'C:/Users/AzurLane/DeepSeekHarnessDesktop/log.svg'
const OUT = process.argv[3] || 'C:/Users/AzurLane/DeepSeekHarnessDesktop/build/app.ico'
const SIZES = [16, 24, 32, 48, 64, 128, 256]

// RGBA raw -> BMP DIB（32bpp + AND 掩码，ICO 经典格式，Inno Setup 可解析）
function toDib(raw) {
  const { data, info } = raw
  const width = info.width, height = info.height
  const rowLen = width * 4
  const bgra = Buffer.alloc(rowLen * height)
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * rowLen // 自底向上
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * 4
      const di = y * rowLen + x * 4
      bgra[di] = data[si + 2]     // B
      bgra[di + 1] = data[si + 1] // G
      bgra[di + 2] = data[si]     // R
      bgra[di + 3] = data[si + 3] // A
    }
  }
  const andRowBytes = Math.ceil(width / 8)
  const andRowPadded = Math.ceil(andRowBytes / 4) * 4
  const andMask = Buffer.alloc(andRowPadded * height) // 1bpp AND 掩码，全 0

  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)           // biSize
  header.writeInt32LE(width, 4)         // biWidth
  header.writeInt32LE(height * 2, 8)    // biHeight（XOR + AND）
  header.writeUInt16LE(1, 12)           // biPlanes
  header.writeUInt16LE(32, 14)          // biBitCount
  header.writeUInt32LE(0, 16)           // biCompression
  header.writeUInt32LE(bgra.length, 20) // biSizeImage
  header.writeInt32LE(0, 24)            // biXPelsPerMeter
  header.writeInt32LE(0, 28)            // biYPelsPerMeter
  header.writeUInt32LE(0, 32)           // biClrUsed
  header.writeUInt32LE(0, 36)           // biClrImportant
  return Buffer.concat([header, bgra, andMask])
}

function writeIco(entries) {
  const count = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)
  let offset = 6 + count * 16
  const parts = [header]
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)               // planes
    e.writeUInt16LE(32, 6)              // bit count
    e.writeUInt32LE(data.length, 8)     // size
    e.writeUInt32LE(offset, 12)         // offset
    offset += data.length
    parts.push(e, data)
  }
  fs.writeFileSync(OUT, Buffer.concat(parts))
}

async function renderRaw(size) {
  const { data, info } = await sharp(fs.readFileSync(SRC), { density: 300 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, info }
}

async function main() {
  const entries = []
  for (const s of SIZES) {
    const raw = await renderRaw(s)
    entries.push({ size: s, data: toDib(raw.data, raw.info) })
  }
  writeIco(entries)
  console.log('app.ico written:', SIZES.join(','), fs.statSync(OUT).size, 'bytes')
  // macOS .icns 源图与 Linux 图标（与 app.ico 同目录）
  const dir = path.dirname(OUT)
  for (const s of [256, 1024]) {
    fs.writeFileSync(path.join(dir, `icon-${s}.png`), await sharp(fs.readFileSync(SRC), { density: 300 })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer())
  }
  console.log('icon-256.png / icon-1024.png written')
}
main().catch((e) => { console.error(e); process.exit(1) })
