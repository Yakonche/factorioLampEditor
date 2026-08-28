const fs = require('node:fs/promises');
const path = require('node:path');

// Only whitelisted local game assets can cross the preload boundary. These
// are placed-entity sprites, not inventory icons; the renderer applies the
// frame sizes, shifts, and 0.5 scales declared by Factorio's prototypes.
const FACTORIO_TEXTURE_FILES = Object.freeze({
  'small-lamp': path.join('data', 'base', 'graphics', 'entity', 'small-lamp', 'lamp.png'),
  'small-lamp-on': path.join('data', 'base', 'graphics', 'entity', 'small-lamp', 'lamp-light.png'),
  'arithmetic-combinator': path.join('data', 'base', 'graphics', 'entity', 'combinator', 'arithmetic-combinator.png'),
  'constant-combinator': path.join('data', 'base', 'graphics', 'entity', 'combinator', 'constant-combinator.png'),
  'decider-combinator': path.join('data', 'base', 'graphics', 'entity', 'combinator', 'decider-combinator.png'),
  'display-panel': path.join('data', 'base', 'graphics', 'entity', 'display-panel', 'display-panel.png'),
  'programmable-speaker': path.join('data', 'base', 'graphics', 'entity', 'programmable-speaker', 'programmable-speaker.png'),
  roboport: path.join('data', 'base', 'graphics', 'entity', 'roboport', 'roboport-base.png'),
  'small-electric-pole': path.join('data', 'base', 'graphics', 'entity', 'small-electric-pole', 'small-electric-pole.png'),
  'medium-electric-pole': path.join('data', 'base', 'graphics', 'entity', 'medium-electric-pole', 'medium-electric-pole.png'),
  'big-electric-pole': path.join('data', 'base', 'graphics', 'entity', 'big-electric-pole', 'big-electric-pole.png'),
  substation: path.join('data', 'base', 'graphics', 'entity', 'substation', 'substation.png'),
  'terrain-nauvis': path.join('data', 'base', 'graphics', 'terrain', 'grass-1.png'),
  'terrain-laboratory': path.join('data', 'base', 'graphics', 'terrain', 'lab-tiles', 'lab-dark-1.png'),
});

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function normalizeFactorioDirectory(selectedPath) {
  if (!selectedPath) return null;
  let candidate = path.resolve(selectedPath);
  for (let depth = 0; depth <= 6; depth++) {
    if (await isFile(path.join(candidate, FACTORIO_TEXTURE_FILES['small-lamp']))) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return null;
}

function createFactorioTextureLibrary({ soundLibrary }) {
  const locate = async () => {
    const soundStatus = await soundLibrary.status();
    return normalizeFactorioDirectory(soundStatus.factorioDirectory);
  };

  const statusForDirectory = async (factorioDirectory) => {
    if (!factorioDirectory) return { available: false, textureIds: [] };
    const textureIds = [];
    for (const [textureId, relativePath] of Object.entries(FACTORIO_TEXTURE_FILES)) {
      if (await isFile(path.join(factorioDirectory, relativePath))) {
        textureIds.push(textureId);
      }
    }
    return {
      available: textureIds.includes('small-lamp'),
      factorioDirectory,
      textureIds,
    };
  };

  return {
    async status() {
      return statusForDirectory(await locate());
    },

    async select(selectedPath) {
      await soundLibrary.select(selectedPath);
      return statusForDirectory(await locate());
    },

    async read(textureId) {
      const relativePath = FACTORIO_TEXTURE_FILES[textureId];
      if (!relativePath) throw new TypeError('Unknown Factorio texture.');
      const factorioDirectory = await locate();
      if (!factorioDirectory) throw new Error('Factorio game textures were not found.');
      const texturePath = path.join(factorioDirectory, relativePath);
      if (!await isFile(texturePath)) throw new Error(`Factorio texture is unavailable : ${textureId}`);
      return new Uint8Array(await fs.readFile(texturePath));
    },
  };
}

module.exports = {
  FACTORIO_TEXTURE_FILES,
  createFactorioTextureLibrary,
  normalizeFactorioDirectory,
};
