const { app, BrowserWindow, clipboard, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const { decodeMedia } = require('./media.cjs');
const { decodeAudioNotes } = require('./audio.cjs');

let mainWindow;

// Full-resolution Bad Apple exports can hold hundreds of thousands of sparse
// ROM entities before streaming compression. This only raises V8's ceiling;
// it does not reserve or consume 6 GiB during ordinary editing.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=6144');

function getFfmpegPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : require('ffmpeg-static');
}

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app-icon.png')
    : path.join(__dirname, '..', 'public', 'favicon', 'android-chrome-512x512.png');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Factorio Lamp Editor',
    icon: getIconPath(),
    backgroundColor: '#111827',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.setAppUserModelId('com.jojkos.factoriolampeditor');

ipcMain.handle('clipboard:write-text', (_event, text) => {
  if (typeof text !== 'string' || text.length > 250_000_000) {
    throw new TypeError('Clipboard content must be a reasonably sized string.');
  }
  clipboard.writeText(text);
  const copiedText = clipboard.readText();
  if (copiedText.length !== text.length || copiedText !== text) {
    throw new Error(`Clipboard verification failed (${copiedText.length} of ${text.length} characters copied).`);
  }
  return { length: copiedText.length };
});

ipcMain.handle('media:decode', (_event, request) => decodeMedia(request, {
  ffmpegPath: getFfmpegPath(),
}));

ipcMain.handle('audio:decode-notes', (_event, request) => decodeAudioNotes(request, {
  ffmpegPath: getFfmpegPath(),
}));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
