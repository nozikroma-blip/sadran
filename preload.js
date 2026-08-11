const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  loadLegacyData: () => ipcRenderer.invoke('legacy:load'),
  archiveLegacyData: () => ipcRenderer.invoke('legacy:archive'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // Помощник по задачам. Ключ остаётся в main-процессе и в интерфейс не возвращается.
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    save: (settings) => ipcRenderer.invoke('ai:save', settings),
    forget: () => ipcRenderer.invoke('ai:forget'),
    transcribe: (buffer) => ipcRenderer.invoke('ai:transcribe', buffer),
    extract: (params) => ipcRenderer.invoke('ai:extract', params)
  },

  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (fn) => ipcRenderer.on('update:available', (_e, v) => fn(v)),
    onProgress: (fn) => ipcRenderer.on('update:progress', (_e, p) => fn(p)),
    onReady: (fn) => ipcRenderer.on('update:ready', (_e, v) => fn(v))
  }
});
