const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
// 16 kHz keeps Factorio's highest native melodic note (E8, ~5.27 kHz)
// below Nyquist. A 4,096-sample window retains the former low-note frequency
// resolution while covering the complete F2-E8 native instrument range.
const AUDIO_SAMPLE_RATE = 16_000;
const FFT_SIZE = 4_096;
const MIN_NOTES_PER_SECOND = 1;
const MAX_NOTES_PER_SECOND = 60;
const PIANO_FIRST_MIDI_NOTE = 53; // F3, Factorio piano pitch 1.
const PIANO_NOTE_COUNT = 48; // F3 through E7.
const DETECTION_FIRST_MIDI_NOTE = 41; // F2, lowest native melodic note.
const DETECTION_LAST_MIDI_NOTE = 112; // E8, highest native melodic note.
const SILENCE_RMS = 0.012;

function fftRealMagnitudes(samples) {
  const size = samples.length;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < size; index++) {
    // Hann window prevents a strong note from leaking into distant bins.
    real[index] = samples[index] * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (size - 1)));
  }

  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      const realValue = real[index];
      real[index] = real[reversed];
      real[reversed] = realValue;
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const cosineStep = Math.cos(angle);
    const sineStep = Math.sin(angle);
    for (let offset = 0; offset < size; offset += length) {
      let cosine = 1;
      let sine = 0;
      for (let index = 0; index < length / 2; index++) {
        const even = offset + index;
        const odd = even + length / 2;
        const oddReal = real[odd] * cosine - imaginary[odd] * sine;
        const oddImaginary = real[odd] * sine + imaginary[odd] * cosine;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextCosine = cosine * cosineStep - sine * sineStep;
        sine = cosine * sineStep + sine * cosineStep;
        cosine = nextCosine;
      }
    }
  }

  const magnitudes = new Float64Array(size / 2);
  for (let index = 1; index < magnitudes.length; index++) {
    magnitudes[index] = real[index] * real[index] + imaginary[index] * imaginary[index];
  }
  return magnitudes;
}

function detectDominantMidi(samples, sampleRate) {
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms < SILENCE_RMS) return undefined;

  const magnitudes = fftRealMagnitudes(samples);
  let bestMidi;
  let bestEnergy = 0;
  for (let midi = DETECTION_FIRST_MIDI_NOTE; midi <= DETECTION_LAST_MIDI_NOTE; midi++) {
    const frequency = 440 * (2 ** ((midi - 69) / 12));
    const exactBin = frequency * samples.length / sampleRate;
    const centerBin = Math.round(exactBin);
    let energy = 0;
    // A small neighborhood makes the detector tolerant of tuning and FFT-bin boundaries.
    for (let bin = Math.max(1, centerBin - 1); bin <= Math.min(magnitudes.length - 1, centerBin + 1); bin++) {
      energy += magnitudes[bin];
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestMidi = midi;
    }
  }
  return bestMidi;
}

function detectFactorioPianoPitch(samples, sampleRate) {
  const midi = detectDominantMidi(samples, sampleRate);
  return midi === undefined
    ? undefined
    : Math.max(1, Math.min(PIANO_NOTE_COUNT, midi - PIANO_FIRST_MIDI_NOTE + 1));
}

async function probeAudio(inputPath, ffmpegPath) {
  let stderr = '';
  try {
    const result = await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-i', inputPath,
      '-map', '0:a:0',
      '-frames:a', '1',
      '-f', 'null',
      '-',
    ], {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    stderr = String(result.stderr ?? '');
  } catch (error) {
    stderr = String(error?.stderr ?? '');
  }
  const audioLine = stderr.split(/\r?\n/).find(line => /Stream #\S+: Audio:/.test(line));
  if (!audioLine) throw new Error('No readable audio stream was found in this file.');
  const sourceChannels = /\bmono\b/i.test(audioLine) ? 1 : 2;
  return { sourceChannels };
}

function decodeStereoPcm(inputPath, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const decoder = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-map', '0:a:0',
      '-vn', '-sn', '-dn',
      '-ac', '2',
      '-ar', String(AUDIO_SAMPLE_RATE),
      '-f', 's16le',
      'pipe:1',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let stderr = '';
    decoder.stdout.on('data', chunk => chunks.push(chunk));
    decoder.stderr.setEncoding('utf8');
    decoder.stderr.on('data', chunk => {
      if (stderr.length < 64_000) stderr += chunk;
    });
    decoder.on('error', reject);
    decoder.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `FFmpeg stopped with exit code ${code}.`));
        return;
      }
      const pcm = Buffer.concat(chunks);
      if (pcm.length < 4) {
        reject(new Error('FFmpeg did not decode any audio sample.'));
        return;
      }
      resolve(pcm);
    });
  });
}

