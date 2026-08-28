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
const MIN_VOICES_PER_CHANNEL = 1;
const MAX_VOICES_PER_CHANNEL = 4;
const PIANO_FIRST_MIDI_NOTE = 53; // F3, Factorio piano pitch 1.
const PIANO_NOTE_COUNT = 48; // F3 through E7.
const DETECTION_FIRST_MIDI_NOTE = 41; // F2, lowest native melodic note.
const DETECTION_LAST_MIDI_NOTE = 112; // E8, highest native melodic note.
const SILENCE_RMS = 0.012;
// Quiet recordings need a threshold relative to their own peak level. The
// absolute floor still rejects digital silence and very low-level codec noise.
const MIN_ADAPTIVE_SILENCE_RMS = 0.00035;
const PEAK_RELATIVE_SILENCE_RATIO = 10 ** (-54 / 20);
const MIN_ANALYSIS_WINDOWS_PER_SECOND = 16;
const ANALYSIS_OVERSAMPLE = 4;
const ONSET_RMS_RATIO = 1.28;
const MIN_SPECTRAL_FLUX = 0.035;
const SPECTRAL_FLUX_HISTORY_SECONDS = 0.75;

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

function spectralPeakProminence(magnitudes, centerBin) {
  if (centerBin < 2 || centerBin >= magnitudes.length - 2) return 0;
  let peakEnergy = 0;
  for (let bin = centerBin - 1; bin <= centerBin + 1; bin++) {
    peakEnergy += magnitudes[bin];
  }
  let surroundingEnergy = 0;
  let surroundingBins = 0;
  for (let offset = -7; offset <= 7; offset++) {
    if (Math.abs(offset) <= 2) continue;
    const bin = centerBin + offset;
    if (bin < 1 || bin >= magnitudes.length) continue;
    surroundingEnergy += magnitudes[bin];
    surroundingBins++;
  }
  const localFloor = surroundingBins ? surroundingEnergy / surroundingBins : 0;
  return Math.max(0, peakEnergy - localFloor * 3);
}

function midiBinEnergy(magnitudes, midi, sampleCount, sampleRate) {
  const frequency = 440 * (2 ** ((midi - 69) / 12));
  const centerBin = Math.round(frequency * sampleCount / sampleRate);
  const fundamental = spectralPeakProminence(magnitudes, centerBin);
  if (fundamental <= 0) return 0;
  // A small harmonic-consistency bonus helps recover orchestral fundamentals
  // without letting broadband low-frequency noise win every window.
  let harmonicSupport = 0;
  for (let harmonic = 2; harmonic <= 4; harmonic++) {
    const harmonicBin = Math.round(frequency * harmonic * sampleCount / sampleRate);
    if (harmonicBin >= magnitudes.length - 1) break;
    const prominence = spectralPeakProminence(magnitudes, harmonicBin);
    harmonicSupport += Math.min(prominence / fundamental, 1) / harmonic;
  }
  return fundamental * (1 + harmonicSupport * 0.18);
}

function windowRms(samples) {
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / samples.length);
}

function detectMidisFromMagnitudes(magnitudes, samples, sampleRate, maximumVoices) {
  const residual = Float64Array.from(magnitudes);
  const voiceLimit = Math.max(MIN_VOICES_PER_CHANNEL, Math.min(
    MAX_VOICES_PER_CHANNEL,
    Math.round(maximumVoices) || 1,
  ));
  const detected = [];
  let firstEnergy = 0;
  for (let voiceIndex = 0; voiceIndex < voiceLimit; voiceIndex++) {
    let bestMidi;
    let bestEnergy = 0;
    for (let midi = DETECTION_FIRST_MIDI_NOTE; midi <= DETECTION_LAST_MIDI_NOTE; midi++) {
      if (detected.some(note => Math.abs(note - midi) <= 1)) continue;
      const energy = midiBinEnergy(residual, midi, samples.length, sampleRate);
      if (energy > bestEnergy) {
        bestEnergy = energy;
        bestMidi = midi;
      }
    }
    if (bestMidi === undefined) break;
    if (voiceIndex === 0) firstEnergy = bestEnergy;
    // Reject residual noise and quiet harmonics once the principal pitch has
    // been selected. This keeps extra speakers useful for actual polyphony.
    if (bestEnergy < firstEnergy * 0.1) break;
    detected.push(bestMidi);

    const fundamental = 440 * (2 ** ((bestMidi - 69) / 12));
    for (let harmonic = 1; harmonic <= 8; harmonic++) {
      const centerBin = Math.round(fundamental * harmonic * samples.length / sampleRate);
      if (centerBin >= residual.length) break;
      const radius = harmonic <= 2 ? 2 : 1;
      for (let bin = Math.max(1, centerBin - radius); bin <= Math.min(residual.length - 1, centerBin + radius); bin++) {
        residual[bin] = 0;
      }
    }
  }
  return detected.sort((first, second) => first - second);
}

