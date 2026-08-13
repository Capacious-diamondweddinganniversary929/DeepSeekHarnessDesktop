'use strict'

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

const HARNESS_PORT = 3080
const BOOT_MARKER = '__DSH_BOOT__'
const START_TIMEOUT_MS = 120 * 1000

// 单实例：启动期间再双击不会拉起第二个后端
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (uiWindow) { uiWindow.focus() } })
}

let uiWindow = null
let serverProcess = null
let stopRequested = false

function appResourcesDir() {
  return path.join(path.dirname(process.execPath), 'resources')
}
function nodeExe() { return path.join(appResourcesDir(), 'node', 'node.exe') }
function harnessDir() { return path.join(appResourcesDir(), 'harness') }
function logFile() { return path.join(app.getPath('userData'), 'harness-server.log') }
function errFile() { return path.join(app.getPath('userData'), 'harness-server.err.log') }
function appIcon() {
  const p = path.join(path.dirname(process.execPath), 'app.ico')
  return fs.existsSync(p) ? p : undefined
}

function probeServer() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: HARNESS_PORT, path: '/', timeout: 3000 },
      (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => resolve(body.includes(BOOT_MARKER)))
        res.resume()
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

function showError(msg) {
  console.error(msg)
  try {
    dialog.showErrorBox('DeepSeek Harness 启动失败', `${msg}\n\n日志文件：${errFile()}`)
  } catch { /* 对话框失败则忽略 */ }
}

async function startHarness() {
  // 端口上已有一个可用实例则直接复用
  if (await probeServer()) return true

  const node = nodeExe()
  const cwd = harnessDir()
  if (!fs.existsSync(node)) { showError(`Node 运行时缺失：${node}`); return false }
  if (!fs.existsSync(path.join(cwd, 'apps', 'cli', 'src', 'bin.ts'))) { showError(`harness 目录不完整：${cwd}`); return false }

  stopRequested = false
  fs.mkdirSync(path.dirname(logFile()), { recursive: true })
  // 用 openSync 立即拿到文件描述符，spawn 的 stdio 才能使用
  const fdOut = fs.openSync(logFile(), 'a')
  const fdErr = fs.openSync(errFile(), 'a')
  fs.writeSync(fdOut, `\n===== ${new Date().toISOString()} DeepSeek Harness 启动 =====\n`)

  let child
  try {
    child = spawn(node, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web'], {
      cwd, stdio: ['ignore', fdOut, fdErr], windowsHide: true,
    })
  } catch (e) { showError(`无法启动进程：${String(e.message || e)}`); return false }
  serverProcess = child

  child.on('error', (e) => { if (!stopRequested) showError(`进程错误：${String(e.message || e)}`) })
  child.on('exit', (code) => {
    if (serverProcess === child) serverProcess = null
    if (!stopRequested) showError(`harness 进程退出（码 ${code ?? 'unknown'}），见日志`)
  })

  const deadline = Date.now() + START_TIMEOUT_MS
  while (true) {
    if (await probeServer()) return true
    if (stopRequested) return false
    if (child.exitCode !== null) { showError(`harness 启动失败（码 ${child.exitCode}），见日志`); return false }
    if (Date.now() > deadline) { showError(`启动超时（${START_TIMEOUT_MS / 1000}s），见日志`); return false }
    await delay(1000)
  }
}

function stopHarness() {
  stopRequested = true
  if (serverProcess && serverProcess.pid) {
    try { spawnSync('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], { windowsHide: true }) } catch { /* 忽略 */ }
    serverProcess = null
  }
}

function openUi() {
  uiWindow = new BrowserWindow({
    width: 1280, height: 860,
    minWidth: 800, minHeight: 600,
    title: 'DeepSeek Harness',
    icon: appIcon(),
    frame: false, // 完全无边框，UI 铺满窗口
    webPreferences: {
      preload: path.join(__dirname, 'titlebar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  uiWindow.loadURL(`http://127.0.0.1:${HARNESS_PORT}`)
  uiWindow.on('page-title-updated', (e) => e.preventDefault())
  uiWindow.on('closed', () => { uiWindow = null })
  // 页面加载完成后，把三个窗口按钮嵌入到页面右上角 + 顶部拖拽区
  uiWindow.webContents.on('did-finish-load', () => {
    injectWindowControls(uiWindow.webContents)
  })
}

// 向 harness 页面注入浮动的窗口控制按钮（右上角）与拖拽区
function injectWindowControls(wc) {
  const css = `
    .dsh-drag-region { position: fixed; top: 0; left: 0; right: 138px; height: 36px; -webkit-app-region: drag; z-index: 2147483646; }
    .dsh-win-controls { position: fixed; top: 0; right: 0; height: 36px; display: flex; z-index: 2147483647; -webkit-app-region: no-drag; }
    .dsh-win-controls button { width: 46px; height: 36px; border: none; background: transparent; color: #94a3b8; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: inherit; padding: 0; }
    .dsh-win-controls button:hover { background: rgba(148,163,184,0.15); color: #e2e8f0; }
    .dsh-win-controls button.dsh-close:hover { background: #e11d48; color: #fff; }
  `
  wc.insertCSS(css).catch(() => {})
  const js = `(function(){
    if (document.querySelector('.dsh-win-controls')) return;
    var drag = document.createElement('div'); drag.className = 'dsh-drag-region'; document.body.appendChild(drag);
    var bar = document.createElement('div'); bar.className = 'dsh-win-controls';
    function mk(t, cb, cls) { var b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.addEventListener('click', cb); return b; }
    bar.appendChild(mk('\\u2500', function(){ window.win && window.win.minimize(); }));
    bar.appendChild(mk('\\u25A1', function(){ window.win && window.win.maximize(); }));
    bar.appendChild(mk('\\u2715', function(){ window.win && window.win.close(); }, 'dsh-close'));
    document.body.appendChild(bar);
  })();`
  wc.executeJavaScript(js).catch(() => {})
}

// 自绘标题栏窗口控制
ipcMain.on('win:minimize', () => { uiWindow?.minimize() })
ipcMain.on('win:maximize', () => {
  if (!uiWindow) return
  uiWindow.isMaximized() ? uiWindow.unmaximize() : uiWindow.maximize()
})
ipcMain.on('win:close', () => { uiWindow?.close() })

app.whenReady().then(async () => {
  // 先启动后端，就绪后再弹窗口（窗口一出现就是 UI）
  const ok = await startHarness()
  if (ok) openUi()
  else app.quit()
})

app.on('window-all-closed', () => { stopHarness(); app.quit() })
process.on('before-exit', () => stopHarness())
