const { createHash } = require('node:crypto');
const { mkdir, readFile, stat, writeFile, chmod } = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

const RELEASE = 'b6.1.1';
const BASE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;
const OUTPUT_DIRECTORY = path.resolve('build-resources', 'ffmpeg', 'linux-x64');
const EXECUTABLE_PATH = path.join(OUTPUT_DIRECTORY, 'ffmpeg');
const EXPECTED_SHA256 = 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function download(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'factorio-lamp-editor-build' },
  });
  if (!response.ok) {
    throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function executableIsCurrent() {
  try {
    const details = await stat(EXECUTABLE_PATH);
    if (details.size < 10_000_000) return false;
    if (EXPECTED_SHA256.startsWith('TO_BE_')) return true;
    return sha256(await readFile(EXECUTABLE_PATH)) === EXPECTED_SHA256;
  } catch {
    return false;
  }
}

async function ensureTextResource(fileName, remoteName) {
  const destination = path.join(OUTPUT_DIRECTORY, fileName);
  try {
    if ((await stat(destination)).size > 100) return;
  } catch {
    // Download the missing build resource below.
  }
  await writeFile(destination, await download(`${BASE_URL}/${remoteName}`));
}

async function main() {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  if (!await executableIsCurrent()) {
    const compressed = await download(`${BASE_URL}/ffmpeg-linux-x64.gz`);
    const executable = gunzipSync(compressed);
    const digest = sha256(executable);
    if (!EXPECTED_SHA256.startsWith('TO_BE_') && digest !== EXPECTED_SHA256) {
      throw new Error(`Unexpected Linux FFmpeg SHA-256: ${digest}`);
    }
    await writeFile(EXECUTABLE_PATH, executable, { mode: 0o755 });
    console.log(`Downloaded FFmpeg ${RELEASE} for Linux x64 (${digest}).`);
  }
  await chmod(EXECUTABLE_PATH, 0o755);
  await Promise.all([
    ensureTextResource('BUILD-AND-SOURCE.txt', 'linux-x64.README'),
    ensureTextResource('COPYING.GPLv3.txt', 'linux-x64.LICENSE'),
  ]);
  console.log(`Linux FFmpeg resources are ready in ${OUTPUT_DIRECTORY}.`);
}

void main();
