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
    readLowestRecommendedPpem,
    readOpenTypeFontNames,
    resolveAutomaticEmojiStyle,
} from '../src/utils/fonts';

const makeNamedTestFont = (records: ReadonlyArray<readonly [number, string]>): ArrayBuffer => {
    const encodedRecords = records.map(([nameId, value]) => {
        const bytes = new Uint8Array(value.length * 2);
        for (let index = 0; index < value.length; index++) {
            const codeUnit = value.charCodeAt(index);
            bytes[index * 2] = codeUnit >>> 8;
            bytes[index * 2 + 1] = codeUnit & 0xff;
        }
        return { nameId, bytes };
    });
    const nameHeaderLength = 6 + encodedRecords.length * 12;
    const nameTableLength = nameHeaderLength
        + encodedRecords.reduce((total, record) => total + record.bytes.length, 0);
    const nameTableOffset = 28;
    const font = new ArrayBuffer(nameTableOffset + nameTableLength);
    const view = new DataView(font);
    view.setUint16(4, 1, false);
    for (const [index, character] of [...'name'].entries()) {
        view.setUint8(12 + index, character.charCodeAt(0));
    }
    view.setUint32(20, nameTableOffset, false);
    view.setUint32(24, nameTableLength, false);
    view.setUint16(nameTableOffset + 2, encodedRecords.length, false);
    view.setUint16(nameTableOffset + 4, nameHeaderLength, false);

    let relativeStringOffset = 0;
    for (const [recordIndex, record] of encodedRecords.entries()) {
        const recordOffset = nameTableOffset + 6 + recordIndex * 12;
        view.setUint16(recordOffset, 3, false);
        view.setUint16(recordOffset + 2, 1, false);
        view.setUint16(recordOffset + 4, 0x0409, false);
        view.setUint16(recordOffset + 6, record.nameId, false);
        view.setUint16(recordOffset + 8, record.bytes.length, false);
        view.setUint16(recordOffset + 10, relativeStringOffset, false);
        new Uint8Array(font, nameTableOffset + nameHeaderLength + relativeStringOffset, record.bytes.length)
            .set(record.bytes);
        relativeStringOffset += record.bytes.length;
    }
    return font;
};

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

const icebergFont = readFileSync(resolve('src/assets/fonts/Iceberg/Iceberg-Regular.ttf'));
const icebergBuffer = icebergFont.buffer.slice(
    icebergFont.byteOffset,
    icebergFont.byteOffset + icebergFont.byteLength,
) as ArrayBuffer;
assert.ok((readLowestRecommendedPpem(icebergBuffer) ?? 0) > 0);
assert.equal(readLowestRecommendedPpem(new ArrayBuffer(4)), null);
assert.match(readOpenTypeFontNames(icebergBuffer).displayName ?? '', /Iceberg/i);
assert.deepEqual(
    readOpenTypeFontNames(makeNamedTestFont([
        [1, 'SDK_JP_Web'],
        [2, 'Heavy'],
        [4, 'SDK_JP_Web Heavy'],
        [6, 'SDKJPWeb-Heavy'],
    ])),
    {
        family: 'SDK_JP_Web',
        subfamily: 'Heavy',
        fullName: 'SDK_JP_Web Heavy',
        postScriptName: 'SDKJPWeb-Heavy',
        displayName: 'SDK_JP_Web Heavy',
    },
);
assert.equal(readOpenTypeFontNames(new ArrayBuffer(4)).displayName, null);

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
