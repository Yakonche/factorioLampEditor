const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('factorioLampEditor', {
  copyText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  readText: () => ipcRenderer.invoke('clipboard:read-text'),
  saveBlueprint: (text, suggestedName) => ipcRenderer.invoke('blueprint:save-text', { text, suggestedName }),
  decodeMedia: (request) => ipcRenderer.invoke('media:decode', request),
  inspectMedia: (request) => ipcRenderer.invoke('media:inspect', request),
  decodeAudioNotes: (request) => ipcRenderer.invoke('audio:decode-notes', request),
  getFactorioSpeakerSoundStatus: () => ipcRenderer.invoke('factorio-sounds:status'),
  selectFactorioSpeakerSounds: () => ipcRenderer.invoke('factorio-sounds:select'),
  readFactorioSpeakerSound: (instrument, pitch) => ipcRenderer.invoke('factorio-sounds:read', { instrument, pitch }),
  getFactorioTextureStatus: () => ipcRenderer.invoke('factorio-textures:status'),
  selectFactorioTextures: () => ipcRenderer.invoke('factorio-textures:select'),
  readFactorioTexture: (textureId) => ipcRenderer.invoke('factorio-textures:read', { textureId }),
  listSystemFonts: () => ipcRenderer.invoke('fonts:list-system'),
  getEmojiAsset: (provider, codepoint) => ipcRenderer.invoke('emoji-assets:get', { provider, codepoint }),
});
