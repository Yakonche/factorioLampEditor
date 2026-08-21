const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  decodeMedia,
  DEFAULT_MAX_MEDIA_DIMENSION,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_FPS,
  normalizeLegacyAnimatedGif,
} = require('../electron/media.cjs');

const ffmpegPath = require('ffmpeg-static');

const validateDecoded = (decoded) => {
  assert.ok(decoded.width >= 1 && decoded.width <= MAX_MEDIA_DIMENSION);
  assert.ok(decoded.height >= 1 && decoded.height <= MAX_MEDIA_DIMENSION);
  assert.ok(decoded.sampledFps <= MAX_MEDIA_FPS);
  assert.ok(decoded.factorioFps <= MAX_MEDIA_FPS + 1e-9);
  assert.equal(decoded.firstFrame.length, decoded.width * decoded.height);
  assert.equal(decoded.frameCount, decoded.transitions.length + 1);
  assert.equal(decoded.frameThumbnails.length, decoded.frameCount);
  decoded.frameThumbnails.forEach((thumbnail) => {
    assert.ok(thumbnail.width >= 1 && thumbnail.height >= 1);
    assert.equal(thumbnail.rgba.length, thumbnail.width * thumbnail.height * 4);
  });
  assert.ok(decoded.sampledFrameCount >= decoded.frameCount);
  assert.ok(decoded.firstDurationTicks >= 2);
  const frame = decoded.firstFrame.slice();
  let durationTicks = decoded.firstDurationTicks;
  for (const transition of decoded.transitions) {
    assert.equal(transition.indices.length, transition.colors.length);
    assert.ok(transition.indices.length > 0, 'Duplicate frames must be merged into duration, not stored.');
    assert.ok(transition.durationTicks >= 2);
    const seen = new Set();
    for (let index = 0; index < transition.indices.length; index++) {
      const pixelIndex = transition.indices[index];
      assert.ok(pixelIndex < frame.length);
      assert.ok(!seen.has(pixelIndex));
      seen.add(pixelIndex);
      assert.notEqual(frame[pixelIndex], transition.colors[index]);
      frame[pixelIndex] = transition.colors[index];
    }
    durationTicks += transition.durationTicks;
  }
  assert.equal(durationTicks, decoded.durationTicks);
};

(async () => {
  const morningPath = path.resolve(__dirname, '..', 'release', 'morning.gif');
  const morningBytes = fs.readFileSync(morningPath);
  const morning = await decodeMedia({
    sourceName: 'morning.gif',
    bytes: morningBytes,
    fpsLimit: 30,
  }, { ffmpegPath });
  validateDecoded(morning);
  assert.deepEqual([morning.sourceWidth, morning.sourceHeight], [220, 220]);
  assert.deepEqual([morning.width, morning.height], [220, 220]);
  assert.ok(morning.sampledFps <= 10 && morning.sampledFps > 9);
  assert.ok(morning.frameCount > 50, 'morning.gif should retain its ordered animation frames.');

  const catPath = path.resolve(__dirname, '..', 'release', 'cat-fucked.gif');
  const catBytes = fs.readFileSync(catPath);
  const normalizedCat = normalizeLegacyAnimatedGif(catBytes);
  assert.equal(normalizedCat.repaired, true, 'The legacy multi-image GIF should receive missing frame timing blocks.');
  assert.ok(normalizedCat.frameCount > 100, 'The legacy GIF should expose all embedded image descriptors.');
  const cat = await decodeMedia({
    sourceName: 'cat-fucked.gif',
    bytes: catBytes,
    fpsLimit: 30,
  }, { ffmpegPath });
  validateDecoded(cat);
  assert.equal(cat.gifTimingRepaired, true);
  assert.ok(cat.frameCount > 100, 'cat-fucked.gif should no longer collapse to its first frame.');

  const morningAtFiveFps = await decodeMedia({
    sourceName: 'morning.gif',
    bytes: morningBytes,
    fpsLimit: 5,
  }, { ffmpegPath });
  validateDecoded(morningAtFiveFps);
  assert.equal(morningAtFiveFps.sampledFps, 5);
  assert.equal(morningAtFiveFps.factorioFps, 5);
  assert.ok(morningAtFiveFps.frameCount < morning.frameCount);

  const optimizedMorning = await decodeMedia({
    sourceName: 'morning.gif',
    bytes: morningBytes,
    fpsLimit: 5,
    maxDimension: 512,
    targetWidth: 110,
    targetHeight: 110,
    colorMode: 'monochrome',
    monochromeThreshold: 128,
  }, { ffmpegPath });
  validateDecoded(optimizedMorning);
  assert.deepEqual([optimizedMorning.width, optimizedMorning.height], [110, 110]);
  assert.equal(optimizedMorning.colorMode, 'monochrome');
  assert.ok(optimizedMorning.firstFrame.every(pixel => pixel === 0 || pixel === 0xffffffff));

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'factorio-lamp-decoder-test-'));
  const oversizedPath = path.join(temporaryDirectory, 'oversized.mp4');
  try {
    execFileSync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=size=2048x1024:rate=60:duration=0.2',
      '-an',
      '-c:v', 'mpeg4',
      '-q:v', '3',
      '-y',
      oversizedPath,
    ], { windowsHide: true });
    const oversized = await decodeMedia({
      sourceName: 'oversized.mp4',
      bytes: fs.readFileSync(oversizedPath),
      fpsLimit: 60,
    }, { ffmpegPath });
    validateDecoded(oversized);
    assert.deepEqual([oversized.sourceWidth, oversized.sourceHeight], [2048, 1024]);
    assert.deepEqual([oversized.width, oversized.height], [512, 256]);
    assert.equal(DEFAULT_MAX_MEDIA_DIMENSION, 512);
    assert.equal(oversized.sampledFps, 30);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    morning: {
      dimensions: `${morning.width}x${morning.height}`,
      sampledFrames: morning.sampledFrameCount,
      uniqueFrames: morning.frameCount,
      fps: morning.factorioFps,
      durationTicks: morning.durationTicks,
      deltaPixels: morning.transitions.reduce((total, transition) => total + transition.indices.length, 0),
    },
    morningAtFiveFps: {
      sampledFrames: morningAtFiveFps.sampledFrameCount,
      uniqueFrames: morningAtFiveFps.frameCount,
      fps: morningAtFiveFps.factorioFps,
    },
    repairedLegacyGif: {
      frames: cat.frameCount,
      fps: cat.factorioFps,
    },
    optimizedMorning: {
      dimensions: `${optimizedMorning.width}x${optimizedMorning.height}`,
      frames: optimizedMorning.frameCount,
      mode: optimizedMorning.colorMode,
    },
    maximums: {
      fps: MAX_MEDIA_FPS,
      dimension: MAX_MEDIA_DIMENSION,
      defaultDimension: DEFAULT_MAX_MEDIA_DIMENSION,
    },
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
