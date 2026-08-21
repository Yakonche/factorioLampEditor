const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_MEDIA_DIMENSION = 512;
const MAX_MEDIA_DIMENSION = 1024;
const MAX_MEDIA_FPS = 30;
const MEDIA_THUMBNAIL_DIMENSION = 56;
const LEGACY_GIF_FRAME_DELAY_CENTISECONDS = 10;

/**
 * Some old encoders write several GIF image descriptors without a Graphic
 * Control Extension (GCE). Browsers historically treated those descriptors as
 * animation frames, while FFmpeg correctly treats them as one composed image.
 * Insert a conservative 10 FPS delay only when the file contains multiple
 * image descriptors and no GCE at all. Standards-compliant GIFs are returned
 * byte-for-byte unchanged.
 */
function normalizeLegacyAnimatedGif(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 13 || !/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) {
    return { bytes, repaired: false, frameCount: 0 };
  }

  let offset = 6;
  const logicalScreenPacked = bytes[offset + 4];
  offset += 7;
  if (logicalScreenPacked & 0x80) {
    offset += 3 * (2 ** ((logicalScreenPacked & 0x07) + 1));
  }

  const imageOffsets = [];
  let graphicControlCount = 0;
  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const length = bytes[offset++];
      if (length === 0) return true;
      offset += length;
      if (offset > bytes.length) return false;
    }
    return false;
  };

  while (offset < bytes.length) {
    const blockOffset = offset;
    const introducer = bytes[offset++];
    if (introducer === 0x3b) break;
    if (introducer === 0x21) {
      if (offset >= bytes.length) return { bytes, repaired: false, frameCount: imageOffsets.length };
      const label = bytes[offset++];
      if (label === 0xf9) graphicControlCount++;
      if (!skipSubBlocks()) return { bytes, repaired: false, frameCount: imageOffsets.length };
      continue;
    }
    if (introducer === 0x2c) {
      imageOffsets.push(blockOffset);
      if (offset + 9 > bytes.length) return { bytes, repaired: false, frameCount: imageOffsets.length };
      const imagePacked = bytes[offset + 8];
      offset += 9;
      if (imagePacked & 0x80) {
        offset += 3 * (2 ** ((imagePacked & 0x07) + 1));
      }
      if (offset >= bytes.length) return { bytes, repaired: false, frameCount: imageOffsets.length };
      offset++; // LZW minimum code size.
      if (!skipSubBlocks()) return { bytes, repaired: false, frameCount: imageOffsets.length };
      continue;
    }
    return { bytes, repaired: false, frameCount: imageOffsets.length };
  }

  if (imageOffsets.length <= 1 || graphicControlCount > 0) {
    return { bytes, repaired: false, frameCount: imageOffsets.length };
  }

  const delay = LEGACY_GIF_FRAME_DELAY_CENTISECONDS;
  const graphicControl = Buffer.from([
    0x21, 0xf9, 0x04, 0x00,
    delay & 0xff, (delay >>> 8) & 0xff,
    0x00, 0x00,
  ]);
  const chunks = [];
  let previousOffset = 0;
  for (const imageOffset of imageOffsets) {
    chunks.push(bytes.subarray(previousOffset, imageOffset), graphicControl);
    previousOffset = imageOffset;
  }
  chunks.push(bytes.subarray(previousOffset));
  return {
    bytes: Buffer.concat(chunks),
    repaired: true,
    frameCount: imageOffsets.length,
  };
}

function parseRate(value) {
  if (typeof value !== 'string') return 0;
  const [numerator, denominator = '1'] = value.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

function sampleDurationTicks(sampleIndex, fps) {
  const start = Math.round(sampleIndex * 60 / fps);
  const end = Math.round((sampleIndex + 1) * 60 / fps);
  return Math.max(2, end - start);
}

function createFrameThumbnail(rgba, width, height) {
  const scale = Math.min(1, MEDIA_THUMBNAIL_DIMENSION / width, MEDIA_THUMBNAIL_DIMENSION / height);
  const thumbnailWidth = Math.max(1, Math.round(width * scale));
  const thumbnailHeight = Math.max(1, Math.round(height * scale));
  const thumbnail = new Uint8Array(thumbnailWidth * thumbnailHeight * 4);
  for (let y = 0; y < thumbnailHeight; y++) {
    const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / thumbnailHeight));
    for (let x = 0; x < thumbnailWidth; x++) {
      const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / thumbnailWidth));
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * thumbnailWidth + x) * 4;
      thumbnail[targetOffset] = rgba[sourceOffset];
      thumbnail[targetOffset + 1] = rgba[sourceOffset + 1];
      thumbnail[targetOffset + 2] = rgba[sourceOffset + 2];
      thumbnail[targetOffset + 3] = rgba[sourceOffset + 3];
    }
  }
  return { width: thumbnailWidth, height: thumbnailHeight, rgba: thumbnail };
}

