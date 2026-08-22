const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('factorioLampEditor', {
  copyText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  saveBlueprint: (text, suggestedName) => ipcRenderer.invoke('blueprint:save-text', { text, suggestedName }),
  decodeMedia: (request) => ipcRenderer.invoke('media:decode', request),
  decodeAudioNotes: (request) => ipcRenderer.invoke('audio:decode-notes', request),
});
