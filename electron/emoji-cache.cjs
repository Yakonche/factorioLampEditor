const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const FLUENT_REVISION = '62ecdc0d7ca5c6df32148c169556bc8d3782fca4';
const OPENMOJI_REVISION = 'f9fc506a3f913be9897ab0181d611d4c910a4104';
const BLOBMOJI_REVISION = '7dd14d2b0141693485fd26bc35817bd290352a79';
const codepointPattern = /^[0-9a-f]+(?:[-_][0-9a-f]+)*$/i;

const decodeFluentPath = key => {
  if (!/^[0-9a-z_-]+$/i.test(key)) throw new TypeError('Invalid Fluent Emoji asset key.');
  const padded = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '=');
  const assetPath = Buffer.from(padded, 'base64').toString('utf8');
  if (!assetPath || assetPath.includes('..') || path.isAbsolute(assetPath) || assetPath.includes('\\')) {
    throw new TypeError('Invalid Fluent Emoji asset path.');
  }
  return assetPath;
};

const fluentProvider = (style, extension, mimeType) => ({
  extension,
  mimeType,
  keyPattern: /^[0-9a-z_-]+$/i,
  url: key => {
    const assetPath = decodeFluentPath(key);
    const expectedSegment = style === '3D' ? '/3D/' : `/${style}/`;
    if (!assetPath.includes(expectedSegment) || !assetPath.toLocaleLowerCase().endsWith(`.${extension}`)) {
      throw new TypeError(`Invalid Fluent Emoji ${style} asset path.`);
    }
    return `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${FLUENT_REVISION}/assets/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
  },
});

const PROVIDERS = Object.freeze({
  'noto-animated': {
    extension: 'gif', mimeType: 'image/gif', keyPattern: /^[0-9a-f]+(?:_[0-9a-f]+)*$/,
    url: key => `https://fonts.gstatic.com/s/e/notoemoji/latest/${key}/512.gif`,
  },
  'twemoji-static': {
    extension: 'png', mimeType: 'image/png', keyPattern: codepointPattern,
    url: key => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/${key}.png`,
  },
  'openmoji-static': {
    extension: 'svg', mimeType: 'image/svg+xml', keyPattern: codepointPattern,
    url: key => `https://raw.githubusercontent.com/hfg-gmuend/openmoji/${OPENMOJI_REVISION}/color/svg/${key.toLocaleUpperCase()}.svg`,
  },
  'blobmoji-static': {
    extension: 'svg', mimeType: 'image/svg+xml', keyPattern: codepointPattern,
    url: key => `https://raw.githubusercontent.com/C1710/blobmoji/${BLOBMOJI_REVISION}/svg/emoji_u${key}.svg`,
  },
  'fluent-flat-static': fluentProvider('Flat', 'svg', 'image/svg+xml'),
  'fluent-color-static': fluentProvider('Color', 'svg', 'image/svg+xml'),
  'fluent-3d-static': fluentProvider('3D', 'png', 'image/png'),
});

function emojiAssetSpec(provider, key) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new TypeError(`Unsupported emoji asset provider: ${provider}`);
  const trimmedKey = String(key || '').trim();
  const normalizedKey = provider.startsWith('fluent-') ? trimmedKey : trimmedKey.toLocaleLowerCase();
  if (!spec.keyPattern.test(normalizedKey)) throw new TypeError(`Invalid ${provider} emoji asset key.`);
  return { ...spec, provider, key: normalizedKey, url: spec.url(normalizedKey) };
}

function hasExpectedSignature(bytes, mimeType) {
  if (mimeType === 'image/gif') {
    if (bytes.length < 6) return false;
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  const start = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512))).toString('utf8').replace(/^\uFEFF/u, '').trimStart();
  return start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'));
}

function createEmojiAssetCache({ cacheRoot, fetchImpl = globalThis.fetch }) {
  if (!cacheRoot) throw new TypeError('An emoji cache directory is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const pendingDownloads = new Map();
  const cachePathFor = spec => path.join(
    cacheRoot,
    spec.provider,
    `${crypto.createHash('sha256').update(spec.key).digest('hex')}.${spec.extension}`,
  );

  const readCached = async (provider, key) => {
    const spec = emojiAssetSpec(provider, key);
    const candidatePaths = [cachePathFor(spec)];
    if (provider === 'noto-animated' || provider === 'twemoji-static') {
      candidatePaths.push(path.join(cacheRoot, provider, `${spec.key}.${spec.extension}`));
    }
    for (const cachePath of candidatePaths) {
      try {
        const cached = await fs.readFile(cachePath);
        if (!hasExpectedSignature(cached, spec.mimeType)) {
          await fs.rm(cachePath, { force: true });
          continue;
        }
        return { bytes: Uint8Array.from(cached), mimeType: spec.mimeType, source: 'cache' };
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return null;
  };

  const get = async (provider, key) => {
    const spec = emojiAssetSpec(provider, key);
    const pendingKey = `${spec.provider}:${spec.key}`;
    const pending = pendingDownloads.get(pendingKey);
    if (pending) return pending;
    const download = (async () => {
      const cached = await readCached(spec.provider, spec.key);
      if (cached) return cached;
      const response = await fetchImpl(spec.url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`Emoji asset server returned HTTP ${response.status}.`);
      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (contentLength > MAX_ASSET_BYTES) throw new RangeError('Emoji asset is too large to cache.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new RangeError('Emoji asset has an invalid size.');
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
    pendingDownloads.set(pendingKey, download);
    try {
      return await download;
    } finally {
      pendingDownloads.delete(pendingKey);
    }
  };

  return { get, readCached };
}

module.exports = { MAX_ASSET_BYTES, createEmojiAssetCache, emojiAssetSpec };