async function probeMedia(inputPath, ffmpegPath) {
  const { stderr } = await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-i', inputPath,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-f', 'null',
    '-',
  ], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const videoLine = stderr
    .split(/\r?\n/)
    .find(line => /Stream #\S+: Video:/.test(line));
  if (!videoLine) throw new Error('No readable video stream was found in this file.');
  const dimensions = [...videoLine.matchAll(/(\d{1,5})x(\d{1,5})/g)]
    .map(match => ({ width: Number(match[1]), height: Number(match[2]) }))
    .find(size => size.width > 0 && size.height > 0);
  if (!dimensions) throw new Error('FFmpeg could not determine the video dimensions.');
  const fpsMatch = videoLine.match(/(\d+(?:\.\d+)?)\s*fps\b/i)
    ?? videoLine.match(/(\d+(?:\.\d+)?)\s*tbr\b/i);
  const rotationMatch = stderr.match(/rotation of\s+(-?\d+(?:\.\d+)?)\s+degrees/i)
    ?? stderr.match(/rotate\s*:\s*(-?\d+(?:\.\d+)?)/i);
  const rotation = Number(rotationMatch?.[1] ?? 0);
  const quarterTurn = Math.abs(rotation) % 180 === 90;
  const sourceWidth = quarterTurn ? dimensions.height : dimensions.width;
  const sourceHeight = quarterTurn ? dimensions.width : dimensions.height;
  const sourceFps = Number(fpsMatch?.[1] ?? MAX_MEDIA_FPS) || MAX_MEDIA_FPS;
  return { sourceWidth, sourceHeight, sourceFps };
}

function decodeFrames(inputPath, width, height, fps, ffmpegPath, pixelOptions = {}) {
  return new Promise((resolve, reject) => {
    const frameByteLength = width * height * 4;
    const decoder = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-map', '0:v:0',
      '-an', '-sn', '-dn',
      '-vf', `fps=${fps.toFixed(6)},scale=${width}:${height}:flags=lanczos,format=rgba`,
      '-pix_fmt', 'rgba',
      '-f', 'rawvideo',
      'pipe:1',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let pending = Buffer.alloc(0);
    let stderr = '';
    let sampleIndex = 0;
    let firstFrame;
    let firstDurationTicks = 0;
    let previousFrame;
    const transitions = [];
    const frameThumbnails = [];
    const colorMode = ['grayscale', 'monochrome'].includes(pixelOptions.colorMode)
      ? pixelOptions.colorMode
      : 'full';
    const monochromeThreshold = Math.max(0, Math.min(255, Math.round(Number(pixelOptions.monochromeThreshold) || 128)));
    const differenceThreshold = Math.max(0, Math.min(255, Math.round(Number(pixelOptions.differenceThreshold) || 0)));

    const processFrame = (rgba) => {
      const pixels = new Uint32Array(width * height);
      for (let index = 0; index < pixels.length; index++) {
        const offset = index * 4;
        if (rgba[offset + 3] > 128) {
          const red = rgba[offset];
          const green = rgba[offset + 1];
          const blue = rgba[offset + 2];
          if (colorMode === 'monochrome') {
            const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
            pixels[index] = luminance >= monochromeThreshold ? 0xffffffff : 0;
          } else if (colorMode === 'grayscale') {
            const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
            pixels[index] = (0xff000000 | (luminance << 16) | (luminance << 8) | luminance) >>> 0;
          } else {
            pixels[index] = (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0;
          }
        }
      }
      if (previousFrame && differenceThreshold > 0 && colorMode !== 'monochrome') {
        for (let index = 0; index < pixels.length; index++) {
          const current = pixels[index];
          const previous = previousFrame[index];
          if (!current || !previous) continue;
          const maximumChannelDifference = Math.max(
            Math.abs((current & 0xff) - (previous & 0xff)),
            Math.abs(((current >>> 8) & 0xff) - ((previous >>> 8) & 0xff)),
            Math.abs(((current >>> 16) & 0xff) - ((previous >>> 16) & 0xff)),
          );
          if (maximumChannelDifference <= differenceThreshold) pixels[index] = previous;
        }
      }
      const durationTicks = sampleDurationTicks(sampleIndex, fps);
      sampleIndex++;
      if (!previousFrame) {
        firstFrame = pixels;
        previousFrame = pixels;
        firstDurationTicks = durationTicks;
        frameThumbnails.push(createFrameThumbnail(rgba, width, height));
        return;
      }

      const changedIndices = [];
      const changedColors = [];
      for (let index = 0; index < pixels.length; index++) {
        if (pixels[index] === previousFrame[index]) continue;
        changedIndices.push(index);
        changedColors.push(pixels[index]);
      }
      if (!changedIndices.length) {
        if (transitions.length) transitions[transitions.length - 1].durationTicks += durationTicks;
        else firstDurationTicks += durationTicks;
        return;
      }
      transitions.push({
        indices: Uint32Array.from(changedIndices),
        colors: Uint32Array.from(changedColors),
        durationTicks,
      });
      frameThumbnails.push(createFrameThumbnail(rgba, width, height));
      previousFrame = pixels;
    };

    decoder.stdout.on('data', (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameByteLength) {
        processFrame(pending.subarray(0, frameByteLength));
        pending = pending.subarray(frameByteLength);
      }
    });
    decoder.stderr.setEncoding('utf8');
    decoder.stderr.on('data', (chunk) => {
      if (stderr.length < 64_000) stderr += chunk;
    });
    decoder.on('error', reject);
    decoder.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `FFmpeg stopped with exit code ${code}.`));
        return;
      }
      if (!firstFrame || sampleIndex === 0) {
        reject(new Error('FFmpeg did not decode any video frame.'));
        return;
      }
      const durationTicks = firstDurationTicks + transitions.reduce(
        (total, transition) => total + transition.durationTicks,
        0,
      );
      resolve({
        firstFrame,
        firstDurationTicks,
        transitions,
        frameThumbnails,
        sampledFrameCount: sampleIndex,
        frameCount: transitions.length + 1,
        durationTicks,
      });
    });
  });
}

