import React from 'react';
import emojiDataJson from 'unicode-emoji-json/data-by-emoji.json';
import { useI18n } from '../i18n';
import type { EmojiFontStyle } from '../utils/fonts';
import { emojiArtworkProviderForStyle, emojiAssetKey, loadEmojiAsset } from '../utils/emojiAssets';

interface EmojiMetadata {
    name: string;
    slug: string;
    group: string;
    skin_tone_support: boolean;
}

interface EmojiEntry extends EmojiMetadata {
    emoji: string;
}

interface EmojiCatalogProps {
    fontFamily: string;
    emojiStyle: Exclude<EmojiFontStyle, 'automatic'>;
    onSelect: (emoji: string) => void;
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

const EMOJI_MODIFIER_BASE = /\p{Emoji_Modifier_Base}/u;

const applySkinTone = (emoji: string, tone: string, supported: boolean) => {
    if (!tone || !supported) return emoji;
    const codePoints = [...emoji];
    const modifierBaseIndex = codePoints.findIndex(codePoint => EMOJI_MODIFIER_BASE.test(codePoint));
    if (modifierBaseIndex < 0) return emoji;
    codePoints.splice(modifierBaseIndex + 1, 0, tone);
    return codePoints.join('');
};

const EmojiPreview: React.FC<{
    emoji: string;
    emojiStyle: Exclude<EmojiFontStyle, 'automatic'>;
    fontFamily: string;
}> = ({ emoji, emojiStyle, fontFamily }) => {
    const [artworkUrl, setArtworkUrl] = React.useState<string | null>(null);
    const provider = emojiArtworkProviderForStyle(emojiStyle);
    const assetKey = provider ? emojiAssetKey(provider, emoji) : null;
    React.useEffect(() => {
        let active = true;
        let objectUrl: string | null = null;
        setArtworkUrl(null);
        if (provider && assetKey) {
            void loadEmojiAsset(provider, assetKey).then(asset => {
                if (!active) return;
                objectUrl = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mimeType }));
                setArtworkUrl(objectUrl);
            }).catch(error => {
                console.warn(`Unable to preview ${provider} emoji artwork.`, error);
            });
        }
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [assetKey, provider]);
    if (artworkUrl) {
        return (
            <img
                src={artworkUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-[26px] w-[26px] object-contain"
            />
        );
    }
    return (
        <span className="block text-[22px] leading-none" style={{ fontFamily }}>
            {emoji}
        </span>
    );
};

export const EmojiCatalog: React.FC<EmojiCatalogProps> = ({
    fontFamily,
    emojiStyle,
    onSelect,
}) => {
    const { t } = useI18n();
    const [query, setQuery] = React.useState('');
    const [group, setGroup] = React.useState('');
    const [skinTone, setSkinTone] = React.useState('');
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
        onSelect(emoji);
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
                                className="flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded border border-gray-700 bg-gray-800 p-0 hover:border-yellow-500 hover:bg-gray-700"
                                aria-label={t(`Insert ${entry.name}`)}
                                title={`${entry.name} · ${entry.group}`}
                            >
                                <EmojiPreview emoji={emoji} emojiStyle={emojiStyle} fontFamily={fontFamily} />
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
