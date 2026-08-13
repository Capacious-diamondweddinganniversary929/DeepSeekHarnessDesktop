'use strict'
// 下载并解压内置 Node 运行时到 resources/node（跨平台）
// 用法: node build/download-node.js [v24.14.0]
//  - Windows: node-vXX-win-x64.zip  (用 bsdtar 解压, Windows 10+ 自带)
//  - macOS:   node-vXX-darwin-{x64,arm64}.tar.gz
//  - Linux:   node-vXX-linux-{x64,arm64}.tar.gz
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const VERSION = process.argv[2] || 'v24.14.0'
const root = path.resolve(__dirname)
const proj = path.dirname(root)
const destDir = path.join(proj, 'resources', 'node')

const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const plat = process.platform === 'win32' ? 'win' : process.platform // darwin | linux
const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
const file = `node-${VERSION}-${plat}-${arch}.${ext}`
const url = `https://nodejs.org/dist/${VERSION}/${file}`

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      const r = findFile(p, name)
      if (r) return r
    } else if (e.name === name) return p
  }
  return null
}

async function main() {
  fs.mkdirSync(destDir, { recursive: true })
  const tmp = path.join(proj, 'build', `node-dl-${Date.now()}`)
  fs.mkdirSync(tmp, { recursive: true })
  const archive = path.join(tmp, file)

  console.log(`download ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))

  // tar 自动识别格式：Windows 的 bsdtar 解 zip，GNU tar 解 tar.gz
  const r = spawnSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`tar extract failed (exit ${r.status})`)

  const name = process.platform === 'win32' ? 'node.exe' : 'node'
  const bin = findFile(tmp, name)
  if (!bin) throw new Error(`node binary not found under ${tmp}`)
  const target = path.join(destDir, name)
  fs.copyFileSync(bin, target)
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755)

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`node runtime -> ${target}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
