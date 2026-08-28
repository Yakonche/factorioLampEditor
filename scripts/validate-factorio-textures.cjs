const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createFactorioTextureLibrary,
  normalizeFactorioDirectory,
} = require('../electron/factorio-textures.cjs');

(async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-textures-test-'));
  const factorioRoot = path.join(temporaryDirectory, 'Factorio');
  const iconDirectory = path.join(factorioRoot, 'data', 'base', 'graphics', 'icons');
  const lampBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]);
  const deciderBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]);
  let selectedDirectory = factorioRoot;
  const soundLibrary = {
    status: async () => ({ available: true, factorioDirectory: selectedDirectory }),
    select: async selectedPath => {
      selectedDirectory = await normalizeFactorioDirectory(selectedPath);
      if (!selectedDirectory) throw new Error('Invalid Factorio directory.');
      return { available: true, factorioDirectory: selectedDirectory };
    },
  };

  try {
    await fs.mkdir(iconDirectory, { recursive: true });
    await fs.writeFile(path.join(iconDirectory, 'small-lamp.png'), lampBytes);
    await fs.writeFile(path.join(iconDirectory, 'decider-combinator.png'), deciderBytes);

    assert.equal(await normalizeFactorioDirectory(factorioRoot), factorioRoot);
    assert.equal(await normalizeFactorioDirectory(iconDirectory), factorioRoot);

    const library = createFactorioTextureLibrary({ soundLibrary });
    assert.deepEqual(await library.status(), {
      available: true,
      factorioDirectory: factorioRoot,
      textureIds: ['small-lamp', 'decider-combinator'],
    });
    assert.deepEqual(Buffer.from(await library.read('small-lamp')), lampBytes);
    assert.deepEqual(Buffer.from(await library.read('decider-combinator')), deciderBytes);
    await assert.rejects(() => library.read('../secret'), /Unknown Factorio texture/);

    await library.select(iconDirectory);
    assert.equal(selectedDirectory, factorioRoot);

    console.log(JSON.stringify({ factorioRoot, exactTextureRead: true, arbitraryPathsRejected: true }));
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
