import React from 'react';
import { useI18n } from '../i18n';
import {
    NOTO_ANIMATED_EMOJI,
    notoAnimatedEmojiPngUrl,
    notoAnimatedEmojiWebpUrl,
    type NotoAnimatedEmojiEntry,
} from '../utils/notoAnimatedEmoji';

interface NotoAnimatedEmojiCatalogProps {
    onSelect: (entry: NotoAnimatedEmojiEntry) => Promise<void> | void;
}

const PAGE_SIZE = 120;
const CATEGORIES = [...new Set(NOTO_ANIMATED_EMOJI.map(entry => entry.category))];

const SCROLL_SETTLE_DELAY_MS = 180;

const AnimatedPreview: React.FC<{
    entry: NotoAnimatedEmojiEntry;
    scrolling: boolean;
}> = ({ entry, scrolling }) => {
    const ref = React.useRef<HTMLImageElement>(null);
    const [visible, setVisible] = React.useState(false);
    const [animationReady, setAnimationReady] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        const element = ref.current;
        if (!element) return;
        if (!('IntersectionObserver' in window)) {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            setVisible(entries.some(candidate => candidate.isIntersecting));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    React.useEffect(() => {
        if (!visible || animationReady || failed) return;
        let cancelled = false;
        const image = new Image();
        const markReady = () => {
            if (!cancelled) setAnimationReady(true);
        };
        image.decoding = 'async';
        image.onload = () => {
            if (typeof image.decode === 'function') {
                void image.decode().then(markReady, markReady);
            } else {
                markReady();
            }
        };
        image.onerror = () => {
            if (!cancelled) setFailed(true);
        };
        image.src = notoAnimatedEmojiWebpUrl(entry.codepoint);
        return () => {
            cancelled = true;
            image.onload = null;
            image.onerror = null;
        };
    }, [animationReady, entry.codepoint, failed, visible]);

    const animate = visible && animationReady && !scrolling && !failed;

    return (
        <img
            ref={ref}
            src={animate
                ? notoAnimatedEmojiWebpUrl(entry.codepoint)
                : notoAnimatedEmojiPngUrl(entry.codepoint)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-9 w-9 object-contain"
        />
    );
};

export const NotoAnimatedEmojiCatalog: React.FC<NotoAnimatedEmojiCatalogProps> = ({ onSelect }) => {
    const { t } = useI18n();
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const scrollSettleTimerRef = React.useRef<number | null>(null);
    const [query, setQuery] = React.useState('');
    const [category, setCategory] = React.useState('');
    const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
    const [loadingCodepoint, setLoadingCodepoint] = React.useState('');
    const [scrolling, setScrolling] = React.useState(false);

    const filteredEntries = React.useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return NOTO_ANIMATED_EMOJI.filter(entry => {
            if (category && entry.category !== category) return false;
            if (!normalizedQuery) return true;
            return entry.emoji.includes(query)
                || entry.name.toLocaleLowerCase().includes(normalizedQuery)
                || entry.category.toLocaleLowerCase().includes(normalizedQuery)
                || entry.tags.some(tag => tag.toLocaleLowerCase().includes(normalizedQuery));
        });
    }, [category, query]);

    React.useEffect(() => {
        setVisibleCount(PAGE_SIZE);
        scrollContainerRef.current?.scrollTo({ top: 0 });
    }, [category, query]);

    React.useEffect(() => () => {
        if (scrollSettleTimerRef.current !== null) {
            window.clearTimeout(scrollSettleTimerRef.current);
        }
    }, []);

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const container = event.currentTarget;
        setScrolling(true);
        if (scrollSettleTimerRef.current !== null) {
            window.clearTimeout(scrollSettleTimerRef.current);
        }
        scrollSettleTimerRef.current = window.setTimeout(() => {
            scrollSettleTimerRef.current = null;
            setScrolling(false);
        }, SCROLL_SETTLE_DELAY_MS);

        const remainingScroll = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (remainingScroll <= 24) {
            setVisibleCount(previous => Math.min(filteredEntries.length, previous + PAGE_SIZE));
        }
    };

    const selectEntry = async (entry: NotoAnimatedEmojiEntry) => {
        if (loadingCodepoint) return;
        setLoadingCodepoint(entry.codepoint);
        try {
            await onSelect(entry);
        } finally {
            setLoadingCodepoint('');
        }
    };

    const visibleEntries = filteredEntries.slice(0, visibleCount);
    return (
        <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-1">
                <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('Search animated emoji by name or symbol')}
                    className="col-span-2 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-fuchsia-500"
                />
                <select
                    value={category}
                    onChange={event => setCategory(event.target.value)}
                    aria-label={t('Animated emoji category')}
                    className="col-span-2 min-w-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[9px] text-gray-200 outline-none"
                >
                    <option value="">{t('All categories')}</option>
                    {CATEGORIES.map(categoryName => (
                        <option key={categoryName} value={categoryName}>{t(categoryName)}</option>
                    ))}
                </select>
            </div>

            {visibleEntries.length ? (
                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="grid max-h-64 w-full gap-1 overflow-x-hidden overflow-y-auto pr-1"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(3rem, 1fr))' }}
                >
                    {visibleEntries.map(entry => (
                        <button
                            key={entry.codepoint}
                            type="button"
                            disabled={Boolean(loadingCodepoint)}
                            onClick={() => void selectEntry(entry)}
                            aria-label={`${t('Create animated stamp')}: ${entry.name}`}
                            title={`${entry.name} · ${entry.category}`}
                            className="relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded border border-gray-700 bg-gray-800 p-0 hover:border-fuchsia-500 hover:bg-gray-700 disabled:cursor-wait disabled:opacity-50"
                        >
                            <AnimatedPreview entry={entry} scrolling={scrolling} />
                            {loadingCodepoint === entry.codepoint && (
                                <span className="absolute inset-0 flex items-center justify-center bg-gray-950/70 text-fuchsia-200">
                                    <i className="fa-solid fa-spinner animate-spin" aria-hidden="true" />
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="rounded border border-gray-700 bg-gray-800/60 px-2 py-3 text-center text-[9px] text-gray-500">
                    {t('No animated emoji matches this search.')}
                </p>
            )}

            <div className="flex items-center justify-between gap-2 text-[9px] text-gray-500">
                <span>{Math.min(visibleCount, filteredEntries.length).toLocaleString()} / {filteredEntries.length.toLocaleString()}</span>
            </div>
        </div>
    );
};
