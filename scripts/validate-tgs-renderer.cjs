const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { app, BrowserWindow } = require('electron');

const animation = {
  v: '5.7.4', fr: 30, ip: 0, op: 2, w: 8, h: 8, nm: 'TGS renderer test', ddd: 0, assets: [],
  layers: [{
    ddd: 0, ind: 1, ty: 1, nm: 'Red solid', sr: 1,
    ks: {
      o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
      p: { a: 0, k: [4, 4, 0] }, a: { a: 0, k: [4, 4, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0, sw: 8, sh: 8, sc: '#ff0000', ip: 0, op: 2, st: 0, bm: 0,
  }],
};

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-tgs-renderer-'));
  try {
    const harnessPath = path.resolve(__dirname, '..', 'node_modules', '.cache', 'factorio-lamp-tgs-renderer-test.js');
    const htmlPath = path.join(directory, 'index.html');
    await fs.writeFile(htmlPath, `<!doctype html><body><script src="file:///${harnessPath.replace(/\\/g, '/')}"></script></body>`, 'utf8');
    await app.whenReady();
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await window.loadFile(htmlPath);
    const base64 = gzipSync(JSON.stringify(animation)).toString('base64');
    const result = await window.webContents.executeJavaScript(`window.runTgsRendererTest(${JSON.stringify(base64)})`, true);
    assert.equal(result.sourceWidth, 8);
    assert.equal(result.sourceHeight, 8);
    assert.ok(result.sampledFrameCount >= 2);
    assert.ok(result.hasVisiblePixels);
    window.destroy();
    console.log(JSON.stringify(result));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    app.quit();
  }
}

main().catch(error => {
  console.error(error);
  app.exit(1);
});
