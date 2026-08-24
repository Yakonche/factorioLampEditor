const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const PROVIDERS = Object.freeze({
  'noto-animated': {
    extension: 'gif',
    mimeType: 'image/gif',
    codepointPattern: /^[0-9a-f]+(?:_[0-9a-f]+)*$/,
    url: codepoint => `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/512.gif`,
  },
  'twemoji-static': {
    extension: 'png',
    mimeType: 'image/png',
    codepointPattern: /^[0-9a-f]+(?:-[0-9a-f]+)*$/,
    url: codepoint => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/${codepoint}.png`,
  },
});

function emojiAssetSpec(provider, codepoint) {
  const spec = PROVIDERS[provider];
  const normalizedCodepoint = String(codepoint || '').trim().toLowerCase();
  if (!spec) throw new TypeError(`Unsupported emoji asset provider: ${provider}`);
  if (!spec.codepointPattern.test(normalizedCodepoint)) {
    throw new TypeError(`Invalid ${provider} emoji codepoint.`);
  }
  return {
    ...spec,
    provider,
    codepoint: normalizedCodepoint,
    url: spec.url(normalizedCodepoint),
  };
}

function hasExpectedSignature(bytes, mimeType) {
  if (mimeType === 'image/gif') {
    if (bytes.length < 6) return false;
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function createEmojiAssetCache({ cacheRoot, fetchImpl = globalThis.fetch }) {
  if (!cacheRoot) throw new TypeError('An emoji cache directory is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const pendingDownloads = new Map();

  const cachePathFor = spec => path.join(
    cacheRoot,
    spec.provider,
    `${spec.codepoint}.${spec.extension}`,
  );

  const readCached = async (provider, codepoint) => {
    const spec = emojiAssetSpec(provider, codepoint);
    try {
      const cachePath = cachePathFor(spec);
      const cached = await fs.readFile(cachePath);
      if (!hasExpectedSignature(cached, spec.mimeType)) {
        await fs.rm(cachePath, { force: true });
        return null;
      }
      return {
        bytes: Uint8Array.from(cached),
        mimeType: spec.mimeType,
        source: 'cache',
      };
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  };

  const get = async (provider, codepoint) => {
    const spec = emojiAssetSpec(provider, codepoint);
    const key = `${spec.provider}:${spec.codepoint}`;
    const pending = pendingDownloads.get(key);
    if (pending) return pending;

    const download = (async () => {
      const cached = await readCached(spec.provider, spec.codepoint);
      if (cached) return cached;

      const response = await fetchImpl(spec.url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`Emoji asset server returned HTTP ${response.status}.`);
      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (contentLength > MAX_ASSET_BYTES) throw new RangeError('Emoji asset is too large to cache.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_ASSET_BYTES) {
        throw new RangeError('Emoji asset has an invalid size.');
      }
      if (!hasExpectedSignature(bytes, spec.mimeType)) {
        throw new TypeError(`Downloaded ${provider} asset is not a valid ${spec.extension.toUpperCase()} file.`);
      }

      const destination = cachePathFor(spec);
      const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
      await fs.mkdir(path.dirname(destination), { recursive: true });
      try {
        await fs.writeFile(temporary, bytes);
        await fs.rename(temporary, destination);
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
      }
      return { bytes, mimeType: spec.mimeType, source: 'network' };
    })();
    pendingDownloads.set(key, download);
    try {
      return await download;
    } finally {
      pendingDownloads.delete(key);
    }
  };

  return { get, readCached };
}

module.exports = {
  MAX_ASSET_BYTES,
  createEmojiAssetCache,
  emojiAssetSpec,
};
