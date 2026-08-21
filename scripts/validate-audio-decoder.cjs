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

const pcmFrames = AUDIO_SAMPLE_RATE;
const pcm = Buffer.alloc(pcmFrames * 4);
for (let frame = 0; frame < pcmFrames; frame++) {
  pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * frame / AUDIO_SAMPLE_RATE) * 24_000), frame * 4);
  pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 523.251 * frame / AUDIO_SAMPLE_RATE) * 24_000), frame * 4 + 2);
}
const extracted = extractNoteEvents(pcm, 4);
assert.equal(extracted.durationTicks, 60);
assert.ok(extracted.events.length >= 4);
assert.ok(extracted.events.every(event => event.leftPitch === 17 && event.rightPitch === 20));
assert.ok(extracted.events.every(event => event.leftMidi === 69 && event.rightMidi === 72));

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
    }, { ffmpegPath });
    assert.equal(decoded.sourceChannels, 2);
    assert.equal(decoded.notesPerSecond, 4);
    assert.ok(decoded.events.length >= 4);
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
