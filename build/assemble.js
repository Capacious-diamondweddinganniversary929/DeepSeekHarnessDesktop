'use strict'
// 组装桌面应用目录（跨平台版 assemble.ps1）
//   Windows: build/DeepSeekHarnessApp/DeepSeekHarness.exe + resources/
//   macOS:   build/DeepSeekHarnessApp/DeepSeekHarness.app（图标 .icns、Info.plist、ad-hoc 签名）
//   Linux:   build/DeepSeekHarnessApp/DeepSeekHarness/（二进制 DeepSeekHarness + resources/）
// 拷贝策略：Windows 用 robocopy（快），POSIX 用 cp -aL（解引用符号链接）
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname)
const proj = path.dirname(root)
// 可选第二个参数指定输出目录（默认 build/DeepSeekHarnessApp，测试时可指向别处）
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'DeepSeekHarnessApp')
const electronDist = path.join(proj, 'node_modules', 'electron', 'dist')
const platform = process.platform

function fail(msg) { console.error(`[assemble] ${msg}`); process.exit(1) }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }) }
function sh(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  // 所有子命令都是真实可执行文件（robocopy/rcedit/cp/sips/...），无需 shell
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (opts.check !== false && r.status !== 0) fail(`${cmd} failed (exit ${r.status})`)
  return r
}
// 把 src 目录的【内容】拷进 dstDir
function copyContents(src, dstDir, extraArgs = []) {
  fs.mkdirSync(dstDir, { recursive: true })
  if (platform === 'win32') {
    const r = sh('robocopy', [src, dstDir, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', ...extraArgs], { check: false })
    if (r.status !== null && r.status >= 8) fail(`robocopy ${src} -> ${dstDir} failed (exit ${r.status})`)
  } else {
    const r = sh('cp', ['-aL', `${src}${path.sep}.`, `${dstDir}${path.sep}`], { check: false })
    if (r.status !== 0) fail(`cp ${src} -> ${dstDir} failed (exit ${r.status})`)
  }
}

// ---- 0. 校验 ----
const resDir = path.join(out, 'resources')
if (platform === 'win32') {
  if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) fail(`electron dist 不存在: ${electronDist}`)
  if (!fs.existsSync(path.join(proj, 'resources', 'node', 'node.exe'))) fail('node.exe 不存在: resources\\node')
} else if (platform === 'darwin') {
  if (!fs.existsSync(path.join(electronDist, 'Electron.app'))) fail(`Electron.app 不存在: ${electronDist}`)
} else {
  if (!fs.existsSync(path.join(electronDist, 'electron'))) fail(`electron dist 不存在: ${electronDist}`)
}
if (!fs.existsSync(path.join(proj, 'resources', 'harness', 'apps', 'cli', 'src', 'bin.ts'))) {
  fail('harness 目录不完整: resources\\harness')
}

rmrf(out)
fs.mkdirSync(out, { recursive: true })

const nodeSrc = path.join(proj, 'resources', 'node')
const harnessSrc = path.join(proj, 'resources', 'harness')
const appSrc = path.join(proj, 'app')

// ---- 1. Electron 运行时 + 应用 + node + harness ----
if (platform === 'win32') {
  copyContents(electronDist, out, ['/XF', 'electron.exe'])
  fs.copyFileSync(path.join(electronDist, 'electron.exe'), path.join(out, 'DeepSeekHarness.exe'))
  copyContents(appSrc, path.join(resDir, 'app'))
  copyContents(nodeSrc, path.join(resDir, 'node'))
  copyContents(harnessSrc, path.join(resDir, 'harness'))
} else if (platform === 'darwin') {
  const appDir = path.join(out, 'DeepSeekHarness.app')
  const macosDir = path.join(appDir, 'Contents', 'MacOS')
  const appResDir = path.join(appDir, 'Contents', 'Resources')
  // 复制 Electron.app 必须用 ditto（保留符号链接）：框架内部依赖
  // Versions/Current 等符号链接结构，cp -aL 解引用会破坏 .framework 布局，
  // 导致 codesign 报 "bundle format is ambiguous"
  const staging = path.join(out, '_Electron.app')
  fs.mkdirSync(staging, { recursive: true })
  const d = sh('ditto', [path.join(electronDist, 'Electron.app'), staging], { check: false })
  if (d.status !== 0) fail(`ditto Electron.app failed (exit ${d.status})`)
  fs.renameSync(staging, appDir)
  fs.renameSync(path.join(macosDir, 'Electron'), path.join(macosDir, 'DeepSeekHarness'))
  copyContents(appSrc, path.join(appResDir, 'app'))
  copyContents(nodeSrc, path.join(appResDir, 'node'))
  copyContents(harnessSrc, path.join(appResDir, 'harness'))

  // 图标：icon-1024.png -> icon.icns（sips + iconutil），另放 PNG 供托盘使用
  const src1024 = path.join(root, 'icon-1024.png')
  if (!fs.existsSync(src1024)) fail(`缺少 ${src1024}（先运行 convert-icon.js）`)
  const iconset = path.join(root, 'icon.iconset')
  rmrf(iconset)
  fs.mkdirSync(iconset, { recursive: true })
  const sizes = [
    ['16', '16', 'icon_16x16.png'], ['32', '32', 'icon_16x16@2x.png'],
    ['32', '32', 'icon_32x32.png'], ['64', '64', 'icon_32x32@2x.png'],
    ['128', '128', 'icon_128x128.png'], ['256', '256', 'icon_128x128@2x.png'],
    ['256', '256', 'icon_256x256.png'], ['512', '512', 'icon_256x256@2x.png'],
    ['512', '512', 'icon_512x512.png'], ['1024', '1024', 'icon_512x512@2x.png'],
  ]
  for (const [w, h, name] of sizes) {
    sh('sips', ['-z', w, h, src1024, '--out', path.join(iconset, name)])
  }
  sh('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'icon.icns')])
  rmrf(iconset)
  fs.copyFileSync(path.join(root, 'icon.icns'), path.join(appResDir, 'icon.icns'))
  fs.copyFileSync(path.join(root, 'icon-256.png'), path.join(appResDir, 'icon.png'))

  // Info.plist
  const plist = path.join(appDir, 'Contents', 'Info.plist')
  sh('plutil', ['-replace', 'CFBundleName', '-string', 'DeepSeek Harness', plist])
  sh('plutil', ['-replace', 'CFBundleDisplayName', '-string', 'DeepSeek Harness', plist])
  sh('plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.deepseekai.harness.desktop', plist])
  sh('plutil', ['-replace', 'CFBundleExecutable', '-string', 'DeepSeekHarness', plist])
  sh('plutil', ['-replace', 'CFBundleIconFile', '-string', 'icon', plist])

  // ad-hoc 签名（Apple Silicon 必需，否则启动即被杀）。
  // macOS 15 上 codesign 对 Electron 的 .framework 报 "bundle format is ambiguous"：
  // 根因是框架 Info.plist 缺 CFBundlePackageType。处理：
  //  1) 给每个 .framework 补 CFBundlePackageType=FMWK
  //  2) 跳过符号链接，只签真实文件（.dylib/.node/无扩展名 Mach-O，深→浅）
  //  3) 再签 framework bundle → helper .app → 主程序 → 外层 app bundle
  function patchFrameworkTypes(frameworksDir) {
    if (!fs.existsSync(frameworksDir)) return
    for (const e of fs.readdirSync(frameworksDir, { withFileTypes: true })) {
      if (!(e.isDirectory() && e.name.endsWith('.framework'))) continue
      for (const pl of [
        path.join(frameworksDir, e.name, 'Resources', 'Info.plist'),
        path.join(frameworksDir, e.name, 'Versions', 'A', 'Resources', 'Info.plist'),
      ]) {
        if (!fs.existsSync(pl)) continue
        let r = sh('plutil', ['-insert', 'CFBundlePackageType', '-string', 'FMWK', pl], { check: false })
        if (r.status !== 0) sh('plutil', ['-replace', 'CFBundlePackageType', '-string', 'FMWK', pl])
      }
    }
  }
  function isMachO(p) {
    try {
      const fd = fs.openSync(p, 'r')
      const b = Buffer.alloc(4)
      fs.readSync(fd, b, 0, 4, 0)
      fs.closeSync(fd)
      const m = b.readUInt32BE(0)
      return m === 0xFEEDFACE || m === 0xFEEDFACF || m === 0xCAFEBABE ||
        m === 0xBEBAFECA || m === 0xCFFAEDFE || m === 0xCEFAEDFE || m === 0xFEEDFA11
    } catch { return false }
  }
  function adhocSign(appDir) {
    const files = []
    const frameworks = []
    const apps = []
    ;(function walk(dir) {
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.isSymbolicLink()) continue // 符号链接跳过，真实文件会在原路径被遍历到
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name.endsWith('.framework')) frameworks.push(p)
          else if (e.name.endsWith('.app') && dir !== appDir) apps.push(p)
          walk(p)
        } else if (e.name.endsWith('.dylib') || e.name.endsWith('.node') || isMachO(p)) {
          files.push(p)
        }
      }
    })(appDir)
    patchFrameworkTypes(path.join(appDir, 'Contents', 'Frameworks'))
    files.sort((a, b) => b.length - a.length) // 深→浅
    for (const p of files) sh('codesign', ['--force', '-s', '-', p])
    for (const f of frameworks) sh('codesign', ['--force', '-s', '-', f])
    for (const a of apps) sh('codesign', ['--force', '-s', '-', a])
    sh('codesign', ['--force', '-s', '-', path.join(appDir, 'Contents', 'MacOS', 'DeepSeekHarness')])
    sh('codesign', ['--force', '-s', '-', appDir])
    console.log(`codesign: ${files.length} files + ${frameworks.length} frameworks + ${apps.length} apps + main + bundle`)
  }
  adhocSign(appDir)
} else {
  copyContents(electronDist, out)
  fs.renameSync(path.join(out, 'electron'), path.join(out, 'DeepSeekHarness'))
  copyContents(appSrc, path.join(resDir, 'app'))
  copyContents(nodeSrc, path.join(resDir, 'node'))
  copyContents(harnessSrc, path.join(resDir, 'harness'))
  fs.copyFileSync(path.join(root, 'icon-256.png'), path.join(resDir, 'icon.png'))
}

