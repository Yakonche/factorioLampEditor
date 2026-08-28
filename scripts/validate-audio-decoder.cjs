const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AUDIO_SAMPLE_RATE,
  FFT_SIZE,
  decodeAudioNotes,
  detectDominantMidi,
  detectDominantMidis,
  detectFactorioPianoPitch,
  extractNoteEvents,
} = require('../electron/audio.cjs');

const createSineWindow = (frequency) => Float64Array.from(
  { length: FFT_SIZE },
  (_, index) => Math.sin(2 * Math.PI * frequency * index / AUDIO_SAMPLE_RATE) * 0.8,
);

assert.equal(detectFactorioPianoPitch(createSineWindow(440), AUDIO_SAMPLE_RATE), 17, 'A4 should map to Factorio piano pitch 17.');
assert.equal(detectFactorioPianoPitch(createSineWindow(523.251), AUDIO_SAMPLE_RATE), 20, 'C5 should map to Factorio piano pitch 20.');
assert.equal(detectDominantMidi(createSineWindow(87.307), AUDIO_SAMPLE_RATE), 41, 'F2 should remain available for the lowest native instruments.');
assert.equal(detectDominantMidi(createSineWindow(5274.041), AUDIO_SAMPLE_RATE), 112, 'E8 should remain available for the highest native instruments.');
assert.equal(detectFactorioPianoPitch(new Float64Array(FFT_SIZE), AUDIO_SAMPLE_RATE), undefined);

const cMajorWindow = Float64Array.from(
  { length: FFT_SIZE },
  (_, index) => [261.626, 329.628, 391.995].reduce((sample, frequency) => (
    sample + Math.sin(2 * Math.PI * frequency * index / AUDIO_SAMPLE_RATE) * 0.24
  ), 0),
);
assert.deepEqual(
  detectDominantMidis(cMajorWindow, AUDIO_SAMPLE_RATE, 4),
  [60, 64, 67],
  'Polyphonic extraction should preserve the three simultaneous C-major pitches.',
);

const pcmFrames = AUDIO_SAMPLE_RATE;
const pcm = Buffer.alloc(pcmFrames * 4);
for (let frame = 0; frame < pcmFrames; frame++) {
  pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * frame / AUDIO_SAMPLE_RATE) * 24_000), frame * 4);
  pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 523.251 * frame / AUDIO_SAMPLE_RATE) * 24_000), frame * 4 + 2);
}
const extracted = extractNoteEvents(pcm, 4);
assert.equal(extracted.durationTicks, 60);
assert.equal(extracted.events.length, 1, 'A steady tone should be emitted once instead of being forced onto a periodic grid.');
assert.ok(extracted.events.every(event => event.leftPitch === 17 && event.rightPitch === 20));
assert.ok(extracted.events.every(event => event.leftMidi === 69 && event.rightMidi === 72));

const adaptiveFrames = AUDIO_SAMPLE_RATE * 4;
const adaptivePcm = Buffer.alloc(adaptiveFrames * 4);
for (let frame = 0; frame < adaptiveFrames; frame++) {
  const seconds = frame / AUDIO_SAMPLE_RATE;
  const burst = seconds >= 0.5 && seconds < 0.78
    ? { frequency: 440, amplitude: 900 }
    : seconds >= 1.3 && seconds < 1.62
      ? { frequency: 523.251, amplitude: 20_000 }
      : seconds >= 2.6 && seconds < 3.05
        ? { frequency: 659.255, amplitude: 18_000 }
        : undefined;
  const sample = burst
    ? Math.round(Math.sin(2 * Math.PI * burst.frequency * frame / AUDIO_SAMPLE_RATE) * burst.amplitude)
    : 0;
  adaptivePcm.writeInt16LE(sample, frame * 4);
  adaptivePcm.writeInt16LE(sample, frame * 4 + 2);
}
const adaptive = extractNoteEvents(adaptivePcm, 8, 1);
assert.equal(adaptive.minimumEventGapTicks, 8);
assert.ok(adaptive.events[0].tick < 60, 'The quiet introduction should survive the adaptive volume gate.');
assert.ok(adaptive.events.some(event => event.tick >= 65 && event.tick <= 110 && event.leftMidi === 72));
assert.ok(adaptive.events.some(event => event.tick >= 140 && event.tick <= 200 && event.leftMidi === 76));
const adaptiveGaps = adaptive.events.slice(1).map((event, index) => event.tick - adaptive.events[index].tick);
assert.ok(adaptiveGaps.every(gap => gap >= adaptive.minimumEventGapTicks));
assert.ok(new Set(adaptiveGaps).size > 1, 'Adaptive note events should preserve irregular timing.');

(async () => {
  const ffmpegPath = require('ffmpeg-static');
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'factorio-lamp-audio-test-'));
  const wavePath = path.join(temporaryDirectory, 'stereo.wav');
  try {
    execFileSync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'aevalsrc=0.7*sin(2*PI*440*t)|0.7*sin(2*PI*523.251*t):s=8000:d=1',
      '-c:a', 'pcm_s16le',
      '-y', wavePath,
    ], { windowsHide: true });
    const decoded = await decodeAudioNotes({
      sourceName: 'stereo.wav',
      bytes: fs.readFileSync(wavePath),
      notesPerSecond: 4,
      voicesPerChannel: 2,
    }, { ffmpegPath });
    assert.equal(decoded.sourceChannels, 2);
    assert.equal(decoded.notesPerSecond, 4);
    assert.equal(decoded.voicesPerChannel, 2);
    assert.equal(decoded.events.length, 1);
    assert.ok(decoded.events.every(event => event.leftPitch === 17 && event.rightPitch === 20));
    assert.ok(decoded.events.every(event => event.leftMidi === 69 && event.rightMidi === 72));
    console.log(JSON.stringify({
      durationTicks: decoded.durationTicks,
      events: decoded.events.length,
      leftPitch: decoded.events[0].leftPitch,
      rightPitch: decoded.events[0].rightPitch,
    }));
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
