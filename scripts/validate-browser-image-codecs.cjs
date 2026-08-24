const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ffmpegPath = require('ffmpeg-static');
const runFfmpeg = args => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
  windowsHide: true,
  stdio: 'pipe',
});

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-browser-codecs-'));
  try {
    const apngPath = path.join(directory, 'test.apng');
    const animatedWebpPath = path.join(directory, 'test-animated.webp');
    const staticWebpPath = path.join(directory, 'test-static.webp');
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=8x8:rate=2:duration=1', '-plays', '0', apngPath]);
    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=8x8:rate=2:duration=1', '-loop', '0', animatedWebpPath]);
    runFfmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=8x8:d=0.1', '-frames:v', '1', staticWebpPath]);

    const harnessPath = path.resolve(__dirname, '..', 'node_modules', '.cache', 'factorio-lamp-browser-codec-test.js');
    const htmlPath = path.join(directory, 'index.html');
    await fs.writeFile(htmlPath, `<!doctype html><script src="file:///${harnessPath.replace(/\\/g, '/')}"></script>`, 'utf8');
    await app.whenReady();
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    await window.loadFile(htmlPath);

    const validate = async (filePath, mimeType) => {
      const base64 = (await fs.readFile(filePath)).toString('base64');
      return window.webContents.executeJavaScript(
        `window.runBrowserImageCodecTest(${JSON.stringify(base64)}, ${JSON.stringify(mimeType)}, ${JSON.stringify(path.basename(filePath))})`,
        true,
      );
    };
    const apng = await validate(apngPath, 'image/png');
    const animatedWebp = await validate(animatedWebpPath, 'image/webp');
    const staticWebp = await validate(staticWebpPath, 'image/webp');
    assert.ok(apng.sourceFrameCount >= 2 && apng.decodedFrameCount >= 2);
    assert.ok(animatedWebp.sourceFrameCount >= 2 && animatedWebp.decodedFrameCount >= 2);
    assert.equal(staticWebp.sourceFrameCount, 1);
    assert.equal(staticWebp.decodedFrameCount, 1);
    assert.ok(apng.hasVisiblePixels && animatedWebp.hasVisiblePixels && staticWebp.hasVisiblePixels);
    window.destroy();
    console.log(JSON.stringify({ apng, animatedWebp, staticWebp }));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    app.quit();
  }
}

main().catch(error => {
  console.error(error);
  app.exit(1);
});
