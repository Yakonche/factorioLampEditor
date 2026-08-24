export type FontCategory = 'monospace' | 'proportional';
export type FontSource = 'bundled' | 'system' | 'imported';

export interface FontOption {
    family: string;
    label: string;
    category: FontCategory;
    source: FontSource;
    /** Conservative full-fidelity raster estimate in CSS pixels. */
    recommendedMinSize?: number;
}

interface SfntTable {
    offset: number;
    length: number;
}

export interface OpenTypeFontNames {
    family: string | null;
    subfamily: string | null;
    fullName: string | null;
    postScriptName: string | null;
    displayName: string | null;
}

const findSfntTable = (view: DataView, wantedTag: string): SfntTable | null => {
    if (view.byteLength < 12) return null;
    const tableCount = view.getUint16(4, false);
    for (let tableIndex = 0; tableIndex < tableCount; tableIndex++) {
        const recordOffset = 12 + tableIndex * 16;
        if (recordOffset + 16 > view.byteLength) return null;
        const tag = String.fromCharCode(
            view.getUint8(recordOffset),
            view.getUint8(recordOffset + 1),
            view.getUint8(recordOffset + 2),
            view.getUint8(recordOffset + 3),
        );
        if (tag !== wantedTag) continue;
        const offset = view.getUint32(recordOffset + 8, false);
        const length = view.getUint32(recordOffset + 12, false);
        if (offset > view.byteLength || length > view.byteLength - offset) return null;
        return { offset, length };
    }
    return null;
};

const decodeUtf16BigEndian = (view: DataView, offset: number, length: number): string => {
    const codeUnits: number[] = [];
    const end = offset + length - (length % 2);
    for (let index = offset; index < end; index += 2) {
        codeUnits.push(view.getUint16(index, false));
    }
    let decoded = '';
    for (let index = 0; index < codeUnits.length; index += 1_024) {
        decoded += String.fromCharCode(...codeUnits.slice(index, index + 1_024));
    }
    return decoded;
};

const decodeSingleByteName = (view: DataView, offset: number, length: number): string => {
    let decoded = '';
    for (let index = offset; index < offset + length; index++) {
        decoded += String.fromCharCode(view.getUint8(index));
    }
    return decoded;
};

