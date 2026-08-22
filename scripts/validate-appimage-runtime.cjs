const { createHash } = require('node:crypto');
const { mkdtemp, open, rm, stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXPECTED_RUNTIME_COMMIT = 'dd6cebe';
const LEGACY_FUSE_LIBRARY = Buffer.from('libfuse.so.2');
const SQUASHFS_MAGIC = Buffer.from('hsqs');

function runAppImage(appImagePath, args, options = {}) {
  const result = spawnSync(appImagePath, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `AppImage command failed (${result.status}): ${args.join(' ')}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return `${result.stdout}${result.stderr}`.trim();
}

async function main() {
  if (process.platform !== 'linux') {
    throw new Error('The AppImage runtime check must run on Linux.');
  }

  const packageJson = require('../package.json');
  const defaultArtifact = path.resolve(
    'release',
    `Factorio Lamp Editor-${packageJson.version}-linux-x86_64.AppImage`,
  );
  const appImagePath = path.resolve(process.argv[2] || defaultArtifact);
  const details = await stat(appImagePath);
  if (!details.isFile() || details.size < 1_000_000) {
    throw new Error(`Invalid AppImage artifact: ${appImagePath}`);
  }

  const versionOutput = runAppImage(appImagePath, ['--appimage-version']);
  if (!versionOutput.includes(EXPECTED_RUNTIME_COMMIT)) {
    throw new Error(`Unexpected AppImage runtime: ${versionOutput}`);
  }

  const offsetOutput = runAppImage(appImagePath, ['--appimage-offset']);
  const offset = Number.parseInt(offsetOutput, 10);
  if (!Number.isSafeInteger(offset) || offset < 500_000 || offset > 2_000_000) {
    throw new Error(`Unexpected AppImage filesystem offset: ${offsetOutput}`);
  }

  let runtimeDigest;
  const descriptor = await open(appImagePath, 'r');
  try {
    const runtime = Buffer.alloc(offset);
    const runtimeRead = await descriptor.read(runtime, 0, runtime.length, 0);
    if (runtimeRead.bytesRead !== runtime.length) {
      throw new Error('The complete AppImage runtime could not be read.');
    }
    if (runtime.includes(LEGACY_FUSE_LIBRARY)) {
      throw new Error('The AppImage runtime still references legacy libfuse.so.2.');
    }
    runtimeDigest = createHash('sha256').update(runtime).digest('hex');

    const magic = Buffer.alloc(SQUASHFS_MAGIC.length);
    const magicRead = await descriptor.read(magic, 0, magic.length, offset);
    if (magicRead.bytesRead !== magic.length) {
      throw new Error('The AppImage payload header could not be read.');
    }
    if (!magic.equals(SQUASHFS_MAGIC)) {
      throw new Error('The AppImage payload does not start with SquashFS magic.');
    }
  } finally {
    await descriptor.close();
  }

  const extractionDirectory = await mkdtemp(path.join(os.tmpdir(), 'fle-appimage-check-'));
  try {
    runAppImage(appImagePath, ['--appimage-extract', 'factorio-lamp-editor.desktop'], {
      cwd: extractionDirectory,
    });
    const desktopEntry = path.join(
      extractionDirectory,
      'squashfs-root',
      'factorio-lamp-editor.desktop',
    );
    if (!(await stat(desktopEntry)).isFile()) {
      throw new Error('The AppImage desktop entry could not be extracted.');
    }
  } finally {
    await rm(extractionDirectory, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    appImage: path.basename(appImagePath),
    bytes: details.size,
    runtimeCommit: EXPECTED_RUNTIME_COMMIT,
    runtimeBytes: offset,
    runtimeSha256: runtimeDigest,
    legacyLibfuse2Reference: false,
    extraction: 'ok',
  }));
}

void main();
