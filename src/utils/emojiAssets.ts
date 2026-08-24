export type EmojiAssetProvider = 'noto-animated' | 'twemoji-static';

export interface LoadedEmojiAsset {
    bytes: ArrayBuffer;
    mimeType: string;
    source: 'cache' | 'network';
}

const TWEMOJI_VERSION = '17.0.3';
const BROWSER_CACHE_NAME = 'factorio-lamp-emoji-assets-v1';

export const twemojiCodepoint = (emoji: string): string => {
    const normalized = emoji.includes('\u200d') ? emoji : emoji.replace(/\ufe0f/giu, '');
    return [...normalized]
        .map(character => character.codePointAt(0)?.toString(16) ?? '')
        .filter(Boolean)
        .join('-');
};

export const emojiAssetUrl = (provider: EmojiAssetProvider, codepoint: string): string => {
    if (provider === 'twemoji-static') {
        return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/72x72/${encodeURIComponent(codepoint)}.png`;
    }
    return `https://fonts.gstatic.com/s/e/notoemoji/latest/${encodeURIComponent(codepoint)}/512.gif`;
};

const copyArrayBuffer = (bytes: ArrayBuffer | Uint8Array): ArrayBuffer => {
    if (bytes instanceof ArrayBuffer) return bytes.slice(0);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

export const loadEmojiAsset = async (
    provider: EmojiAssetProvider,
    codepoint: string,
): Promise<LoadedEmojiAsset> => {
    if (window.factorioLampEditor?.getEmojiAsset) {
        const asset = await window.factorioLampEditor.getEmojiAsset(provider, codepoint);
        return {
            bytes: copyArrayBuffer(asset.bytes),
            mimeType: asset.mimeType,
            source: asset.source,
        };
    }

    const url = emojiAssetUrl(provider, codepoint);
    const cache = 'caches' in window ? await window.caches.open(BROWSER_CACHE_NAME) : null;
    const cached = await cache?.match(url);
    if (cached) {
        return {
            bytes: await cached.arrayBuffer(),
            mimeType: cached.headers.get('content-type') || (provider === 'twemoji-static' ? 'image/png' : 'image/gif'),
            source: 'cache',
        };
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Emoji asset server returned HTTP ${response.status}.`);
    if (cache) await cache.put(url, response.clone());
    return {
        bytes: await response.arrayBuffer(),
        mimeType: response.headers.get('content-type') || (provider === 'twemoji-static' ? 'image/png' : 'image/gif'),
        source: 'network',
    };
};

export const loadTwemojiImage = async (emoji: string): Promise<HTMLImageElement | null> => {
    const codepoint = twemojiCodepoint(emoji);
    if (!codepoint) return null;
    try {
        const asset = await loadEmojiAsset('twemoji-static', codepoint);
        const objectUrl = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType }));
        try {
            const image = new Image();
            image.decoding = 'async';
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error(`Unable to decode Twemoji ${codepoint}.`));
                image.src = objectUrl;
            });
            return image;
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    } catch (error) {
        console.warn(`Unable to load Twemoji artwork for ${codepoint}; using the selected font fallback.`, error);
        return null;
    }
};
