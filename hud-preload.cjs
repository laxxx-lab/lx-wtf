'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hud', {
  on(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('hud:event', listener);
    return () => ipcRenderer.removeListener('hud:event', listener);
  }
});