function analyzeDominantMidis(samples, sampleRate, maximumVoices = 1, silenceRms = SILENCE_RMS) {
  const rms = windowRms(samples);
  if (rms < silenceRms) return { midis: [], magnitudes: undefined, rms };
  const magnitudes = fftRealMagnitudes(samples);
  return {
    midis: detectMidisFromMagnitudes(magnitudes, samples, sampleRate, maximumVoices),
    magnitudes,
    rms,
  };
}

function detectDominantMidis(samples, sampleRate, maximumVoices = 1, silenceRms = SILENCE_RMS) {
  return analyzeDominantMidis(samples, sampleRate, maximumVoices, silenceRms).midis;
}

function detectDominantMidi(samples, sampleRate) {
  return detectDominantMidis(samples, sampleRate, 1)[0];
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

function channelPeakLevels(pcm, frameCount) {
  let leftPeak = 0;
  let rightPeak = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const byteOffset = frame * 4;
    leftPeak = Math.max(leftPeak, Math.abs(pcm.readInt16LE(byteOffset) / 32768));
    rightPeak = Math.max(rightPeak, Math.abs(pcm.readInt16LE(byteOffset + 2) / 32768));
  }
  return { leftPeak, rightPeak };
}

function adaptiveSilenceThreshold(peak) {
  return Math.max(
    MIN_ADAPTIVE_SILENCE_RMS,
    Math.min(SILENCE_RMS, peak * PEAK_RELATIVE_SILENCE_RATIO),
  );
}

