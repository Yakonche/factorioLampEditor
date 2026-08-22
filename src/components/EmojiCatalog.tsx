import React from 'react';
import emojiDataJson from 'unicode-emoji-json/data-by-emoji.json';
import { useI18n } from '../i18n';

interface EmojiMetadata {
    name: string;
    slug: string;
    group: string;
    skin_tone_support: boolean;
}

interface EmojiEntry extends EmojiMetadata {
    emoji: string;
}

export type EmojiAnimationEffect = 'blink' | 'twinkle' | 'pulse';

interface EmojiCatalogProps {
    animated?: boolean;
    fontFamily: string;
    onSelect: (emoji: string) => void;
    onSelectAnimated?: (frames: readonly string[]) => void;
}

const PAGE_SIZE = 240;
const EMOJI_DATA = emojiDataJson as Record<string, EmojiMetadata>;
const EMOJI_ENTRIES: EmojiEntry[] = Object.entries(EMOJI_DATA).map(([emoji, metadata]) => ({
    emoji,
    ...metadata,
}));
const EMOJI_GROUPS = [...new Set(EMOJI_ENTRIES.map(entry => entry.group))];

const SKIN_TONES = [
    { value: '', label: 'Default skin tone' },
    { value: '🏻', label: 'Light skin tone' },
    { value: '🏼', label: 'Medium-light skin tone' },
    { value: '🏽', label: 'Medium skin tone' },
    { value: '🏾', label: 'Medium-dark skin tone' },
    { value: '🏿', label: 'Dark skin tone' },
] as const;

const ANIMATION_EFFECTS: Array<{ value: EmojiAnimationEffect; label: string }> = [
    { value: 'blink', label: 'Blink' },
    { value: 'twinkle', label: 'Twinkle' },
    { value: 'pulse', label: 'Pulse' },
];

const EMOJI_MODIFIER_BASE = /\p{Emoji_Modifier_Base}/u;

const applySkinTone = (emoji: string, tone: string, supported: boolean) => {
    if (!tone || !supported) return emoji;
    const codePoints = [...emoji];
    const modifierBaseIndex = codePoints.findIndex(codePoint => EMOJI_MODIFIER_BASE.test(codePoint));
    if (modifierBaseIndex < 0) return emoji;
    codePoints.splice(modifierBaseIndex + 1, 0, tone);
    return codePoints.join('');
};

const createEmojiAnimationFrames = (emoji: string, effect: EmojiAnimationEffect) => {
    if (effect === 'twinkle') return [emoji, '✨', emoji, '💫'];
    if (effect === 'pulse') return [emoji, '▫️', emoji, '▪️'];
    return [emoji, '\u00a0', emoji, '\u00a0'];
};

export const EmojiCatalog: React.FC<EmojiCatalogProps> = ({
    animated = false,
    fontFamily,
    onSelect,
    onSelectAnimated,
}) => {
    const { t } = useI18n();
    const [query, setQuery] = React.useState('');
    const [group, setGroup] = React.useState('');
    const [skinTone, setSkinTone] = React.useState('');
    const [effect, setEffect] = React.useState<EmojiAnimationEffect>('blink');
    const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

    const filteredEntries = React.useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return EMOJI_ENTRIES.filter(entry => {
            if (group && entry.group !== group) return false;
            if (!normalizedQuery) return true;
            return entry.emoji.includes(query)
                || entry.name.toLocaleLowerCase().includes(normalizedQuery)
                || entry.slug.toLocaleLowerCase().includes(normalizedQuery)
                || entry.group.toLocaleLowerCase().includes(normalizedQuery);
        });
    }, [group, query]);

    React.useEffect(() => setVisibleCount(PAGE_SIZE), [group, query, skinTone]);

    const visibleEntries = filteredEntries.slice(0, visibleCount);
    const selectEntry = (entry: EmojiEntry) => {
        const emoji = applySkinTone(entry.emoji, skinTone, entry.skin_tone_support);
        if (animated && onSelectAnimated) onSelectAnimated(createEmojiAnimationFrames(emoji, effect));
        else onSelect(emoji);
    };

    return (
        <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-1">
                <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('Search emoji by name or symbol')}
                    className="col-span-2 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-yellow-500"
                />
                <select
                    value={group}
                    onChange={event => setGroup(event.target.value)}
                    className="min-w-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[9px] text-gray-200 outline-none"
                    aria-label={t('Emoji category')}
                >
                    <option value="">{t('All categories')}</option>
                    {EMOJI_GROUPS.map(groupName => <option key={groupName} value={groupName}>{t(groupName)}</option>)}
                </select>
                <select
                    value={skinTone}
                    onChange={event => setSkinTone(event.target.value)}
                    className="min-w-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[9px] text-gray-200 outline-none"
                    aria-label={t('Emoji skin tone')}
                >
                    {SKIN_TONES.map(tone => <option key={tone.value || 'default'} value={tone.value}>{t(tone.label)}</option>)}
                </select>
                {animated && (
                    <label className="col-span-2 flex items-center gap-2 text-[9px] text-gray-500">
                        <span>{t('Animation effect')}</span>
                        <select
                            value={effect}
                            onChange={event => setEffect(event.target.value as EmojiAnimationEffect)}
                            className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-200 outline-none"
                        >
                            {ANIMATION_EFFECTS.map(animationEffect => (
                                <option key={animationEffect.value} value={animationEffect.value}>{t(animationEffect.label)}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {visibleEntries.length ? (
                <div
                    className="grid max-h-64 w-full gap-1 overflow-x-hidden overflow-y-auto pr-1"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.4rem, 1fr))' }}
                >
                    {visibleEntries.map(entry => {
                        const emoji = applySkinTone(entry.emoji, skinTone, entry.skin_tone_support);
                        return (
                            <button
                                key={`${entry.emoji}-${skinTone || 'default'}`}
                                type="button"
                                onClick={() => selectEntry(entry)}
                                className={`flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded border bg-gray-800 p-0 hover:bg-gray-700 ${animated ? 'border-gray-700 hover:border-fuchsia-500' : 'border-gray-700 hover:border-yellow-500'}`}
                                aria-label={t(`Insert ${entry.name}`)}
                                title={`${entry.name} · ${entry.group}`}
                            >
                                <span className="block text-[22px] leading-none" style={{ fontFamily }}>{emoji}</span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className="rounded border border-gray-700 bg-gray-800/60 px-2 py-3 text-center text-[9px] text-gray-500">
                    {t('No emoji matches this search.')}
                </p>
            )}

            <div className="flex items-center justify-between gap-2 text-[9px] text-gray-500">
                <span>{t(`Showing ${Math.min(visibleCount, filteredEntries.length).toLocaleString()} of ${filteredEntries.length.toLocaleString()} emoji`)}</span>
                {visibleCount < filteredEntries.length && (
                    <button
                        type="button"
                        onClick={() => setVisibleCount(previous => previous + PAGE_SIZE)}
                        className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-300 hover:bg-gray-700"
                    >
                        {t('Show more emoji')}
                    </button>
                )}
            </div>
        </div>
    );
};
