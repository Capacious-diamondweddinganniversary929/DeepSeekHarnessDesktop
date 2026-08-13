// v3: FAST materialize. Pre-populate root node_modules/@deepseek-ai with all
// workspace packages (real dirs), then replace every junction with a real copy
// that SKIPS the target's node_modules (deps resolve up to root). No recursion
// into node_modules => no cycles, fast.
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const H = process.argv[2]
if (!H) { console.error('usage: node materialize3.js <harnessRoot>'); process.exit(1) }
const DSAI = path.join(H, 'node_modules', '@deepseek-ai')

function copyDir(src, dst, skipNM) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNM && e.isDirectory() && e.name === 'node_modules') continue
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d, skipNM)
    else if (e.isSymbolicLink()) {
      let r, st
      try { r = fs.realpathSync(s); st = fs.statSync(r) } catch { continue }
      st.isDirectory() ? copyDir(r, d, true) : fs.copyFileSync(r, d)
    } else fs.copyFileSync(s, d)
  }
}

// 1. collect workspace packages
const pkgs = []
for (const g of fs.readdirSync(path.join(H, 'packages'))) {
  const gd = path.join(H, 'packages', g)
  if (!fs.statSync(gd).isDirectory()) continue
  for (const p of fs.readdirSync(gd)) {
    const pd = path.join(gd, p)
    if (fs.statSync(pd).isDirectory() && fs.existsSync(path.join(pd, 'package.json'))) pkgs.push(pd)
  }
}
for (const v of fs.readdirSync(path.join(H, 'vendor'))) {
  const vd = path.join(H, 'vendor', v)
  if (fs.statSync(vd).isDirectory() && fs.existsSync(path.join(vd, 'package.json'))) pkgs.push(vd)
}
console.error(`workspace packages: ${pkgs.length}`)

// 2. pre-populate root node_modules/@deepseek-ai
fs.mkdirSync(DSAI, { recursive: true })
for (const e of fs.readdirSync(DSAI)) {
  const p = path.join(DSAI, e)
  try { if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p) } catch {}
}
let copied = 0
for (const p of pkgs) {
  let name
  try { name = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).name } catch {}
  if (!name) continue
  const short = name.split('/')[1]
  copyDir(p, path.join(DSAI, short), true)   // skip package's own node_modules
  copied++
}
console.error(`root @deepseek-ai populated: ${copied}`)

// 3. walk the tree, replace junctions with real copies (skip node_modules)
let replaced = 0, deleted = 0
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) {
      let r, st
      try { r = fs.realpathSync(p); st = fs.statSync(r) } catch {
        try { fs.unlinkSync(p); deleted++ } catch {}
        continue
      }
      if (st.isDirectory()) {
        fs.unlinkSync(p)
        copyDir(r, p, true)   // skip target's node_modules (root covers deps)
        replaced++
      } else {
        fs.unlinkSync(p)
        fs.copyFileSync(r, p)
        replaced++
      }
    } else if (e.isDirectory()) {
      walk(p)
    }
  }
})(H)

console.log(`done. replaced ${replaced} links, deleted ${deleted} broken.`)

// verify: count reparse points
let links = 0
;(function scan(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isSymbolicLink()) links++
    else if (e.isDirectory()) { try { scan(path.join(d, e.name)) } catch {} }
  }
})(H)
console.log(`remaining reparse points: ${links}`)