function normalizedSpectralFlux(current, previous) {
  if (!current || !previous) return 0;
  let positiveChange = 0;
  let currentEnergy = 0;
  const length = Math.min(current.length, previous.length);
  for (let bin = 1; bin < length; bin++) {
    const currentMagnitude = Math.sqrt(current[bin]);
    const previousMagnitude = Math.sqrt(previous[bin]);
    currentEnergy += currentMagnitude;
    positiveChange += Math.max(0, currentMagnitude - previousMagnitude);
  }
  return currentEnergy > 0 ? positiveChange / currentEnergy : 0;
}

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((first, second) => first - second);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function extractNoteEvents(pcm, notesPerSecond, voicesPerChannel = 1) {
  const frameCount = Math.floor(pcm.length / 4);
  const durationTicks = Math.max(2, Math.round(frameCount * 60 / AUDIO_SAMPLE_RATE));
  const maximumNotesPerSecond = Math.max(
    MIN_NOTES_PER_SECOND,
    Math.min(MAX_NOTES_PER_SECOND, Number(notesPerSecond) || 4),
  );
  const analysisWindowsPerSecond = Math.min(
    MAX_NOTES_PER_SECOND,
    Math.max(MIN_ANALYSIS_WINDOWS_PER_SECOND, maximumNotesPerSecond * ANALYSIS_OVERSAMPLE),
  );
  const hopFrames = Math.max(1, Math.round(AUDIO_SAMPLE_RATE / analysisWindowsPerSecond));
  const minimumEventGapTicks = Math.max(1, Math.ceil(60 / maximumNotesPerSecond));
  const leftWindow = new Float64Array(FFT_SIZE);
  const rightWindow = new Float64Array(FFT_SIZE);
  const events = [];
  const normalizedVoicesPerChannel = Math.max(MIN_VOICES_PER_CHANNEL, Math.min(
    MAX_VOICES_PER_CHANNEL,
    Math.round(voicesPerChannel) || 1,
  ));
  const leftVoiceNoteCounts = Array.from({ length: normalizedVoicesPerChannel }, () => 0);
  const rightVoiceNoteCounts = Array.from({ length: normalizedVoicesPerChannel }, () => 0);
  const { leftPeak, rightPeak } = channelPeakLevels(pcm, frameCount);
  const leftSilenceRms = adaptiveSilenceThreshold(leftPeak);
  const rightSilenceRms = adaptiveSilenceThreshold(rightPeak);
  const fluxHistoryLimit = Math.max(4, Math.round(
    analysisWindowsPerSecond * SPECTRAL_FLUX_HISTORY_SECONDS,
  ));
  const leftFluxHistory = [];
  const rightFluxHistory = [];
  let previousLeftMagnitudes;
  let previousRightMagnitudes;
  let previousLeftActive = false;
  let previousRightActive = false;
  let previousLeftRms = 0;
  let previousRightRms = 0;
  let lastEventTick = -minimumEventGapTicks;

  for (let startFrame = 0; startFrame < frameCount; startFrame += hopFrames) {
    leftWindow.fill(0);
    rightWindow.fill(0);
    const availableFrames = Math.min(FFT_SIZE, frameCount - startFrame);
    const completeAnalysisWindow = availableFrames === FFT_SIZE;
    for (let offset = 0; offset < availableFrames; offset++) {
      const byteOffset = (startFrame + offset) * 4;
      leftWindow[offset] = pcm.readInt16LE(byteOffset) / 32768;
      rightWindow[offset] = pcm.readInt16LE(byteOffset + 2) / 32768;
    }
    const leftAnalysis = analyzeDominantMidis(
      leftWindow,
      AUDIO_SAMPLE_RATE,
      normalizedVoicesPerChannel,
      leftSilenceRms,
    );
    const rightAnalysis = analyzeDominantMidis(
      rightWindow,
      AUDIO_SAMPLE_RATE,
      normalizedVoicesPerChannel,
      rightSilenceRms,
    );
    const leftMidis = leftAnalysis.midis;
    const rightMidis = rightAnalysis.midis;
    const leftRms = leftAnalysis.rms;
    const rightRms = rightAnalysis.rms;
    const leftFlux = normalizedSpectralFlux(leftAnalysis.magnitudes, previousLeftMagnitudes);
    const rightFlux = normalizedSpectralFlux(rightAnalysis.magnitudes, previousRightMagnitudes);
    const leftFluxThreshold = Math.max(MIN_SPECTRAL_FLUX, median(leftFluxHistory) * 1.65);
    const rightFluxThreshold = Math.max(MIN_SPECTRAL_FLUX, median(rightFluxHistory) * 1.65);
    const leftSpectralAttack = completeAnalysisWindow && leftMidis.length > 0 && leftFlux > leftFluxThreshold;
    const rightSpectralAttack = completeAnalysisWindow && rightMidis.length > 0 && rightFlux > rightFluxThreshold;
    // The FFT describes the centre of its Hann window, not its first sample.
    // Timestamping the centre avoids scheduling every detected attack early by
    // roughly half a window (128 ms at the current analysis settings).
    const leadingFrames = Math.min(hopFrames, availableFrames);
    const sourceBeginsActive = startFrame === 0 && (
      windowRms(leftWindow.subarray(0, leadingFrames)) >= leftSilenceRms
      || windowRms(rightWindow.subarray(0, leadingFrames)) >= rightSilenceRms
    );
    const analysisFrame = sourceBeginsActive ? 0 : startFrame + FFT_SIZE / 2;
    const tick = Math.min(
      durationTicks - 1,
      Math.round(analysisFrame * 60 / AUDIO_SAMPLE_RATE),
    );
    const enoughTimeElapsed = tick - lastEventTick >= minimumEventGapTicks;
    const leftBecameActive = leftMidis.length > 0 && !previousLeftActive;
    const rightBecameActive = rightMidis.length > 0 && !previousRightActive;
    const leftAttack = completeAnalysisWindow && leftMidis.length > 0
      && leftRms >= leftSilenceRms * 1.5
      && leftRms > Math.max(previousLeftRms, leftSilenceRms) * ONSET_RMS_RATIO;
    const rightAttack = completeAnalysisWindow && rightMidis.length > 0
      && rightRms >= rightSilenceRms * 1.5
      && rightRms > Math.max(previousRightRms, rightSilenceRms) * ONSET_RMS_RATIO;
    previousLeftMagnitudes = leftAnalysis.magnitudes;
    previousRightMagnitudes = rightAnalysis.magnitudes;
    previousLeftActive = leftMidis.length > 0;
    previousRightActive = rightMidis.length > 0;
    previousLeftRms = leftRms;
    previousRightRms = rightRms;
    if (leftAnalysis.magnitudes) {
      leftFluxHistory.push(leftFlux);
      if (leftFluxHistory.length > fluxHistoryLimit) leftFluxHistory.shift();
    } else {
      leftFluxHistory.length = 0;
    }
    if (rightAnalysis.magnitudes) {
      rightFluxHistory.push(rightFlux);
      if (rightFluxHistory.length > fluxHistoryLimit) rightFluxHistory.shift();
    } else {
      rightFluxHistory.length = 0;
    }

    if (!enoughTimeElapsed || !(
      leftBecameActive
      || rightBecameActive
      || leftAttack
      || rightAttack
      || leftSpectralAttack
      || rightSpectralAttack
    )) continue;
    const eventLeftMidis = leftMidis;
    const eventRightMidis = rightMidis;
    const leftMidi = eventLeftMidis[0];
    const rightMidi = eventRightMidis[0];
    if (leftMidi === undefined && rightMidi === undefined) continue;
    eventLeftMidis.forEach((_, voiceIndex) => leftVoiceNoteCounts[voiceIndex]++);
    eventRightMidis.forEach((_, voiceIndex) => rightVoiceNoteCounts[voiceIndex]++);
    events.push({
      tick,
      ...(leftMidi !== undefined ? {
        leftMidi,
        leftMidis: eventLeftMidis,
        leftPitch: Math.max(1, Math.min(PIANO_NOTE_COUNT, leftMidi - PIANO_FIRST_MIDI_NOTE + 1)),
      } : {}),
      ...(rightMidi !== undefined ? {
        rightMidi,
        rightMidis: eventRightMidis,
        rightPitch: Math.max(1, Math.min(PIANO_NOTE_COUNT, rightMidi - PIANO_FIRST_MIDI_NOTE + 1)),
      } : {}),
    });
    lastEventTick = tick;
  }

  return {
    durationTicks,
    durationSeconds: frameCount / AUDIO_SAMPLE_RATE,
    analysisWindowsPerSecond,
    minimumEventGapTicks,
    leftSilenceRms,
    rightSilenceRms,
    voicesPerChannel: normalizedVoicesPerChannel,
    leftNoteCount: leftVoiceNoteCounts.reduce((total, count) => total + count, 0),
    rightNoteCount: rightVoiceNoteCounts.reduce((total, count) => total + count, 0),
    leftVoiceNoteCounts,
    rightVoiceNoteCounts,
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
  const voicesPerChannel = Math.max(
    MIN_VOICES_PER_CHANNEL,
    Math.min(MAX_VOICES_PER_CHANNEL, Math.round(Number(request.voicesPerChannel)) || 2),
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
      timingMode: 'adaptive',
      ...extractNoteEvents(pcm, notesPerSecond, voicesPerChannel),
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  AUDIO_SAMPLE_RATE,
  FFT_SIZE,
  MAX_NOTES_PER_SECOND,
  MAX_VOICES_PER_CHANNEL,
  MIN_NOTES_PER_SECOND,
  MIN_VOICES_PER_CHANNEL,
  PIANO_FIRST_MIDI_NOTE,
  PIANO_NOTE_COUNT,
  decodeAudioNotes,
  detectDominantMidi,
  detectDominantMidis,
  detectFactorioPianoPitch,
  extractNoteEvents,
};