async function decodeMedia(request, binaries = {}) {
  if (!request || typeof request.sourceName !== 'string') {
    throw new TypeError('A media filename is required.');
  }
  const ffmpegPath = binaries.ffmpegPath || require('ffmpeg-static');
  const fpsLimit = Math.max(0.1, Math.min(MAX_MEDIA_FPS, Number(request.fpsLimit) || MAX_MEDIA_FPS));
  const maxDimension = Math.max(
    1,
    Math.min(MAX_MEDIA_DIMENSION, Math.floor(Number(request.maxDimension) || DEFAULT_MAX_MEDIA_DIMENSION)),
  );
  const requestedWidth = Number.isFinite(Number(request.targetWidth))
    ? Math.max(1, Math.min(maxDimension, Math.round(Number(request.targetWidth))))
    : null;
  const requestedHeight = Number.isFinite(Number(request.targetHeight))
    ? Math.max(1, Math.min(maxDimension, Math.round(Number(request.targetHeight))))
    : null;
  const colorMode = ['grayscale', 'monochrome'].includes(request.colorMode) ? request.colorMode : 'full';
  const monochromeThreshold = Math.max(0, Math.min(255, Math.round(Number(request.monochromeThreshold) || 128)));
  const differenceThreshold = Math.max(0, Math.min(255, Math.round(Number(request.differenceThreshold) || 0)));
  const bytes = request.bytes instanceof ArrayBuffer
    ? Buffer.from(request.bytes)
    : ArrayBuffer.isView(request.bytes)
      ? Buffer.from(request.bytes.buffer, request.bytes.byteOffset, request.bytes.byteLength)
      : Buffer.isBuffer(request.bytes)
        ? request.bytes
        : null;
  if (!bytes?.length) throw new TypeError('The selected media file is empty.');

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-media-'));
  const sourceExtension = path.extname(request.sourceName).replace(/[^.a-z0-9]/gi, '').slice(0, 12) || '.media';
  const inputPath = path.join(temporaryDirectory, `input${sourceExtension}`);
  try {
    const normalizedGif = sourceExtension.toLowerCase() === '.gif'
      ? normalizeLegacyAnimatedGif(bytes)
      : { bytes, repaired: false, frameCount: 0 };
    await fs.writeFile(inputPath, normalizedGif.bytes);
    const probe = await probeMedia(inputPath, ffmpegPath);
    const scale = requestedWidth || requestedHeight
      ? Math.min(
          maxDimension / probe.sourceWidth,
          maxDimension / probe.sourceHeight,
          requestedWidth ? requestedWidth / probe.sourceWidth : Number.POSITIVE_INFINITY,
          requestedHeight ? requestedHeight / probe.sourceHeight : Number.POSITIVE_INFINITY,
        )
      : Math.min(
          1,
          maxDimension / probe.sourceWidth,
          maxDimension / probe.sourceHeight,
        );
    const width = Math.max(1, Math.round(probe.sourceWidth * scale));
    const height = Math.max(1, Math.round(probe.sourceHeight * scale));
    const sampledFps = Math.max(0.1, Math.min(MAX_MEDIA_FPS, fpsLimit, probe.sourceFps || MAX_MEDIA_FPS));
    const decoded = await decodeFrames(inputPath, width, height, sampledFps, ffmpegPath, {
      colorMode,
      monochromeThreshold,
      differenceThreshold,
    });
    return {
      sourceName: path.basename(request.sourceName),
      sourceWidth: probe.sourceWidth,
      sourceHeight: probe.sourceHeight,
      width,
      height,
      sourceFps: probe.sourceFps,
      requestedFpsLimit: fpsLimit,
      colorMode,
      monochromeThreshold,
      differenceThreshold,
      sampledFps,
      factorioFps: decoded.durationTicks > 0
        ? decoded.sampledFrameCount * 60 / decoded.durationTicks
        : sampledFps,
      gifTimingRepaired: normalizedGif.repaired,
      ...decoded,
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  DEFAULT_MAX_MEDIA_DIMENSION,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_FPS,
  MEDIA_THUMBNAIL_DIMENSION,
  LEGACY_GIF_FRAME_DELAY_CENTISECONDS,
  decodeMedia,
  normalizeLegacyAnimatedGif,
  parseRate,
  sampleDurationTicks,
};
