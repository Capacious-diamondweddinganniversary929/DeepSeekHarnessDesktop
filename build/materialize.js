// 物化 harness 树里所有 junction / 符号链接为真实文件（循环安全），原地处理。
// 快速版：用 Dirent 类型检测链接（无需对每个文件 realpath），只处理 ~2600 个链接。
// 用法: node materialize.js <harnessRoot>
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const ROOT = process.argv[2]
if (!ROOT) { console.error('usage: node materialize.js <root>'); process.exit(1) }

const visiting = new Set()       // 当前复制栈上的真实路径（环检测）
const materialized = new Map()   // 真实路径 -> 已物化目标位置
let dirCount = 0

function copyFile(src, dst) { fs.copyFileSync(src, dst) }

// 复制一棵“干净”树（其内部不应有链接）
function copyClean(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    if (e.isDirectory()) copyClean(s, d)
    else if (e.isSymbolicLink()) {
      let real, st
      try { real = fs.realpathSync(s); st = fs.statSync(real) } catch { continue }
      st.isDirectory() ? copyClean(real, d) : copyFile(real, d)
    } else copyFile(s, d)
  }
}

// 浅复制（跳过 node_modules，用于打破环）
function copyShallow(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory() && e.name === 'node_modules') continue
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    if (e.isDirectory()) copyClean(s, d)
    else if (e.isSymbolicLink()) {
      let real, st
      try { real = fs.realpathSync(s); st = fs.statSync(real) } catch { continue }
      st.isDirectory() ? copyClean(real, d) : copyFile(real, d)
    } else copyFile(s, d)
  }
}

// 把 junction 目标复制成真实目录（循环安全）
function copyDirFromTarget(realTarget, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(realTarget, { withFileTypes: true })) {
    const s = path.join(realTarget, e.name), d = path.join(dst, e.name)
    if (e.isSymbolicLink()) {
      let real, st
      try { real = fs.realpathSync(s); st = fs.statSync(real) } catch { continue }
      if (st.isDirectory()) {
        if (visiting.has(real)) copyShallow(real, d)
        else if (materialized.has(real)) copyClean(materialized.get(real), d)
        else { visiting.add(real); copyDirFromTarget(real, d); visiting.delete(real); materialized.set(real, d) }
      } else copyFile(real, d)
    } else if (e.isDirectory()) {
      copyDirFromTarget(s, d)
    } else {
      copyFile(s, d)
    }
  }
}

// 原地遍历：只处理链接，真实文件/目录不动
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) {
      let real, st
      try { real = fs.realpathSync(p); st = fs.statSync(real) } catch {
        try { fs.unlinkSync(p) } catch {}
        continue
      }
      if (st.isDirectory()) {
        fs.rmdirSync(p)                       // 移除 junction 本身
        copyDirFromTarget(real, p)
      } else {
        fs.unlinkSync(p)
        copyFile(real, p)
      }
    } else if (e.isDirectory()) {
      walk(p)
      if (++dirCount % 2000 === 0) console.error(`  walked ${dirCount} dirs ...`)
    }
  }
}

console.error('materializing ...')
const t0 = Date.now()
walk(ROOT)
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s, walked ${dirCount} dirs`)

// 校验：统计剩余链接
let links = 0
;(function scan(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isSymbolicLink()) links++
    else if (e.isDirectory()) { try { scan(path.join(d, e.name)) } catch {} }
  }
})(ROOT)
console.log(`remaining reparse points: ${links}`)