// ---- 2. Windows 图标替换（rcedit，可选）----
if (platform === 'win32') {
  const rcedit = path.join(root, 'rcedit-x64.exe')
  const exe = path.join(out, 'DeepSeekHarness.exe')
  const ico = path.join(root, 'app.ico')
  if (fs.existsSync(rcedit) && fs.existsSync(ico)) {
    const r = sh(rcedit, [exe, '--set-icon', ico], { check: false })
    console.log(r.status === 0 ? 'rcedit: 图标已替换' : `rcedit: 退出码 ${r.status}（忽略）`)
  } else {
    console.log('rcedit 不存在，跳过图标替换')
  }
}

// ---- 3. 清理调试与冗余内容 ----
for (const p of [
  path.join(resDir, 'harness', '.dsh'),
  path.join(resDir, 'harness', '.turbo'),
  path.join(resDir, 'harness', 'pnpm-debug.log'),
]) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

// ---- 4. 报告 ----
let files = 0
let size = 0
;(function scan(d) {
  let entries
  try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) scan(p)
    else if (e.isFile() || e.isSymbolicLink()) {
      files++
      try { size += fs.statSync(p).size } catch { /* 忽略 */ }
    }
  }
})(out)
console.log('组装完成:', out)
console.log(`  文件数: ${files}`)
console.log(`  大小:   ${(size / 1024 / 1024).toFixed(1)} MB`)
