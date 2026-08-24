const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { decodeMedia, inspectMedia } = require('../electron/media.cjs');

const ffmpegPath = require('ffmpeg-static');
const runFfmpeg = args => execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
  windowsHide: true,
  stdio: 'pipe',
});

async function validateFile(filePath, expectedFrames = 1) {
  const bytes = await fs.readFile(filePath);
  const sourceName = path.basename(filePath);
  const inspection = await inspectMedia({ sourceName, bytes }, { ffmpegPath });
  assert.equal(inspection.sourceWidth, 8);
  assert.equal(inspection.sourceHeight, 8);
  const decoded = await decodeMedia({
    sourceName,
    bytes,
    fpsLimit: 2,
    maxDimension: 8,
  }, { ffmpegPath });
  assert.equal(decoded.width, 8);
  assert.equal(decoded.height, 8);
  assert.ok(decoded.sampledFrameCount >= expectedFrames);
  return decoded;
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-modern-media-'));
  try {
    const apngPath = path.join(directory, 'test.apng');
    const transparentWebmPath = path.join(directory, 'test-alpha.webm');

    runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=8x8:rate=2:duration=1', '-plays', '0', apngPath]);
    runFfmpeg([
      '-f', 'lavfi',
      '-i', "nullsrc=s=8x8:r=2:d=1,format=rgba,geq=r='if(lt(X,4),255,0)':g=0:b=0:a='if(lt(X,4),255,0)',format=yuva420p",
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
      transparentWebmPath,
    ]);

    await validateFile(apngPath, 2);
    const webm = await validateFile(transparentWebmPath, 2);
    assert.ok(webm.firstFrame.some(pixel => pixel === 0), 'Transparent WebM pixels must remain unlit.');
    assert.ok(webm.firstFrame.some(pixel => pixel !== 0), 'Opaque WebM pixels must remain visible.');
    console.log(JSON.stringify({ apngFfmpeg: true, transparentWebmFfmpeg: true }));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
