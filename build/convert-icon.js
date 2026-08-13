'use strict'
// 用 sharp 把 log.svg 渲染成多尺寸 PNG，再用纯 Node 写 ICO 容器（无需 Python/Pillow）
const sharp = require('sharp')
const fs = require('node:fs')

const SRC = process.argv[2] || 'C:/Users/AzurLane/DeepSeekHarnessDesktop/log.svg'
const OUT = process.argv[3] || 'C:/Users/AzurLane/DeepSeekHarnessDesktop/build/app.ico'
const SIZES = [16, 24, 32, 48, 64, 128, 256]

// 写 ICO（PNG 帧压缩）
function writeIco(path, pngBuffers) {
  const count = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)   // reserved
  header.writeUInt16LE(1, 2)   // type: icon
  header.writeUInt16LE(count, 4)
  const entries = []
  let offset = 6 + count * 16
  const dir = []
  for (let i = 0; i < count; i++) {
    const size = SIZES[i]
    const b = pngBuffers[i]
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)  // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1)  // height
    e.writeUInt8(0, 2)                        // colors
    e.writeUInt8(0, 3)                        // reserved
    e.writeUInt16LE(1, 4)                     // planes
    e.writeUInt16LE(32, 6)                    // bit count
    e.writeUInt32LE(b.length, 8)              // size
    e.writeUInt32LE(offset, 12)               // offset
    offset += b.length
    dir.push(e, b)
  }
  fs.writeFileSync(path, Buffer.concat([header, ...dir]))
}

async function main() {
  const svg = fs.readFileSync(SRC)
  const pngs = []
  for (const s of SIZES) {
    const buf = await sharp(svg, { density: 300 })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    pngs.push(buf)
  }
  writeIco(OUT, pngs)
  console.log('app.ico written:', SIZES.join(','), fs.statSync(OUT).size, 'bytes')
}
main().catch((e) => { console.error(e); process.exit(1) })
