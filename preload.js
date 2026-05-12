const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readFolder: (path) => ipcRenderer.invoke('read-folder', path),
  readTextFile: (path) => ipcRenderer.invoke('read-text-file', path),
  printTabs: (printData) => ipcRenderer.invoke('print-tabs', printData),
  getPrinters: () => ipcRenderer.invoke('get-printers')
});
