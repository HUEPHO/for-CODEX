const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('worldOrderDesktop', Object.freeze({
  info: () => ipcRenderer.invoke('game:info'),
  start: mode => ipcRenderer.invoke('game:start', mode),
  home: () => ipcRenderer.invoke('game:home'),
  fullscreen: () => ipcRenderer.invoke('game:fullscreen'),
  quit: () => ipcRenderer.invoke('game:quit'),
}));
