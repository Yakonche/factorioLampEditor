const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createEmojiAssetCache, emojiAssetSpec } = require('../electron/emoji-cache.cjs');

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const GIF_BYTES = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00]);
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

async function main() {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'factorio-lamp-emoji-cache-'));
  let fetchCount = 0;
  const fetchImpl = async url => {
    fetchCount++;
    const bytes = url.endsWith('.gif') ? GIF_BYTES : url.endsWith('.svg') ? SVG_BYTES : PNG_BYTES;
    return new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    });
  };

  try {
    const cache = createEmojiAssetCache({ cacheRoot, fetchImpl });
    const downloaded = await cache.get('twemoji-static', '1f600');
    const cached = await cache.get('twemoji-static', '1f600');
    assert.equal(downloaded.source, 'network');
    assert.equal(cached.source, 'cache');
    assert.deepEqual([...cached.bytes], [...PNG_BYTES]);
    assert.equal(fetchCount, 1);

    const offlineCache = createEmojiAssetCache({
      cacheRoot,
      fetchImpl: async () => { throw new Error('offline'); },
    });
    assert.equal((await offlineCache.get('twemoji-static', '1f600')).source, 'cache');
    assert.equal(await offlineCache.readCached('noto-animated', '1f600'), null);
    assert.equal((await cache.get('noto-animated', '1f600')).source, 'network');
    assert.deepEqual([...(await cache.readCached('noto-animated', '1f600')).bytes], [...GIF_BYTES]);

    assert.equal((await cache.get('openmoji-static', '1F600')).mimeType, 'image/svg+xml');
    assert.equal((await cache.get('blobmoji-static', '1f600')).mimeType, 'image/svg+xml');
    const fluentKey = Buffer.from('Grinning face/Color/grinning_face_color.svg').toString('base64url');
    assert.equal((await cache.get('fluent-color-static', fluentKey)).mimeType, 'image/svg+xml');

    assert.equal(
      emojiAssetSpec('twemoji-static', '1F469-200D-1F4BB').url,
      'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f469-200d-1f4bb.png',
    );
    assert.throws(() => emojiAssetSpec('twemoji-static', '../escape'), /Invalid/);
    assert.throws(() => emojiAssetSpec('fluent-color-static', Buffer.from('../escape.svg').toString('base64url')), /Invalid/);
    assert.throws(() => emojiAssetSpec('unknown', '1f600'), /Unsupported/);
    console.log(JSON.stringify({ persistentAssets: 5, fetchCount, offlineReuse: true }));
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
