'use strict'

const api = window.api

const $ = (id) => document.getElementById(id)

const STATUS_TEXT = {
  stopped: '服务未启动',
  starting: '正在启动服务…',
  running: '服务运行中',
  error: '启动失败',
}

let busy = false

function render(status) {
  const dot = $('dot')
  const text = $('status-text')
  const err = $('error-box')
  const btnStart = $('btn-start')
  const btnStop = $('btn-stop')
  const btnUi = $('btn-ui')

  dot.className = 'dot ' + status.state
  text.textContent = STATUS_TEXT[status.state] || status.state
  if (status.state === 'running') text.textContent += ` · ${status.url}`
  if (status.state === 'error') text.textContent += '（详见日志）'

  if (status.error) {
    err.textContent = status.error
    err.classList.remove('hidden')
  } else {
    err.classList.add('hidden')
  }

  btnStart.disabled = busy || status.state === 'starting' || status.state === 'running'
  btnStop.disabled = busy || status.state === 'stopped'
  btnUi.disabled = busy || status.state === 'stopped'
}

async function refresh() {
  render(await api.status())
}

$('btn-start').addEventListener('click', async () => {
  busy = true
  $('btn-start').disabled = true
  await api.start()
  await refresh()
  busy = false
  await api.openUiWindow()
})

$('btn-stop').addEventListener('click', async () => {
  busy = true
  $('btn-stop').disabled = true
  await api.stop()
  await refresh()
  busy = false
})

$('btn-ui').addEventListener('click', () => api.openUiWindow())
$('btn-browser').addEventListener('click', () => api.openBrowser())
$('btn-logs').addEventListener('click', () => api.openLogs())
$('btn-data').addEventListener('click', () => api.openDataDir())

api.onStatus((s) => render(s))

refresh()
