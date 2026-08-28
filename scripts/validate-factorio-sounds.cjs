const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createFactorioSoundLibrary,
  normalizeSoundDirectory,
} = require('../electron/factorio-sounds.cjs');

(async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-sounds-test-'));
  const factorioRoot = path.join(temporaryDirectory, 'Factorio');
  const soundDirectory = path.join(factorioRoot, 'data', 'base', 'sound', 'programmable-speaker');
  const configPath = path.join(temporaryDirectory, 'user-data', 'factorio-sound-source.json');
  const markerBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x01]);
  const sampleBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x02, 0x03]);

  try {
    await fs.mkdir(soundDirectory, { recursive: true });
    await fs.writeFile(path.join(soundDirectory, 'piano1-01.ogg'), markerBytes);
    await fs.writeFile(path.join(soundDirectory, 'bass-02.ogg'), sampleBytes);

    assert.equal(await normalizeSoundDirectory(factorioRoot), soundDirectory);
    assert.equal(await normalizeSoundDirectory(path.join(factorioRoot, 'data')), soundDirectory);
    assert.equal(await normalizeSoundDirectory(soundDirectory), soundDirectory);

    const library = createFactorioSoundLibrary({ configPath });
    assert.deepEqual(await library.select(factorioRoot), {
      available: true,
      soundDirectory,
      factorioDirectory: factorioRoot,
    });
    assert.deepEqual(await library.status(), {
      available: true,
      soundDirectory,
      factorioDirectory: factorioRoot,
    });
    assert.deepEqual(Buffer.from(await library.read('bass', 2)), sampleBytes);
    await assert.rejects(() => library.read('unknown', 1), /Unknown Factorio speaker instrument/);
    await assert.rejects(() => library.read('bass', 37), /outside this instrument range/);

    const restoredLibrary = createFactorioSoundLibrary({ configPath });
    assert.deepEqual(await restoredLibrary.status(), {
      available: true,
      soundDirectory,
      factorioDirectory: factorioRoot,
    });

    console.log(JSON.stringify({ soundDirectory, persisted: true, exactSampleRead: true }));
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
