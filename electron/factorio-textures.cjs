const fs = require('node:fs/promises');
const path = require('node:path');

// Factorio stores its 64 px inventory artwork as the first image in a
// horizontal mipmap sheet. The renderer crops that first 64 x 64 region.
const FACTORIO_TEXTURE_FILES = Object.freeze({
  'small-lamp': 'small-lamp.png',
  'arithmetic-combinator': 'arithmetic-combinator.png',
  'constant-combinator': 'constant-combinator.png',
  'decider-combinator': 'decider-combinator.png',
  'display-panel': 'display-panel.png',
  'programmable-speaker': 'programmable-speaker.png',
  roboport: 'roboport.png',
  'small-electric-pole': 'small-electric-pole.png',
  'medium-electric-pole': 'medium-electric-pole.png',
  'big-electric-pole': 'big-electric-pole.png',
  substation: 'substation.png',
});

const ICONS_RELATIVE_PATH = path.join('data', 'base', 'graphics', 'icons');

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
    if (await isFile(path.join(candidate, ICONS_RELATIVE_PATH, FACTORIO_TEXTURE_FILES['small-lamp']))) {
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
    for (const [textureId, filename] of Object.entries(FACTORIO_TEXTURE_FILES)) {
      if (await isFile(path.join(factorioDirectory, ICONS_RELATIVE_PATH, filename))) {
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
      const filename = FACTORIO_TEXTURE_FILES[textureId];
      if (!filename) throw new TypeError('Unknown Factorio texture.');
      const factorioDirectory = await locate();
      if (!factorioDirectory) throw new Error('Factorio game textures were not found.');
      const texturePath = path.join(factorioDirectory, ICONS_RELATIVE_PATH, filename);
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
