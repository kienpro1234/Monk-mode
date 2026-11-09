const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monkDesktopAPI', {
  isElectron: true,
  loadDB: () => ipcRenderer.invoke('db:load'),
  saveDB: (data) => ipcRenderer.invoke('db:save', data),
  setMonkLock: (payload) => ipcRenderer.invoke('os:set-monk-lock', payload),
  setAlarmHijack: (active) => ipcRenderer.invoke('os:set-alarm-hijack', active),
  setWallpaperDataUrl: (dataUrl) => ipcRenderer.invoke('os:set-wallpaper-dataurl', dataUrl),
  restoreWallpaper: () => ipcRenderer.invoke('os:restore-wallpaper'),
  listRunningApps: () => ipcRenderer.invoke('os:list-running-apps'),
  getScreenSources: () => ipcRenderer.invoke('os:get-screen-sources'),
  notify: (payload) => ipcRenderer.invoke('os:notify', payload),
  exportScrollPdf: (payload) => ipcRenderer.invoke('os:export-scroll-pdf', payload),
  forceQuitDev: () => ipcRenderer.invoke('os:force-quit-dev'),

  onWindowFocusChanged: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('window:focus-changed', listener);
    return () => ipcRenderer.removeListener('window:focus-changed', listener);
  },
  onCloseBlocked: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('os:close-blocked', listener);
    return () => ipcRenderer.removeListener('os:close-blocked', listener);
  },
  onProcessBlocked: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('os:process-blocked', listener);
    return () => ipcRenderer.removeListener('os:process-blocked', listener);
  },
  onDevEmergencyUnlock: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('os:dev-emergency-unlock', listener);
    return () => ipcRenderer.removeListener('os:dev-emergency-unlock', listener);
  },
});