const cleanFontName = (value: string): string => [...value.normalize('NFC')]
    .filter(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const nameRecordPriority = (platformId: number, languageId: number): number => {
    if (platformId === 3 && languageId === 0x0409) return 0;
    if (platformId === 0 && (languageId === 0 || languageId === 0xffff)) return 1;
    if (platformId === 0) return 2;
    if (platformId === 3) return 3;
    if (platformId === 1 && languageId === 0) return 4;
    if (platformId === 1) return 5;
    return 6;
};

const combineFontFamilyAndStyle = (family: string | null, style: string | null): string | null => {
    if (!family) return null;
    if (!style || /^(regular|normal|roman|book)$/i.test(style)) return family;
    if (family.toLocaleLowerCase().endsWith(style.toLocaleLowerCase())) return family;
    return `${family} ${style}`;
};

/** Reads user-facing names from the OpenType `name` table of a TTF/OTF font. */
export const readOpenTypeFontNames = (fontBytes: ArrayBuffer): OpenTypeFontNames => {
    const emptyNames: OpenTypeFontNames = {
        family: null,
        subfamily: null,
        fullName: null,
        postScriptName: null,
        displayName: null,
    };
    const view = new DataView(fontBytes);
    const table = findSfntTable(view, 'name');
    if (!table || table.length < 6) return emptyNames;

    const recordCount = view.getUint16(table.offset + 2, false);
    const recordsEnd = table.offset + 6 + recordCount * 12;
    const stringsOffset = table.offset + view.getUint16(table.offset + 4, false);
    const tableEnd = table.offset + table.length;
    if (recordsEnd > tableEnd || stringsOffset > tableEnd) return emptyNames;

    const wantedNameIds = new Set([1, 2, 4, 6, 16, 17]);
    const names = new Map<number, { value: string; priority: number }>();
    for (let recordIndex = 0; recordIndex < recordCount; recordIndex++) {
        const recordOffset = table.offset + 6 + recordIndex * 12;
        const platformId = view.getUint16(recordOffset, false);
        const languageId = view.getUint16(recordOffset + 4, false);
        const nameId = view.getUint16(recordOffset + 6, false);
        if (!wantedNameIds.has(nameId)) continue;

        const stringLength = view.getUint16(recordOffset + 8, false);
        const stringOffset = stringsOffset + view.getUint16(recordOffset + 10, false);
        if (stringOffset > tableEnd || stringLength > tableEnd - stringOffset) continue;
        const decoded = platformId === 0 || platformId === 3
            ? decodeUtf16BigEndian(view, stringOffset, stringLength)
            : decodeSingleByteName(view, stringOffset, stringLength);
        const value = cleanFontName(decoded);
        if (!value) continue;

        const priority = nameRecordPriority(platformId, languageId);
        const current = names.get(nameId);
        if (!current || priority < current.priority) names.set(nameId, { value, priority });
    }

    const valueFor = (nameId: number): string | null => names.get(nameId)?.value ?? null;
    const family = valueFor(16) ?? valueFor(1);
    const subfamily = valueFor(17) ?? valueFor(2);
    const fullName = valueFor(4);
    const postScriptName = valueFor(6);
    return {
        family,
        subfamily,
        fullName,
        postScriptName,
        displayName: fullName
            ?? combineFontFamilyAndStyle(family, subfamily)
            ?? postScriptName,
    };
};

/** Reads the font designer's lowest recommended pixels-per-em from an SFNT font. */
export const readLowestRecommendedPpem = (fontBytes: ArrayBuffer): number | null => {
    const view = new DataView(fontBytes);
    const table = findSfntTable(view, 'head');
    if (!table || table.length < 48) return null;
    const pixelsPerEm = view.getUint16(table.offset + 46, false);
    return pixelsPerEm > 0 && pixelsPerEm <= 512 ? pixelsPerEm : null;
};

export const BUNDLED_FONT_OPTIONS: readonly FontOption[] = [
    { family: 'Noto Sans JP', label: 'Noto Sans JP', category: 'proportional', source: 'bundled' },
    { family: 'Iceberg', label: 'Iceberg', category: 'proportional', source: 'bundled' },
    { family: 'Jersey 10', label: 'Jersey 10', category: 'proportional', source: 'bundled' },
    { family: 'MedievalSharp', label: 'MedievalSharp', category: 'proportional', source: 'bundled' },
    { family: 'Quantico', label: 'Quantico', category: 'proportional', source: 'bundled' },
    { family: 'Space Grotesk', label: 'Space Grotesk', category: 'proportional', source: 'bundled' },
];

export const SYSTEM_FONT_OPTIONS: readonly FontOption[] = [
    { family: 'Cascadia Mono', label: 'Cascadia Mono', category: 'monospace', source: 'system' },
    { family: 'Consolas', label: 'Consolas', category: 'monospace', source: 'system' },
    { family: 'Courier New', label: 'Courier New', category: 'monospace', source: 'system' },
    { family: 'Lucida Console', label: 'Lucida Console', category: 'monospace', source: 'system' },
    { family: 'Menlo', label: 'Menlo', category: 'monospace', source: 'system' },
    { family: 'Monaco', label: 'Monaco', category: 'monospace', source: 'system' },
    { family: 'Arial', label: 'Arial', category: 'proportional', source: 'system' },
    { family: 'Arial Black', label: 'Arial Black', category: 'proportional', source: 'system' },
    { family: 'Comic Sans MS', label: 'Comic Sans MS', category: 'proportional', source: 'system' },
    { family: 'Georgia', label: 'Georgia', category: 'proportional', source: 'system' },
    { family: 'Impact', label: 'Impact', category: 'proportional', source: 'system' },
    { family: 'Times New Roman', label: 'Times New Roman', category: 'proportional', source: 'system' },
    { family: 'Trebuchet MS', label: 'Trebuchet MS', category: 'proportional', source: 'system' },
    { family: 'Verdana', label: 'Verdana', category: 'proportional', source: 'system' },
];

export type EmojiFontStyle = 'automatic' | 'apple' | 'segoe' | 'noto';

export interface EmojiFontAvailability {
    apple: boolean;
    segoe: boolean;
    noto: boolean;
}

export interface EmojiFontStyleOption {
    id: EmojiFontStyle;
    label: string;
    family: string;
    platform?: 'apple' | 'windows';
}

export const EMOJI_FONT_STYLES: readonly EmojiFontStyleOption[] = [
    {
        id: 'automatic',
        label: 'Automatic (OS native)',
        family: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
    },
    {
        id: 'apple',
        label: 'Apple Color Emoji',
        family: '"Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif',
        platform: 'apple',
    },
    {
        id: 'segoe',
        label: 'Segoe UI Emoji',
        family: '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif',
        platform: 'windows',
    },
    {
        id: 'noto',
        label: 'Noto Color Emoji (bundled)',
        family: '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
    },
];

export const emojiFontFamily = (style: EmojiFontStyle): string => (
    EMOJI_FONT_STYLES.find(option => option.id === style)?.family
    ?? EMOJI_FONT_STYLES[0].family
);

export const resolveAutomaticEmojiStyle = (
    availability: EmojiFontAvailability,
    platform: string,
): Exclude<EmojiFontStyle, 'automatic'> => {
    const normalizedPlatform = platform.toLocaleLowerCase();
    const applePlatform = normalizedPlatform.includes('mac')
        || normalizedPlatform.includes('iphone')
        || normalizedPlatform.includes('ipad');
    if (applePlatform && availability.apple) return 'apple';
    if (normalizedPlatform.includes('win') && availability.segoe) return 'segoe';
    if (availability.apple) return 'apple';
    if (availability.segoe) return 'segoe';
    return 'noto';
};

export const emojiStyleAvailable = (
    style: EmojiFontStyleOption,
    availability: EmojiFontAvailability,
): boolean => {
    if (style.id === 'apple') return availability.apple;
    if (style.id === 'segoe') return availability.segoe;
    if (style.id === 'noto') return availability.noto;
    return true;
};

export const emojiStyleLabel = (style: Exclude<EmojiFontStyle, 'automatic'>): string => {
    const option = EMOJI_FONT_STYLES.find(candidate => candidate.id === style);
    if (option) return option.label;
    return EMOJI_FONT_STYLES[3].label;
};

export const containsFontFamily = (families: readonly string[], wantedFamily: string): boolean => {
    const normalizedWanted = wantedFamily.trim().toLocaleLowerCase();
    return families.some(family => family.trim().toLocaleLowerCase() === normalizedWanted);
};

export const fontFamilyCss = (family: string, fallback = 'sans-serif'): string => {
    const escapedFamily = family.replace(/["\\]/g, '');
    return `"${escapedFamily}", ${fallback}`;
};

export const normalizeFontFamilies = (families: readonly string[]): string[] => {
    const unique = new Map<string, string>();
    for (const value of families) {
        const family = value.trim().replace(/\s+/g, ' ');
        if (!family) continue;
        const key = family.toLocaleLowerCase();
        if (!unique.has(key)) unique.set(key, family);
    }
    return [...unique.values()].sort((left, right) => left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base',
    }));
};
