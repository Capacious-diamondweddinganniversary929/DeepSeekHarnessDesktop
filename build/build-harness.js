'use strict'
// 克隆 deepseek-harness 并构建（跨平台）
//  - 已存在 resources/harness/package.json 则跳过克隆（本地复用现有目录）
//  - 移除根 package.json 的 packageManager 字段（避免自动切到 pnpm 11）
//  - 写 .npmrc: node-linker=hoisted + manage-package-manager-versions=false
//  - pnpm install --no-frozen-lockfile && pnpm run build
//  - 构建完成后删除 .git（减小打包体积）
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const proj = path.dirname(path.resolve(__dirname))
const h = path.join(proj, 'resources', 'harness')

function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`[build-harness] ${cmd} failed (exit ${r.status})`)
    process.exit(1)
  }
}

if (!fs.existsSync(path.join(h, 'package.json'))) {
  run('git', ['clone', '--depth', '1', '--branch', 'master',
    'https://github.com/deepseek-ai/deepseek-harness.git', h], proj)
}

const pkgPath = path.join(h, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
delete pkg.packageManager
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
fs.writeFileSync(path.join(h, '.npmrc'), 'manage-package-manager-versions=false\nnode-linker=hoisted\n')

run('pnpm', ['install', '--no-frozen-lockfile'], h)
run('pnpm', ['run', 'build'], h)

fs.rmSync(path.join(h, '.git'), { recursive: true, force: true })
console.log('harness ready:', h)
