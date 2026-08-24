import fluentManifestJson from '../data/fluent-emoji-assets.json';
import type { EmojiFontStyle } from './fonts';

export type EmojiAssetProvider =
    | 'noto-animated'
    | 'twemoji-static'
    | 'openmoji-static'
    | 'fluent-flat-static'
    | 'fluent-color-static'
    | 'fluent-3d-static'
    | 'blobmoji-static';

export type EmojiStaticAssetProvider = Exclude<EmojiAssetProvider, 'noto-animated'>;

export const emojiArtworkProviderForStyle = (
    style: Exclude<EmojiFontStyle, 'automatic'>,
): EmojiStaticAssetProvider | null => {
    const providers: Partial<Record<Exclude<EmojiFontStyle, 'automatic'>, EmojiStaticAssetProvider>> = {
        twemoji: 'twemoji-static',
        openmoji: 'openmoji-static',
        'fluent-flat': 'fluent-flat-static',
        'fluent-color': 'fluent-color-static',
        'fluent-3d': 'fluent-3d-static',
        blobmoji: 'blobmoji-static',
    };
    return providers[style] ?? null;
};

export interface LoadedEmojiAsset {
    bytes: ArrayBuffer;
    mimeType: string;
    source: 'cache' | 'network';
}

type FluentEntry = { flat: string; color: string; threeD: string };
const fluentManifest = fluentManifestJson as {
    revision: string;
    entries: Record<string, FluentEntry>;
};

const TWEMOJI_VERSION = '17.0.3';
const OPENMOJI_REVISION = 'f9fc506a3f913be9897ab0181d611d4c910a4104';
const BLOBMOJI_REVISION = '7dd14d2b0141693485fd26bc35817bd290352a79';
const BROWSER_CACHE_NAME = 'factorio-lamp-emoji-assets-v2';

const codepointSequence = (emoji: string, separator: '-' | '_', uppercase = false): string => {
    const value = [...emoji.replace(/\ufe0f/giu, '')]
        .map(character => character.codePointAt(0)?.toString(16) ?? '')
        .filter(Boolean)
        .join(separator);
    return uppercase ? value.toLocaleUpperCase() : value;
};

export const twemojiCodepoint = (emoji: string): string => {
    const normalized = emoji.includes('\u200d') ? emoji : emoji.replace(/\ufe0f/giu, '');
    return [...normalized]
        .map(character => character.codePointAt(0)?.toString(16) ?? '')
        .filter(Boolean)
        .join('-');
};

const base64UrlEncode = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
};

const base64UrlDecode = (value: string): string => {
    const padded = value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
};

const fluentPathFor = (provider: EmojiStaticAssetProvider, emoji: string): string | null => {
    const entry = fluentManifest.entries[emoji] ?? fluentManifest.entries[emoji.replace(/\ufe0f/gu, '')];
    if (!entry) return null;
    if (provider === 'fluent-flat-static') return entry.flat;
    if (provider === 'fluent-color-static') return entry.color;
    if (provider === 'fluent-3d-static') return entry.threeD;
    return null;
};

export const emojiAssetKey = (provider: EmojiStaticAssetProvider, emoji: string): string | null => {
    if (provider === 'twemoji-static') return twemojiCodepoint(emoji) || null;
    if (provider === 'openmoji-static') return codepointSequence(emoji, '-', true) || null;
    if (provider === 'blobmoji-static') return codepointSequence(emoji, '_') || null;
    const fluentPath = fluentPathFor(provider, emoji);
    return fluentPath ? base64UrlEncode(fluentPath) : null;
};

const encodedPath = (value: string): string => value.split('/').map(encodeURIComponent).join('/');

export const emojiAssetUrl = (provider: EmojiAssetProvider, key: string): string => {
    if (provider === 'twemoji-static') {
        return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/72x72/${encodeURIComponent(key)}.png`;
    }
    if (provider === 'openmoji-static') {
        return `https://raw.githubusercontent.com/hfg-gmuend/openmoji/${OPENMOJI_REVISION}/color/svg/${encodeURIComponent(key)}.svg`;
    }
    if (provider === 'blobmoji-static') {
        return `https://raw.githubusercontent.com/C1710/blobmoji/${BLOBMOJI_REVISION}/svg/emoji_u${encodeURIComponent(key)}.svg`;
    }
    if (provider.startsWith('fluent-')) {
        return `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${fluentManifest.revision}/assets/${encodedPath(base64UrlDecode(key))}`;
    }
    return `https://fonts.gstatic.com/s/e/notoemoji/latest/${encodeURIComponent(key)}/512.gif`;
};

const defaultMimeType = (provider: EmojiAssetProvider): string => {
    if (provider === 'noto-animated') return 'image/gif';
    if (provider === 'twemoji-static' || provider === 'fluent-3d-static') return 'image/png';
    return 'image/svg+xml';
};

const copyArrayBuffer = (bytes: ArrayBuffer | Uint8Array): ArrayBuffer => {
    if (bytes instanceof ArrayBuffer) return bytes.slice(0);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

export const loadEmojiAsset = async (
    provider: EmojiAssetProvider,
    key: string,
): Promise<LoadedEmojiAsset> => {
    if (window.factorioLampEditor?.getEmojiAsset) {
        const asset = await window.factorioLampEditor.getEmojiAsset(provider, key);
        return { bytes: copyArrayBuffer(asset.bytes), mimeType: asset.mimeType, source: asset.source };
    }

    const url = emojiAssetUrl(provider, key);
    const cache = 'caches' in window ? await window.caches.open(BROWSER_CACHE_NAME) : null;
    const cached = await cache?.match(url);
    if (cached) {
        return {
            bytes: await cached.arrayBuffer(),
            mimeType: cached.headers.get('content-type') || defaultMimeType(provider),
            source: 'cache',
        };
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Emoji asset server returned HTTP ${response.status}.`);
    if (cache) await cache.put(url, response.clone());
    return {
        bytes: await response.arrayBuffer(),
        mimeType: response.headers.get('content-type') || defaultMimeType(provider),
        source: 'network',
    };
};

export const loadEmojiImage = async (
    provider: EmojiStaticAssetProvider,
    emoji: string,
): Promise<HTMLImageElement | null> => {
    const key = emojiAssetKey(provider, emoji);
    if (!key) return null;
    try {
        const asset = await loadEmojiAsset(provider, key);
        const objectUrl = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType }));
        try {
            const image = new Image();
            image.decoding = 'async';
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error(`Unable to decode ${provider} artwork ${key}.`));
                image.src = objectUrl;
            });
            return image;
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    } catch (error) {
        console.warn(`Unable to load ${provider} artwork; using the selected font fallback.`, error);
        return null;
    }
};
