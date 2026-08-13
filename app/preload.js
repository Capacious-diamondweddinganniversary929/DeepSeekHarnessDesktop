'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  start: () => ipcRenderer.invoke('start'),
  stop: () => ipcRenderer.invoke('stop'),
  status: () => ipcRenderer.invoke('status'),
  openUiWindow: () => ipcRenderer.invoke('open-ui-window'),
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  openLogs: () => ipcRenderer.invoke('open-logs'),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
  onStatus: (cb) => ipcRenderer.on('status-changed', (_e, s) => cb(s)),
})