function extractNoteEvents(pcm, notesPerSecond) {
  const frameCount = Math.floor(pcm.length / 4);
  const hopFrames = Math.max(1, Math.round(AUDIO_SAMPLE_RATE / notesPerSecond));
  const leftWindow = new Float64Array(FFT_SIZE);
  const rightWindow = new Float64Array(FFT_SIZE);
  const events = [];
  let leftNoteCount = 0;
  let rightNoteCount = 0;

  for (let startFrame = 0; startFrame < frameCount; startFrame += hopFrames) {
    leftWindow.fill(0);
    rightWindow.fill(0);
    const availableFrames = Math.min(FFT_SIZE, frameCount - startFrame);
    for (let offset = 0; offset < availableFrames; offset++) {
      const byteOffset = (startFrame + offset) * 4;
      leftWindow[offset] = pcm.readInt16LE(byteOffset) / 32768;
      rightWindow[offset] = pcm.readInt16LE(byteOffset + 2) / 32768;
    }
    const leftMidi = detectDominantMidi(leftWindow, AUDIO_SAMPLE_RATE);
    const rightMidi = detectDominantMidi(rightWindow, AUDIO_SAMPLE_RATE);
    if (leftMidi === undefined && rightMidi === undefined) continue;
    if (leftMidi !== undefined) leftNoteCount++;
    if (rightMidi !== undefined) rightNoteCount++;
    events.push({
      tick: Math.round(startFrame * 60 / AUDIO_SAMPLE_RATE),
      ...(leftMidi !== undefined ? {
        leftMidi,
        leftPitch: Math.max(1, Math.min(PIANO_NOTE_COUNT, leftMidi - PIANO_FIRST_MIDI_NOTE + 1)),
      } : {}),
      ...(rightMidi !== undefined ? {
        rightMidi,
        rightPitch: Math.max(1, Math.min(PIANO_NOTE_COUNT, rightMidi - PIANO_FIRST_MIDI_NOTE + 1)),
      } : {}),
    });
  }

  return {
    durationTicks: Math.max(2, Math.round(frameCount * 60 / AUDIO_SAMPLE_RATE)),
    durationSeconds: frameCount / AUDIO_SAMPLE_RATE,
    leftNoteCount,
    rightNoteCount,
    events,
  };
}

async function decodeAudioNotes(request, binaries = {}) {
  if (!request || typeof request.sourceName !== 'string') {
    throw new TypeError('An audio filename is required.');
  }
  const notesPerSecond = Math.max(
    MIN_NOTES_PER_SECOND,
    Math.min(MAX_NOTES_PER_SECOND, Number(request.notesPerSecond) || 4),
  );
  const bytes = request.bytes instanceof ArrayBuffer
    ? Buffer.from(request.bytes)
    : ArrayBuffer.isView(request.bytes)
      ? Buffer.from(request.bytes.buffer, request.bytes.byteOffset, request.bytes.byteLength)
      : Buffer.isBuffer(request.bytes)
        ? request.bytes
        : null;
  if (!bytes?.length) throw new TypeError('The selected audio file is empty.');

  const ffmpegPath = binaries.ffmpegPath || require('ffmpeg-static');
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-audio-'));
  const sourceExtension = path.extname(request.sourceName).replace(/[^.a-z0-9]/gi, '').slice(0, 12) || '.audio';
  const inputPath = path.join(temporaryDirectory, `input${sourceExtension}`);
  try {
    await fs.writeFile(inputPath, bytes);
    const probe = await probeAudio(inputPath, ffmpegPath);
    const pcm = await decodeStereoPcm(inputPath, ffmpegPath);
    return {
      sourceName: path.basename(request.sourceName),
      sourceChannels: probe.sourceChannels,
      sampleRate: AUDIO_SAMPLE_RATE,
      notesPerSecond,
      ...extractNoteEvents(pcm, notesPerSecond),
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  AUDIO_SAMPLE_RATE,
  FFT_SIZE,
  MAX_NOTES_PER_SECOND,
  MIN_NOTES_PER_SECOND,
  PIANO_FIRST_MIDI_NOTE,
  PIANO_NOTE_COUNT,
  decodeAudioNotes,
  detectDominantMidi,
  detectFactorioPianoPitch,
  extractNoteEvents,
};
