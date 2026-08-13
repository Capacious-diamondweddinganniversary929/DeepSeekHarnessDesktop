'use strict'
// 精简 harness（跨平台版 trim.ps1）
//  1. 删除残留的目标 harness（build/DeepSeekHarnessApp/resources/harness）
//  2. 删除每个包 node_modules 里冗余的 @deepseek-ai 副本
//     （根 node_modules/@deepseek-ai 已含全部 workspace 包）
//  3. web 前端产物 -> node_modules/@deepseek-ai/dsh-web-frontend
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname)
const proj = path.dirname(root)
const h = path.join(proj, 'resources', 'harness')
const out = path.join(root, 'DeepSeekHarnessApp', 'resources', 'harness')

// 1. 删除残留的目标 harness（若被占用——如应用正在运行——则告警跳过）
try {
  fs.rmSync(out, { recursive: true, force: true })
  console.log('removed partial dest')
} catch (e) {
  console.warn(`跳过删除残留 dest（可能被占用）: ${out}\n  ${e.message}`)
}

// 2. 删除每个包 node_modules 里冗余的 @deepseek-ai
let removed = 0
function walkDirs(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (!e.isDirectory()) continue
    if (e.name === 'node_modules') {
      const dsai = path.join(p, '@deepseek-ai')
      if (fs.existsSync(dsai)) {
        fs.rmSync(dsai, { recursive: true, force: true })
        removed++
      }
    } else {
      walkDirs(p)
    }
  }
}
for (const sub of ['packages', 'apps', 'vendor', 'examples', 'website', 'native', 'python']) {
  const base = path.join(h, sub)
  if (fs.existsSync(base)) walkDirs(base)
}
console.log(`removed redundant @deepseek-ai dirs: ${removed}`)

// 3. web-app 前端产物 -> node_modules/@deepseek-ai/dsh-web-frontend
const feSrc = path.join(h, 'apps', 'web')
const feDst = path.join(h, 'node_modules', '@deepseek-ai', 'dsh-web-frontend')
if (fs.existsSync(feSrc)) {
  fs.rmSync(feDst, { recursive: true, force: true })
  fs.cpSync(feSrc, feDst, {
    recursive: true,
    dereference: true,
    filter: (s) => !s.split(path.sep).includes('node_modules'),
  })
}
console.log('web-frontend copied:', fs.existsSync(path.join(feDst, 'dist', 'index.html')))

// 4. 统计源文件数
let files = 0
;(function count(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) count(p)
    else if (e.isFile() || e.isSymbolicLink()) files++
  }
})(h)
console.log(`source after trim: ${files} files`)
