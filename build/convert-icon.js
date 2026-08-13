'use strict'
// 用 sharp 渲染 PNG，png-to-ico 组装 ICO（PNG 帧格式，与 Pillow 一致，Inno Setup 兼容）
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')
const { imagesToIco } = require('png-to-ico')

const SRC = process.argv[2] || 'C:/Users/AzurLane/DeepSeekHarnessDesktop/log.svg'
const OUT = process.argv[3] || 'C:/Users/AzurLane/DeepSeekHarnessDesktop/build/app.ico'
const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function renderPng(size) {
  return sharp(fs.readFileSync(SRC), { density: 300 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function main() {
  const pngs = []
  for (const s of SIZES) pngs.push(await renderPng(s))
  const ico = await imagesToIco(pngs)
  fs.writeFileSync(OUT, ico)
  console.log('app.ico written:', SIZES.join(','), ico.length, 'bytes')
  // macOS .icns 源图与 Linux 图标（与 app.ico 同目录）
  const dir = path.dirname(OUT)
  fs.writeFileSync(path.join(dir, 'icon-256.png'), pngs[6])
  fs.writeFileSync(path.join(dir, 'icon-1024.png'), await renderPng(1024))
  console.log('icon-256.png / icon-1024.png written')
}
main().catch((e) => { console.error(e); process.exit(1) })
