const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const INSTRUMENT_FILES = Object.freeze({
  piano: { prefix: 'piano1', noteCount: 48 },
  bass: { prefix: 'bass', noteCount: 36 },
  lead: { prefix: 'lead', noteCount: 36 },
  saw: { prefix: 'saw', noteCount: 36 },
  square: { prefix: 'square', noteCount: 36 },
  celesta: { prefix: 'celesta', noteCount: 36 },
  vibraphone: { prefix: 'vibraphone', noteCount: 36 },
  plucked: { prefix: 'plucked', noteCount: 36 },
  'steel-drum': { prefix: 'steel-drum', noteCount: 36 },
});

const SPEAKER_RELATIVE_PATH = path.join('data', 'base', 'sound', 'programmable-speaker');
const MARKER_FILE = 'piano1-01.ogg';

function factorioDirectoryFromSoundDirectory(soundDirectory) {
  if (!soundDirectory) return null;
  return path.resolve(soundDirectory, '..', '..', '..', '..');
}

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function normalizeSoundDirectory(selectedPath) {
  if (!selectedPath) return null;
  const absolute = path.resolve(selectedPath);
  const candidates = [
    absolute,
    path.join(absolute, SPEAKER_RELATIVE_PATH),
    path.join(absolute, 'base', 'sound', 'programmable-speaker'),
    path.join(absolute, 'sound', 'programmable-speaker'),
  ];
  for (const candidate of candidates) {
    if (await isFile(path.join(candidate, MARKER_FILE))) return candidate;
  }
  return null;
}

async function steamLibraries(steamRoot) {
  const libraries = [steamRoot];
  const manifestPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    const manifest = await fs.readFile(manifestPath, 'utf8');
    for (const match of manifest.matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.push(match[1].replace(/\\\\/g, '\\'));
    }
  } catch {
    // Steam is optional; the explicit and standalone candidates remain valid.
  }
  return [...new Set(libraries)];
}

async function automaticFactorioCandidates() {
  const home = os.homedir();
  const candidates = [];
  if (process.platform === 'win32') {
    const steamRoots = [
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Steam'),
    ].filter(Boolean);
    for (const steamRoot of steamRoots) {
      for (const library of await steamLibraries(steamRoot)) {
        candidates.push(path.join(library, 'steamapps', 'common', 'Factorio'));
      }
    }
    if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'Factorio'));
  } else if (process.platform === 'darwin') {
    candidates.push(
      path.join(home, 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'Factorio'),
      path.join('/Applications', 'Factorio.app', 'Contents'),
      path.join('/Applications', 'factorio.app', 'Contents'),
    );
  } else {
    const steamRoots = [
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    ];
    for (const steamRoot of steamRoots) {
      for (const library of await steamLibraries(steamRoot)) {
        candidates.push(path.join(library, 'steamapps', 'common', 'Factorio'));
      }
    }
    candidates.push('/opt/factorio', path.join(home, 'factorio'));
  }
  return [...new Set(candidates)];
}

function createFactorioSoundLibrary({ configPath }) {
  let soundDirectory = null;

  const saveSelectedDirectory = async (directory) => {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ soundDirectory: directory }, null, 2), 'utf8');
  };

  const configuredDirectory = async () => {
    try {
      const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
      return normalizeSoundDirectory(parsed?.soundDirectory);
    } catch {
      return null;
    }
  };

  const locate = async () => {
    if (soundDirectory && await isFile(path.join(soundDirectory, MARKER_FILE))) return soundDirectory;
    soundDirectory = null;
    soundDirectory = await configuredDirectory();
    if (soundDirectory) return soundDirectory;
    for (const candidate of await automaticFactorioCandidates()) {
      soundDirectory = await normalizeSoundDirectory(candidate);
      if (soundDirectory) return soundDirectory;
    }
    return null;
  };

  return {
    async status() {
      const directory = await locate();
      return {
        available: Boolean(directory),
        soundDirectory: directory ?? undefined,
        factorioDirectory: factorioDirectoryFromSoundDirectory(directory) ?? undefined,
      };
    },

    async select(selectedPath) {
      const directory = await normalizeSoundDirectory(selectedPath);
      if (!directory) {
        throw new Error('This folder does not contain Factorio programmable-speaker sounds.');
      }
      soundDirectory = directory;
      await saveSelectedDirectory(directory);
      return {
        available: true,
        soundDirectory: directory,
        factorioDirectory: factorioDirectoryFromSoundDirectory(directory),
      };
    },

    async read(instrumentName, pitch) {
      const instrument = INSTRUMENT_FILES[instrumentName];
      if (!instrument) throw new TypeError('Unknown Factorio speaker instrument.');
      const normalizedPitch = Math.round(Number(pitch));
      if (normalizedPitch < 1 || normalizedPitch > instrument.noteCount) {
        throw new RangeError('Factorio speaker pitch is outside this instrument range.');
      }
      const directory = await locate();
      if (!directory) throw new Error('Factorio programmable-speaker sounds were not found.');
      const filename = `${instrument.prefix}-${String(normalizedPitch).padStart(2, '0')}.ogg`;
      return new Uint8Array(await fs.readFile(path.join(directory, filename)));
    },
  };
}

module.exports = {
  INSTRUMENT_FILES,
  createFactorioSoundLibrary,
  factorioDirectoryFromSoundDirectory,
  normalizeSoundDirectory,
};
