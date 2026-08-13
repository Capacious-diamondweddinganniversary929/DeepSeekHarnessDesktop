'use strict'

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

const HARNESS_PORT = 3080
const BOOT_MARKER = '__DSH_BOOT__'
const START_TIMEOUT_MS = 120 * 1000

let tray = null
let isQuitting = false

// 单实例：启动期间再双击不会拉起第二个后端，而是唤起已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showUi())
}

let uiWindow = null
let splashWindow = null
let serverProcess = null
let stopRequested = false

function appResourcesDir() {
  return path.join(path.dirname(process.execPath), 'resources')
}
function nodeExe() {
  // Windows 内置 node.exe，macOS/Linux 为无扩展名可执行文件
  const name = process.platform === 'win32' ? 'node.exe' : 'node'
  return path.join(appResourcesDir(), 'node', name)
}
function harnessDir() { return path.join(appResourcesDir(), 'harness') }
function logFile() { return path.join(app.getPath('userData'), 'harness-server.log') }
function errFile() { return path.join(app.getPath('userData'), 'harness-server.err.log') }
function appIcon() {
  const exeDir = path.dirname(process.execPath)
  // macOS: 可执行文件在 Contents/MacOS，图标资源在 Contents/Resources
  const dirs = process.platform === 'darwin'
    ? [path.join(exeDir, '..', 'Resources'), exeDir]
    : [exeDir]
  const names = process.platform === 'win32' ? ['app.ico']
    : process.platform === 'darwin' ? ['icon.icns', 'icon.png']
    : ['icon.png']
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n)
    if (fs.existsSync(p)) return p
  }
  return undefined
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
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], { windowsHide: true })
      } else {
        process.kill(serverProcess.pid, 'SIGTERM')
      }
    } catch { /* 忽略 */ }
    serverProcess = null
  }
}

// MD3 风格启动加载页：圆角卡片 + 左上角 logo + 底部滚动进度条
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400, height: 148,
    frame: false, transparent: true,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true,
    icon: appIcon(),
    webPreferences: { contextIsolation: true },
  })
  splashWindow.setAlwaysOnTop(true, 'screen-saver')
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'))
}
function splashDone() {
  if (splashWindow) {
    splashWindow.close()
    splashWindow = null
  }
}

// 系统托盘：关闭窗口后服务继续后台运行
function createTray() {
  if (tray) return
  const iconPath = appIcon()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开界面', click: () => showUi() },
    { type: 'separator' },
    { label: '退出', click: () => {
      isQuitting = true
      stopHarness()
      app.quit()
    } },
  ]))
  tray.on('click', () => showUi())
}

function showUi() {
  if (!uiWindow) { openUi(); return }
  if (uiWindow.isMinimized()) uiWindow.restore()
  uiWindow.show()
  uiWindow.focus()
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
  // 点关闭（✕）不退出，隐藏到托盘，服务继续运行
  uiWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      uiWindow.hide()
    }
  })
  // 页面加载完成后，把三个窗口按钮嵌入到页面右上角 + 顶部拖拽区
  uiWindow.webContents.on('did-finish-load', () => {
    injectWindowControls(uiWindow.webContents)
  })
  // 最大化状态变化通知页面，用于切换 最大化/还原 图标
  uiWindow.on('maximize', () => uiWindow.webContents.send('win:maximized-change', true))
  uiWindow.on('unmaximize', () => uiWindow.webContents.send('win:maximized-change', false))
}

// 向 harness 页面注入浮动的窗口控制按钮（右上角）与拖拽区
// 用 Segoe MDL2 Assets（Windows 原生图标字体）渲染，观感与系统按钮一致
function injectWindowControls(wc) {
  const css = `
    .dsh-drag-region { position: fixed; top: 0; left: 0; right: 138px; height: 32px; -webkit-app-region: drag; z-index: 2147483646; }
    .dsh-win-controls { position: fixed; top: 0; right: 0; height: 32px; display: flex; z-index: 2147483647; -webkit-app-region: no-drag; }
    .dsh-win-controls button {
      width: 46px; height: 32px; border: none; background: transparent; padding: 0;
      font-family: "Segoe MDL2 Assets", "Segoe Fluent Icons", sans-serif;
      font-size: 10px; line-height: 32px; color: #595959;
      display: flex; align-items: center; justify-content: center; cursor: default;
    }
    .dsh-win-controls button:hover { background: rgba(0,0,0,0.06); color: #000; }
    .dsh-win-controls button:active { background: rgba(0,0,0,0.12); }
    .dsh-win-controls button.dsh-close:hover { background: #e81123; color: #fff; }
    .dsh-win-controls button.dsh-close:active { background: #c50f1f; }
  `
  wc.insertCSS(css).catch(() => {})
  const js = `(function(){
    if (document.querySelector('.dsh-win-controls')) return;
    var MIN='\\uE921', MAX='\\uE922', REST='\\uE923', CLOSE='\\uE8BB';
    var drag = document.createElement('div'); drag.className = 'dsh-drag-region'; document.body.appendChild(drag);
    var bar = document.createElement('div'); bar.className = 'dsh-win-controls';
    var minBtn = document.createElement('button'); minBtn.textContent = MIN; minBtn.title = '最小化';
    var maxBtn = document.createElement('button'); maxBtn.textContent = MAX; maxBtn.title = '最大化';
    var closeBtn = document.createElement('button'); closeBtn.textContent = CLOSE; closeBtn.className = 'dsh-close'; closeBtn.title = '关闭';
    minBtn.addEventListener('click', function(){ window.win && window.win.minimize(); });
    maxBtn.addEventListener('click', function(){ window.win && window.win.maximize(); });
    closeBtn.addEventListener('click', function(){ window.win && window.win.close(); });
    bar.appendChild(minBtn); bar.appendChild(maxBtn); bar.appendChild(closeBtn);
    document.body.appendChild(bar);
    function setMax(v){ maxBtn.textContent = v ? REST : MAX; maxBtn.title = v ? '还原' : '最大化'; }
    if (window.win && window.win.isMaximized) window.win.isMaximized().then(setMax).catch(function(){});
    if (window.win && window.win.onMaximizedChange) window.win.onMaximizedChange(setMax);
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
ipcMain.handle('win:isMaximized', () => uiWindow?.isMaximized() ?? false)

app.whenReady().then(async () => {
  createTray() // 托盘常驻，关闭窗口后服务仍在后台
  createSplash() // 启动加载页（MD3）
  const ok = await startHarness()
  splashDone()
  if (ok) openUi()
  else app.quit()
})

// 窗口关闭到托盘后不退出；仅真正退出时才停服
app.on('window-all-closed', () => {
  if (isQuitting) { stopHarness(); app.quit() }
})
process.on('before-quit', () => { stopHarness() })
