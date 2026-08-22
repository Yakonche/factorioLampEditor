export type FontCategory = 'monospace' | 'proportional';
export type FontSource = 'bundled' | 'system' | 'imported';

export interface FontOption {
    family: string;
    label: string;
    category: FontCategory;
    source: FontSource;
}

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

export const emojiStyleAvailable = (style: EmojiFontStyleOption, platform: string): boolean => {
    if (!style.platform) return true;
    const normalizedPlatform = platform.toLocaleLowerCase();
    if (style.platform === 'apple') {
        return normalizedPlatform.includes('mac')
            || normalizedPlatform.includes('iphone')
            || normalizedPlatform.includes('ipad');
    }
    return normalizedPlatform.includes('win');
};
