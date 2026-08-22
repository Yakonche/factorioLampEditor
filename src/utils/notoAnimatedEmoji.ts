import manifestJson from '../data/noto-animated-emoji.json';

export interface NotoAnimatedEmojiEntry {
    codepoint: string;
    emoji: string;
    name: string;
    category: string;
    tags: string[];
}

interface NotoAnimatedEmojiManifest {
    source: string;
    api: string;
    license: string;
    icons: NotoAnimatedEmojiEntry[];
}

export const NOTO_ANIMATED_EMOJI_MANIFEST = manifestJson as NotoAnimatedEmojiManifest;
export const NOTO_ANIMATED_EMOJI = NOTO_ANIMATED_EMOJI_MANIFEST.icons;

const assetBaseUrl = (codepoint: string) => (
    `https://fonts.gstatic.com/s/e/notoemoji/latest/${encodeURIComponent(codepoint)}`
);

export const notoAnimatedEmojiWebpUrl = (codepoint: string) => `${assetBaseUrl(codepoint)}/512.webp`;
export const notoAnimatedEmojiGifUrl = (codepoint: string) => `${assetBaseUrl(codepoint)}/512.gif`;
export const notoAnimatedEmojiPngUrl = (codepoint: string) => `${assetBaseUrl(codepoint)}/512.png`;
