import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    BUNDLED_FONT_OPTIONS,
    EMOJI_FONT_STYLES,
    SYSTEM_FONT_OPTIONS,
    emojiFontFamily,
    emojiStyleAvailable,
} from '../src/utils/fonts';

const bundledFiles = [
    ['Iceberg', 'Iceberg-Regular.ttf'],
    ['Jersey', 'Jersey10-Regular.ttf'],
    ['MedievalSharp', 'MedievalSharp-Regular.ttf'],
    ['Quantico', 'Quantico-Regular.ttf'],
    ['Space_Grotesk', 'SpaceGrotesk-Regular.ttf'],
] as const;

for (const [directory, fileName] of bundledFiles) {
    const fontPath = resolve('src/assets/fonts', directory, fileName);
    const licensePath = resolve('public/licenses/fonts', directory, 'OFL.txt');
    assert.ok(statSync(fontPath).size > 10_000, `${fontPath} should contain a real TTF font.`);
    assert.match(readFileSync(licensePath, 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
}

for (const directory of ['Noto-Sans-JP', 'Noto-Color-Emoji']) {
    const licensePath = resolve('public/licenses/fonts', directory, 'OFL.txt');
    assert.match(readFileSync(licensePath, 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
}

const notoEmojiBytes = readFileSync(resolve(
    'src/assets/fonts/Noto_Color_Emoji/NotoColorEmoji.ttf',
));
assert.ok(notoEmojiBytes.length > 10_000_000);
assert.equal(
    createHash('sha256').update(notoEmojiBytes).digest('hex'),
    '72a635cb3d2f3524c51620cdde406b217204e8a6a06c6a096ff8ed4b5fd6e27b',
);

assert.deepEqual(
    BUNDLED_FONT_OPTIONS.map(font => font.family),
    ['Noto Sans JP', 'Iceberg', 'Jersey 10', 'MedievalSharp', 'Quantico', 'Space Grotesk'],
);
assert.ok(SYSTEM_FONT_OPTIONS.every(font => font.source === 'system'));
assert.deepEqual(EMOJI_FONT_STYLES.map(style => style.id), ['automatic', 'apple', 'segoe', 'noto']);
assert.match(emojiFontFamily('noto'), /^"Noto Color Emoji"/);
assert.equal(emojiStyleAvailable(EMOJI_FONT_STYLES[1], 'MacIntel'), true);
assert.equal(emojiStyleAvailable(EMOJI_FONT_STYLES[1], 'Win32'), false);
assert.equal(emojiStyleAvailable(EMOJI_FONT_STYLES[2], 'Win32'), true);
assert.equal(emojiStyleAvailable(EMOJI_FONT_STYLES[2], 'Linux x86_64'), false);

console.log(JSON.stringify({
    bundledTextFonts: BUNDLED_FONT_OPTIONS.length,
    curatedSystemFonts: SYSTEM_FONT_OPTIONS.length,
    emojiStyles: EMOJI_FONT_STYLES.length,
    licensedFontFamilies: bundledFiles.length + 2,
}));
