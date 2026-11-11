// The bridge between our own pages and the main process.
// It is only offered to app://local/ pages. Book and map pages never get it,
// so content inside a book can't shut down the app or read its state.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'app:' && location.host === 'local') {
  contextBridge.exposeInMainWorld('ol', {
    getState: () => ipcRenderer.invoke('get-state'),
    onState: fn => { ipcRenderer.on('state', (_e, s) => fn(s)); },
    command: (name, arg) => ipcRenderer.send('command', name, arg),
  });
}
