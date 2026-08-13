'use strict'
const sharp = require('sharp')
const fs = require('node:fs')

const src = 'C:/Users/AzurLane/DeepSeekHarnessDesktop/log.svg'
const out = 'C:/Users/AzurLane/DeepSeekHarnessDesktop/build/icon-256.png'

async function main() {
  const svg = fs.readFileSync(src)
  // render the SVG's viewBox (24x24) up to 256px, sharp handles vector scale
  await sharp(svg, { density: 300 })
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  console.log('rendered', out, fs.statSync(out).size, 'bytes')
}
main().catch((e) => { console.error(e); process.exit(1) })
