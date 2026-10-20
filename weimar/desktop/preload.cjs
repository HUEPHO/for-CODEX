const { contextBridge, ipcRenderer } = require('electron');
const invoke = (method, ...args) => ipcRenderer.invoke('weimar:steam', method, ...args);
contextBridge.exposeInMainWorld('weimarSteam', {
  status: () => invoke('status'),
  create: (scenario) => invoke('create', scenario),
  resume: (save) => invoke('resume', save),
  list: () => invoke('list'),
  join: (id) => invoke('join', id),
  leave: () => invoke('leave'),
  invite: () => invoke('invite'),
  request: (request) => invoke('request', request),
  exportSave: () => invoke('exportSave'),
  subscribe: (listener) => {
    const receive = (_event, status) => listener(status);
    ipcRenderer.on('weimar:steam-status', receive);
    return () => ipcRenderer.removeListener('weimar:steam-status', receive);
  },
});
