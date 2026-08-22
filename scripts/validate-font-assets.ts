import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    BUNDLED_FONT_OPTIONS,
    EMOJI_FONT_STYLES,
    SYSTEM_FONT_OPTIONS,
    emojiStyleLabel,
    emojiFontFamily,
    emojiStyleAvailable,
    fontFamilyCss,
    normalizeFontFamilies,
    resolveAutomaticEmojiStyle,
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
const windowsEmojiAvailability = { apple: false, segoe: true, noto: true };
const bundledOnlyEmojiAvailability = { apple: false, segoe: false, noto: true };
assert.equal(emojiStyleAvailable(EMOJI_FONT_STYLES[1], windowsEmojiAvailability), false);
assert.equal(emojiStyleAvailable(EMOJI_FONT_STYLES[2], windowsEmojiAvailability), true);
assert.equal(resolveAutomaticEmojiStyle(windowsEmojiAvailability, 'Win32'), 'segoe');
assert.equal(resolveAutomaticEmojiStyle(bundledOnlyEmojiAvailability, 'Linux x86_64'), 'noto');
assert.equal(emojiStyleLabel('noto'), 'Noto Color Emoji (bundled)');
assert.equal(fontFamilyCss('Space "Grotesk'), '"Space Grotesk", sans-serif');
assert.deepEqual(normalizeFontFamilies([' Verdana ', 'arial', 'Arial', '']), ['arial', 'Verdana']);

console.log(JSON.stringify({
    bundledTextFonts: BUNDLED_FONT_OPTIONS.length,
    curatedSystemFonts: SYSTEM_FONT_OPTIONS.length,
    emojiStyles: EMOJI_FONT_STYLES.length,
    licensedFontFamilies: bundledFiles.length + 2,
}));
