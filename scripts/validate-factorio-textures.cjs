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
  const entityDirectory = path.join(factorioRoot, 'data', 'base', 'graphics', 'entity');
  const lampBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]);
  const lampLightBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]);
  const deciderBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]);
  const nauvisBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x03]);
  const laboratoryBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x04]);
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
    const fixtures = [
      ['data/base/graphics/entity/small-lamp/lamp.png', lampBytes],
      ['data/base/graphics/entity/small-lamp/lamp-light.png', lampLightBytes],
      ['data/base/graphics/entity/combinator/decider-combinator.png', deciderBytes],
      ['data/base/graphics/terrain/grass-1.png', nauvisBytes],
      ['data/base/graphics/terrain/lab-tiles/lab-dark-1.png', laboratoryBytes],
    ];
    for (const [relativePath, bytes] of fixtures) {
      const fixturePath = path.join(factorioRoot, relativePath);
      await fs.mkdir(path.dirname(fixturePath), { recursive: true });
      await fs.writeFile(fixturePath, bytes);
    }

    assert.equal(await normalizeFactorioDirectory(factorioRoot), factorioRoot);
    assert.equal(await normalizeFactorioDirectory(entityDirectory), factorioRoot);

    const library = createFactorioTextureLibrary({ soundLibrary });
    assert.deepEqual(await library.status(), {
      available: true,
      factorioDirectory: factorioRoot,
      textureIds: [
        'small-lamp',
        'small-lamp-on',
        'decider-combinator',
        'terrain-nauvis',
        'terrain-laboratory',
      ],
    });
    assert.deepEqual(Buffer.from(await library.read('small-lamp')), lampBytes);
    assert.deepEqual(Buffer.from(await library.read('small-lamp-on')), lampLightBytes);
    assert.deepEqual(Buffer.from(await library.read('decider-combinator')), deciderBytes);
    assert.deepEqual(Buffer.from(await library.read('terrain-nauvis')), nauvisBytes);
    assert.deepEqual(Buffer.from(await library.read('terrain-laboratory')), laboratoryBytes);
    await assert.rejects(() => library.read('../secret'), /Unknown Factorio texture/);

    await library.select(entityDirectory);
    assert.equal(selectedDirectory, factorioRoot);

    console.log(JSON.stringify({ factorioRoot, exactTextureRead: true, arbitraryPathsRejected: true }));
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
