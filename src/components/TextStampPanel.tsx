import React from 'react';
import {
    DEFAULT_TEXT_VIEWPORT_HEIGHT,
    DEFAULT_TEXT_VIEWPORT_WIDTH,
    splitTextGraphemes,
    type TextCharacterAnimation,
    type TextCharacterStyle,
    type TextScrollDirection,
    type TextStampOptions,
} from '../utils/stamp';
import {
    BUNDLED_FONT_OPTIONS,
    EMOJI_FONT_STYLES,
    SYSTEM_FONT_OPTIONS,
    containsFontFamily,
    emojiFontFamily,
    emojiStyleAvailable,
    emojiStyleLabel,
    fontFamilyCss,
    normalizeFontFamilies,
    readLowestRecommendedPpem,
    resolveAutomaticEmojiStyle,
    type EmojiFontAvailability,
    type EmojiFontStyle,
    type FontCategory,
    type FontOption,
    type FontSource,
} from '../utils/fonts';
import {
    DEFAULT_SCROLL_STEP_TICKS,
    MAX_SCROLL_STEP_TICKS,
    MIN_SCROLL_STEP_TICKS,
    clampScrollStepTicks,
    formatScrollTimingValue,
    scrollCellsPerSecondToTicks,
    scrollSecondsToTicks,
    scrollTicksToCellsPerSecond,
    scrollTicksToSeconds,
} from '../utils/scrollTiming';
import { useI18n } from '../i18n';
import type { NotoAnimatedEmojiEntry } from '../utils/notoAnimatedEmoji';

const EmojiCatalog = React.lazy(() => import('./EmojiCatalog').then(module => ({ default: module.EmojiCatalog })));
const NotoAnimatedEmojiCatalog = React.lazy(() => import('./NotoAnimatedEmojiCatalog').then(module => ({ default: module.NotoAnimatedEmojiCatalog })));

interface TextStampPanelProps {
    initialColor: string;
    onCreate: (options: TextStampOptions) => void;
    onCreateNotoAnimatedEmoji: (entry: NotoAnimatedEmojiEntry, size: number) => Promise<void>;
}

interface ScrollTimingInputProps {
    label: string;
    value: number;
    canIncrease: boolean;
    canDecrease: boolean;
    increaseLabel: string;
    decreaseLabel: string;
    onValueChange: (value: number) => number;
    onStep: (direction: 1 | -1) => number;
}

const ScrollTimingInput: React.FC<ScrollTimingInputProps> = ({
    label,
    value,
    canIncrease,
    canDecrease,
    increaseLabel,
    decreaseLabel,
    onValueChange,
    onStep,
}) => {
    const [draft, setDraft] = React.useState(() => formatScrollTimingValue(value));
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
        if (!focused) setDraft(formatScrollTimingValue(value));
    }, [focused, value]);

    const applyDraft = () => {
        const parsed = Number(draft.replace(',', '.'));
        const canonicalValue = draft.trim() && Number.isFinite(parsed)
            ? onValueChange(parsed)
            : value;
        setDraft(formatScrollTimingValue(canonicalValue));
    };

    const step = (direction: 1 | -1) => {
        setDraft(formatScrollTimingValue(onStep(direction)));
    };

    return (
        <div className="text-[9px] text-gray-500">
            <span>{label}</span>
            <div className="mt-1 flex overflow-hidden rounded border border-gray-600 bg-gray-800 focus-within:border-blue-500">
                <input
                    type="text"
                    inputMode="decimal"
                    aria-label={label}
                    value={draft}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        applyDraft();
                        setFocused(false);
                    }}
                    onChange={(event) => {
                        const nextDraft = event.target.value;
                        if (!/^\d*(?:[.,]\d*)?$/.test(nextDraft)) return;
                        setDraft(nextDraft);
                        const parsed = Number(nextDraft.replace(',', '.'));
                        if (nextDraft.trim() && Number.isFinite(parsed)) onValueChange(parsed);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' && canIncrease) {
                            event.preventDefault();
                            step(1);
                        } else if (event.key === 'ArrowDown' && canDecrease) {
                            event.preventDefault();
                            step(-1);
                        } else if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                        } else if (event.key === 'Escape') {
                            setDraft(formatScrollTimingValue(value));
                            event.currentTarget.blur();
                        }
                    }}
                    className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-xs text-blue-300 outline-none"
                />
                <div className="flex w-6 shrink-0 flex-col border-l border-gray-600">
                    <button
                        type="button"
                        aria-label={`${increaseLabel}: ${label}`}
                        title={`${increaseLabel}: ${label}`}
                        disabled={!canIncrease}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => step(1)}
                        className="flex h-1/2 min-h-3 items-center justify-center border-b border-gray-600 text-[8px] leading-none text-gray-300 hover:bg-gray-700 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-25"
                    >
                        ▲
                    </button>
                    <button
                        type="button"
                        aria-label={`${decreaseLabel}: ${label}`}
                        title={`${decreaseLabel}: ${label}`}
                        disabled={!canDecrease}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => step(-1)}
                        className="flex h-1/2 min-h-3 items-center justify-center text-[8px] leading-none text-gray-300 hover:bg-gray-700 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-25"
                    >
                        ▼
                    </button>
                </div>
            </div>
        </div>
    );
};

const ANIMATED_EMOJIS = [
    { label: 'Blink', frames: ['😐', '😑', '😐', '🙂'] },
    { label: 'Heart', frames: ['❤️', '🩷', '💖', '🩷'] },
    { label: 'Sparkle', frames: ['✨', '🌟', '💫', '🌟'] },
    { label: 'Fire', frames: ['🔥', '❤️‍🔥', '🔥', '✨'] },
    { label: 'Moon', frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'] },
    { label: 'Signal', frames: ['🔴', '🟠', '🟡', '🟢'] },
    { label: 'Clock', frames: ['🕛', '🕒', '🕕', '🕘'] },
    { label: 'Weather', frames: ['☀️', '🌤️', '🌧️', '⛈️', '🌈'] },
    { label: 'Flower', frames: ['🌱', '🌿', '🌷', '🌻'] },
    { label: 'Earth', frames: ['🌍', '🌎', '🌏'] },
    { label: 'Traffic light', frames: ['🔴', '🟡', '🟢', '🟡'] },
    { label: 'Battery', frames: ['🪫', '🔋', '🪫', '🔋'] },
    { label: 'Celebration', frames: ['🎉', '🎊', '✨', '🥳'] },
    { label: 'Faces', frames: ['🙂', '😀', '😂', '🤣'] },
    { label: 'Cats', frames: ['😺', '😸', '😹', '😻'] },
    { label: 'Hearts', frames: ['❤️', '🧡', '💛', '💚', '💙', '💜'] },
    { label: 'Dice', frames: ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] },
] as const;

const fontFingerprintCache = new Map<string, string>();
const recommendedFontSizeCache = new Map<string, number>();

const FONT_PROBE_TEXT = 'BESbswy 0123 @#MWil';
const EMOJI_PROBE_TEXT = '😀🔥❤️🌍';

const fontFingerprint = (fontDeclaration: string, sample = FONT_PROBE_TEXT): string => {
    const cacheKey = `${fontDeclaration}\0${sample}`;
    const cached = fontFingerprintCache.get(cacheKey);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 80;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '';
    context.font = `48px ${fontDeclaration}`;
    context.fillText(sample, 2, 58);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 3; index < pixels.length; index += 4) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619);
    }
    const fingerprint = (hash >>> 0).toString(16);
    fontFingerprintCache.set(cacheKey, fingerprint);
    return fingerprint;
};

const systemFontAvailable = (family: string): boolean => (
    ['monospace', 'serif', 'sans-serif'].some(fallback => (
        fontFingerprint(`"${family.replace(/["\\]/g, '')}", ${fallback}`)
        !== fontFingerprint(fallback)
    ))
);

const nativeEmojiFontAvailable = (family: string): boolean => (
    fontFingerprint(fontFamilyCss(family, '"Noto Color Emoji", sans-serif'), EMOJI_PROBE_TEXT)
    !== fontFingerprint('"Noto Color Emoji", sans-serif', EMOJI_PROBE_TEXT)
);

const detectFontCategory = (family: string): FontCategory => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 'proportional';
    context.font = `32px "${family.replace(/["\\]/g, '')}"`;
    const narrowWidth = context.measureText('iiiiiiiiii').width;
    const wideWidth = context.measureText('WWWWWWWWWW').width;
    return Math.abs(narrowWidth - wideWidth) < 0.5 ? 'monospace' : 'proportional';
};

type FontQualityProbe = {
    text: string;
    minimumHeight: number;
    minimumWidth: number;
};

const FONT_QUALITY_PROBES: readonly FontQualityProbe[] = [
    { text: 'HMW', minimumHeight: 14, minimumWidth: 26 },
    { text: 'xsea', minimumHeight: 10, minimumWidth: 24 },
    { text: '.:', minimumHeight: 3, minimumWidth: 4 },
    { text: 'il1', minimumHeight: 10, minimumWidth: 7 },
    { text: '0O8B', minimumHeight: 14, minimumWidth: 28 },
    { text: 'Égç', minimumHeight: 16, minimumWidth: 18 },
];
const CJK_FONT_QUALITY_PROBE: FontQualityProbe = {
    text: '漢字かなカナ',
    minimumHeight: 18,
    minimumWidth: 72,
};
const FONT_QUALITY_REFERENCE_SIZE = 192;
const FONT_QUALITY_MAXIMUM_SIZE = 96;
const FONT_QUALITY_GEOMETRY_TOLERANCE = 0.12;

const measureFontProbe = (context: CanvasRenderingContext2D, text: string, size: number) => {
    const metrics = context.measureText(text);
    return {
        height: (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0),
        inkWidth: (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0),
        advanceWidth: metrics.width,
        size,
    };
};

const metricDeviation = (value: number, reference: number) => (
    Math.abs(value - reference) / Math.max(0.01, Math.abs(reference))
);

/**
 * Finds the first size whose glyph geometry is stable against a 192 px
 * reference and which keeps a conservative pixel budget for capitals,
 * x-height, punctuation, narrow strokes, counters, and accents. Three
 * consecutive sizes must pass so a lucky hinting step cannot lower the result.
 */
const detectRecommendedMinimumFontSize = (
    family: string,
    designerMinimum = 0,
    inspectExtendedScripts = false,
): number => {
    const cached = recommendedFontSizeCache.get(family);
    if (cached) return Math.max(cached, designerMinimum);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return Math.max(18, designerMinimum);

    const supportsCjk = inspectExtendedScripts && (
        fontFingerprint(fontFamilyCss(family), CJK_FONT_QUALITY_PROBE.text)
        !== fontFingerprint('sans-serif', CJK_FONT_QUALITY_PROBE.text)
    );
    const probes = supportsCjk
        ? [...FONT_QUALITY_PROBES, CJK_FONT_QUALITY_PROBE]
        : FONT_QUALITY_PROBES;
    context.font = `${FONT_QUALITY_REFERENCE_SIZE}px ${fontFamilyCss(family)}`;
    const references = probes.map(probe => (
        measureFontProbe(context, probe.text, FONT_QUALITY_REFERENCE_SIZE)
    ));
    let firstPassingSize: number | null = null;
    let consecutivePassingSizes = 0;
    for (let size = Math.max(8, designerMinimum); size <= FONT_QUALITY_MAXIMUM_SIZE; size++) {
        context.font = `${size}px ${fontFamilyCss(family)}`;
        const passes = probes.every((probe, probeIndex) => {
            const measured = measureFontProbe(context, probe.text, size);
            const reference = references[probeIndex];
            const geometryStable = [
                [measured.height / size, reference.height / reference.size],
                [measured.inkWidth / size, reference.inkWidth / reference.size],
                [measured.advanceWidth / size, reference.advanceWidth / reference.size],
            ].every(([value, referenceValue]) => (
                metricDeviation(value, referenceValue) <= FONT_QUALITY_GEOMETRY_TOLERANCE
            ));
            return geometryStable
                && measured.height >= probe.minimumHeight
                && measured.inkWidth >= probe.minimumWidth;
        });
        if (passes) {
            firstPassingSize ??= size;
            consecutivePassingSizes++;
            if (consecutivePassingSizes >= 3) {
                recommendedFontSizeCache.set(family, firstPassingSize);
                return firstPassingSize;
            }
        } else {
            firstPassingSize = null;
            consecutivePassingSizes = 0;
        }
    }
    recommendedFontSizeCache.set(family, FONT_QUALITY_MAXIMUM_SIZE);
    return FONT_QUALITY_MAXIMUM_SIZE;
};

const selectionGraphemeIndices = (value: string, start: number, end: number): number[] => {
    if (end <= start) return [];
    const result: number[] = [];
    let codeUnitOffset = 0;
    splitTextGraphemes(value).forEach((grapheme, index) => {
        const graphemeEnd = codeUnitOffset + grapheme.length;
        if (codeUnitOffset < end && graphemeEnd > start && grapheme !== '\n') result.push(index);
        codeUnitOffset = graphemeEnd;
    });
    return result;
};

export const TextStampPanel: React.FC<TextStampPanelProps> = ({
    initialColor,
    onCreate,
    onCreateNotoAnimatedEmoji,
}) => {
    const { t } = useI18n();
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const contextMenuRef = React.useRef<HTMLDivElement>(null);
    const textRef = React.useRef('');
    const [text, setText] = React.useState('');
    const [globalStyle, setGlobalStyle] = React.useState<TextCharacterStyle>({
        fontSize: 18,
        fontFamily: 'Noto Sans JP',
        color: initialColor,
    });
    const [characterStyles, setCharacterStyles] = React.useState<Record<number, Partial<TextCharacterStyle>>>({});
    const [animatedCharacters, setAnimatedCharacters] = React.useState<Record<number, TextCharacterAnimation>>({});
    const [importedFonts, setImportedFonts] = React.useState<FontOption[]>([]);
    const [systemFonts, setSystemFonts] = React.useState<FontOption[]>([]);
    const [fontInventory, setFontInventory] = React.useState<{ state: 'loading' | 'detected' | 'fallback'; count: number }>({
        state: 'loading',
        count: 0,
    });
    const [viewportEnabled, setViewportEnabled] = React.useState(false);
    const [viewportWidth, setViewportWidth] = React.useState(DEFAULT_TEXT_VIEWPORT_WIDTH);
    const [viewportHeight, setViewportHeight] = React.useState(DEFAULT_TEXT_VIEWPORT_HEIGHT);
    const [scrollEnabled, setScrollEnabled] = React.useState(true);
    const [scrollDirection, setScrollDirection] = React.useState<TextScrollDirection>('right-to-left');
    const [frameDurationTicks, setFrameDurationTicks] = React.useState(DEFAULT_SCROLL_STEP_TICKS);
    const [fontStatus, setFontStatus] = React.useState('');
    const [emojiStyle, setEmojiStyle] = React.useState<EmojiFontStyle>('automatic');
    const [emojiAvailability, setEmojiAvailability] = React.useState<EmojiFontAvailability>({
        apple: false,
        segoe: false,
        noto: true,
    });
    const [nativeEmojiOpen, setNativeEmojiOpen] = React.useState(false);
    const [animatedEmojiOpen, setAnimatedEmojiOpen] = React.useState(false);
    const [selection, setSelection] = React.useState({ start: 0, end: 0 });
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);

    const platform = navigator.platform ?? navigator.userAgent ?? '';
    const availableFonts = React.useMemo(() => (
        [
            ...BUNDLED_FONT_OPTIONS,
            ...systemFonts,
            ...importedFonts,
        ].map(font => ({
            ...font,
            recommendedMinSize: font.recommendedMinSize ?? detectRecommendedMinimumFontSize(
                font.family,
                0,
                font.family === 'Noto Sans JP',
            ),
        }))
    ), [importedFonts, systemFonts]);
    const automaticEmojiStyle = resolveAutomaticEmojiStyle(emojiAvailability, platform);
    const resolvedEmojiStyle = emojiStyle === 'automatic' ? automaticEmojiStyle : emojiStyle;
    const selectedEmojiFontFamily = emojiFontFamily(resolvedEmojiStyle);
    const verticalScroll = scrollDirection === 'top-to-bottom' || scrollDirection === 'bottom-to-top';
    const selectedGraphemeIndices = React.useMemo(() => (
        selectionGraphemeIndices(text, selection.start, selection.end)
    ), [selection.end, selection.start, text]);

    React.useEffect(() => {
        if (!contextMenu) return;
        const closeMenu = (event: PointerEvent) => {
            if (contextMenuRef.current?.contains(event.target as Node)) return;
            setContextMenu(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setContextMenu(null);
        };
        window.addEventListener('pointerdown', closeMenu);
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            window.removeEventListener('pointerdown', closeMenu);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [contextMenu]);

    React.useEffect(() => {
        let active = true;
        const loadSystemFonts = async () => {
            await document.fonts.ready;
            let families: string[] = [];
            try {
                families = normalizeFontFamilies(
                    await window.factorioLampEditor?.listSystemFonts?.() ?? [],
                );
            } catch (error) {
                console.warn('Unable to request the native system-font inventory.', error);
            }

            const nativeInventoryAvailable = families.length > 0;
            if (!nativeInventoryAvailable) {
                families = SYSTEM_FONT_OPTIONS
                    .filter(font => systemFontAvailable(font.family))
                    .map(font => font.family);
            }

            const bundledFamilies = new Set(BUNDLED_FONT_OPTIONS.map(font => font.family.toLocaleLowerCase()));
            const options = normalizeFontFamilies(families)
                .filter(family => !bundledFamilies.has(family.toLocaleLowerCase()))
                .map<FontOption>(family => ({
                    family,
                    label: family,
                    category: detectFontCategory(family),
                    source: 'system',
                    recommendedMinSize: detectRecommendedMinimumFontSize(family),
                }));
            const installedFamilies = options.map(font => font.family);
            const availability: EmojiFontAvailability = {
                apple: containsFontFamily(families, 'Apple Color Emoji')
                    || nativeEmojiFontAvailable('Apple Color Emoji'),
                segoe: containsFontFamily(families, 'Segoe UI Emoji')
                    || nativeEmojiFontAvailable('Segoe UI Emoji'),
                noto: true,
            };
            if (!active) return;
            setSystemFonts(options);
            setEmojiAvailability(availability);
            setFontInventory({
                state: nativeInventoryAvailable ? 'detected' : 'fallback',
                count: installedFamilies.length,
            });
        };
        void loadSystemFonts();
        return () => {
            active = false;
        };
    }, []);

    const updateText = (nextText: string) => {
        textRef.current = nextText;
        setText(nextText);
    };

    const appendEmoji = (emoji: string) => {
        updateText(textRef.current + emoji);
    };

    const appendAnimatedEmoji = (animation: TextCharacterAnimation) => {
        const nextIndex = splitTextGraphemes(textRef.current).length;
        updateText(textRef.current + animation.frames[0]);
        setAnimatedCharacters(previous => ({
            ...previous,
            [nextIndex]: { ...animation, frames: [...animation.frames] },
        }));
    };

    const importFont = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            setFontStatus(t('Loading font…'));
            const cleanName = file.name.replace(/\.(?:ttf|otf)$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim() || 'Custom font';
            const family = `${cleanName} ${Date.now().toString(36)}`;
            const fontBytes = await file.arrayBuffer();
            const designerMinimum = readLowestRecommendedPpem(fontBytes) ?? 0;
            const fontFace = new FontFace(family, fontBytes);
            await fontFace.load();
            document.fonts.add(fontFace);
            setImportedFonts(previous => [...previous, {
                family,
                label: cleanName,
                category: detectFontCategory(family),
                source: 'imported',
                recommendedMinSize: detectRecommendedMinimumFontSize(family, designerMinimum, true),
            }]);
            setGlobalStyle(previous => ({ ...previous, fontFamily: family }));
            setFontStatus(`${file.name} · ${t('Font loaded')}`);
        } catch (error) {
            console.error('Unable to load font.', error);
            setFontStatus(t('Unsupported or invalid font'));
        }
    };

    const submit = () => onCreate({
        text,
        defaultStyle: globalStyle,
        characterStyles,
        animatedCharacters,
        emojiFontFamily: selectedEmojiFontFamily,
        viewportWidth: viewportEnabled && !verticalScroll ? Math.max(3, viewportWidth) : undefined,
        viewportHeight: viewportEnabled && verticalScroll ? Math.max(3, viewportHeight) : undefined,
        scroll: viewportEnabled && scrollEnabled,
        scrollDirection,
        frameDurationTicks,
    });

    const updateTimingFromSeconds = (seconds: number): number => {
        const ticks = scrollSecondsToTicks(seconds);
        setFrameDurationTicks(ticks);
        return scrollTicksToSeconds(ticks);
    };

    const updateTimingFromTicks = (ticksValue: number): number => {
        const ticks = clampScrollStepTicks(ticksValue);
        setFrameDurationTicks(ticks);
        return ticks;
    };

    const updateTimingFromSpeed = (cellsPerSecond: number): number => {
        const ticks = scrollCellsPerSecondToTicks(cellsPerSecond);
        setFrameDurationTicks(ticks);
        return scrollTicksToCellsPerSecond(ticks);
    };

    const stepTiming = (
        unit: 'seconds' | 'ticks' | 'speed',
        direction: 1 | -1,
    ): number => {
        const tickDirection = unit === 'speed' ? -direction : direction;
        const ticks = clampScrollStepTicks(frameDurationTicks + tickDirection);
        setFrameDurationTicks(ticks);
        if (unit === 'seconds') return scrollTicksToSeconds(ticks);
        if (unit === 'speed') return scrollTicksToCellsPerSecond(ticks);
        return ticks;
    };

    const readTextareaSelection = (textarea = textareaRef.current) => {
        if (!textarea) return;
        setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
    };

    const replaceSelectedText = (replacement: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextText = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
        const caret = start + replacement.length;
        updateText(nextText);
        setAnimatedCharacters({});
        setCharacterStyles({});
        setSelection({ start: caret, end: caret });
        setContextMenu(null);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(caret, caret);
        });
    };

    const copySelection = async (cut = false) => {
        const textarea = textareaRef.current;
        if (!textarea || textarea.selectionEnd <= textarea.selectionStart) return;
        const selectedText = text.slice(textarea.selectionStart, textarea.selectionEnd);
        if (window.factorioLampEditor?.copyText) await window.factorioLampEditor.copyText(selectedText);
        else await navigator.clipboard.writeText(selectedText);
        if (cut) replaceSelectedText('');
        else setContextMenu(null);
    };

    const pasteFromClipboard = async () => {
        try {
            const clipboardText = window.factorioLampEditor?.readText
                ? await window.factorioLampEditor.readText()
                : await navigator.clipboard.readText();
            replaceSelectedText(clipboardText);
        } catch (error) {
            console.warn('Unable to read clipboard text.', error);
            setContextMenu(null);
        }
    };

    const selectionStyleEnabled = (
        property: 'fontWeight' | 'fontStyle' | 'underline',
    ): boolean => selectedGraphemeIndices.length > 0 && selectedGraphemeIndices.every(index => {
        const style = characterStyles[index] ?? {};
        if (property === 'fontWeight') return (style.fontWeight ?? globalStyle.fontWeight) === 'bold';
        if (property === 'fontStyle') return (style.fontStyle ?? globalStyle.fontStyle) === 'italic';
        return Boolean(style.underline ?? globalStyle.underline);
    });

    const toggleSelectionStyle = (property: 'fontWeight' | 'fontStyle' | 'underline') => {
        if (!selectedGraphemeIndices.length) return;
        const enabled = !selectionStyleEnabled(property);
        setCharacterStyles(previous => {
            const next = { ...previous };
            selectedGraphemeIndices.forEach(index => {
                next[index] = {
                    ...next[index],
                    ...(property === 'fontWeight' ? { fontWeight: enabled ? 'bold' : 'normal' } : {}),
                    ...(property === 'fontStyle' ? { fontStyle: enabled ? 'italic' : 'normal' } : {}),
                    ...(property === 'underline' ? { underline: enabled } : {}),
                };
            });
            return next;
        });
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(selection.start, selection.end);
        });
    };

    const renderFontOptions = () => (
        (['bundled', 'system', 'imported'] as FontSource[]).flatMap(source => (
            (['monospace', 'proportional'] as FontCategory[]).map(category => {
                const fonts = availableFonts.filter(font => (
                    font.source === source && font.category === category
                ));
                if (!fonts.length) return null;
                const sourceLabel = t(source === 'bundled'
                    ? 'Bundled fonts'
                    : source === 'system'
                        ? 'System fonts'
                        : 'Imported fonts');
                const categoryLabel = t(category === 'monospace'
                    ? 'Monospaced fonts'
                    : 'Proportional fonts');
                return (
                    <optgroup key={`${source}-${category}`} label={`${sourceLabel} · ${categoryLabel}`}>
                        {fonts.map(font => (
                            <option
                                key={`${font.source}-${font.family}`}
                                value={font.family}
                                style={{ fontFamily: fontFamilyCss(font.family) }}
                            >
                                {font.label} ({font.recommendedMinSize ?? 18} px)
                            </option>
                        ))}
                    </optgroup>
                );
            })
        ))
    );

    return (
        <div className="space-y-3">
            <div className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(event) => {
                            updateText(event.target.value);
                            setAnimatedCharacters({});
                            setCharacterStyles({});
                            requestAnimationFrame(() => readTextareaSelection(event.target));
                        }}
                        onSelect={event => readTextareaSelection(event.currentTarget)}
                        onMouseUp={event => readTextareaSelection(event.currentTarget)}
                        onKeyUp={event => readTextareaSelection(event.currentTarget)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            readTextareaSelection(event.currentTarget);
                            setContextMenu({ x: event.clientX, y: event.clientY });
                        }}
                        placeholder={t('Text\n日本語も対応')}
                        rows={3}
                        className="w-full resize-y rounded border border-gray-600 bg-gray-900 px-3 py-2 text-xs text-yellow-400 outline-none transition-colors focus:border-yellow-500"
                        style={{ fontFamily: selectedEmojiFontFamily }}
                        onKeyDown={(event) => {
                            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    {selectedGraphemeIndices.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 rounded border border-gray-700 bg-gray-900 p-1" aria-label={t('Selected text formatting')}>
                            <span className="mr-1 text-[9px] text-gray-500">{t('Selection')}</span>
                            {([
                                ['fontWeight', 'fa-bold', 'Bold'],
                                ['fontStyle', 'fa-italic', 'Italic'],
                                ['underline', 'fa-underline', 'Underline'],
                            ] as const).map(([property, icon, label]) => (
                                <button
                                    key={property}
                                    type="button"
                                    aria-pressed={selectionStyleEnabled(property)}
                                    aria-label={t(label)}
                                    title={t(label)}
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={() => toggleSelectionStyle(property)}
                                    className={`flex h-7 w-7 items-center justify-center rounded border text-[10px] ${selectionStyleEnabled(property)
                                        ? 'border-yellow-500 bg-yellow-600 text-white'
                                        : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                                >
                                    <i className={`fa-solid ${icon}`} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    className="rounded border border-yellow-500/50 bg-yellow-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-yellow-500 disabled:opacity-40"
                    onClick={submit}
                    disabled={!text}
                    title={t('Create text stamp (Ctrl+Enter)')}
                >
                    {t('Create')}
                </button>
            </div>

            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    role="menu"
                    className="fixed z-[100] min-w-36 overflow-hidden rounded border border-gray-600 bg-gray-800 py-1 text-[10px] text-gray-200 shadow-2xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button type="button" role="menuitem" onClick={() => void pasteFromClipboard()} className="block w-full px-3 py-1.5 text-left hover:bg-gray-700">
                        <i className="fa-solid fa-paste mr-2" />{t('Paste')}
                    </button>
                    <button type="button" role="menuitem" disabled={selection.end <= selection.start} onClick={() => void copySelection()} className="block w-full px-3 py-1.5 text-left hover:bg-gray-700 disabled:opacity-40">
                        <i className="fa-solid fa-copy mr-2" />{t('Copy')}
                    </button>
                    <button type="button" role="menuitem" disabled={selection.end <= selection.start} onClick={() => void copySelection(true)} className="block w-full px-3 py-1.5 text-left hover:bg-gray-700 disabled:opacity-40">
                        <i className="fa-solid fa-scissors mr-2" />{t('Cut')}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            textareaRef.current?.focus();
                            textareaRef.current?.select();
                            setSelection({ start: 0, end: text.length });
                            setContextMenu(null);
                        }}
                        className="block w-full border-t border-gray-700 px-3 py-1.5 text-left hover:bg-gray-700"
                    >
                        {t('Select all')}
                    </button>
                </div>
            )}

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2">
                <label className="text-[9px] font-bold text-gray-500">
                    GLOBAL SIZE
                    <input
                        type="number"
                        min="1"
                        max="128"
                        value={globalStyle.fontSize}
                        onChange={event => setGlobalStyle(previous => ({ ...previous, fontSize: Math.max(1, Math.min(128, Number(event.target.value) || 1)) }))}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-yellow-300 outline-none"
                    />
                </label>
                <label className="col-span-2 text-[9px] font-bold text-gray-500">
                    GLOBAL FONT
                    <select
                        value={globalStyle.fontFamily}
                        onChange={event => setGlobalStyle(previous => ({ ...previous, fontFamily: event.target.value }))}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 outline-none"
                        style={{ fontFamily: fontFamilyCss(globalStyle.fontFamily) }}
                    >
                        {renderFontOptions()}
                    </select>
                </label>
                <label className="col-span-3 text-[9px] font-bold text-gray-500">
                    {t('EMOJI STYLE')}
                    <select
                        value={emojiStyle}
                        onChange={event => setEmojiStyle(event.target.value as EmojiFontStyle)}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 outline-none"
                    >
                        {EMOJI_FONT_STYLES.map(style => {
                            const available = emojiStyleAvailable(style, emojiAvailability);
                            const label = style.id === 'automatic'
                                ? `${t('Automatic')} — ${t('Detected')}: ${t(emojiStyleLabel(automaticEmojiStyle))}`
                                : t(style.label);
                            return (
                                <option key={style.id} value={style.id} disabled={!available}>
                                    {label}{available ? '' : ` — ${t('not detected on this OS')}`}
                                </option>
                            );
                        })}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-[9px] font-bold text-gray-500">
                    COLOR
                    <input
                        type="color"
                        value={globalStyle.color}
                        onChange={event => setGlobalStyle(previous => ({ ...previous, color: event.target.value }))}
                        className="h-7 w-10 rounded border border-gray-600 bg-gray-800"
                    />
                </label>
                <label className="col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[9px] font-bold text-gray-300 hover:bg-gray-700">
                    <i className="fa-solid fa-font" /> {t('Import .ttf / .otf')}
                    <input type="file" accept=".ttf,.otf,font/ttf,font/otf" className="hidden" onChange={importFont} />
                </label>
                {fontStatus && <p className="col-span-3 truncate text-[9px] text-blue-300" title={fontStatus}>{fontStatus}</p>}
                <p className="col-span-3 text-[9px] leading-4 text-blue-300">
                    {fontInventory.state === 'loading'
                        ? t('Detecting system fonts…')
                        : fontInventory.state === 'detected'
                            ? `${fontInventory.count} ${t('system font families detected')}`
                            : `${fontInventory.count} ${t('fallback system font families available')}`}
                </p>
                <p className="col-span-3 text-[9px] leading-4 text-gray-500">
                    {t('Bundled fonts render identically on every OS. Only detected system fonts are listed; imported fonts remain available for this session.')}
                </p>
                <p className="col-span-3 text-[9px] leading-4 text-gray-500">
                    {t('Monospaced fonts keep the same width for every character and are commonly used in IDEs and terminals. Proportional fonts use a width adapted to each character.')}
                </p>
            </div>

            <details
                open={nativeEmojiOpen}
                onToggle={event => setNativeEmojiOpen(event.currentTarget.open)}
                className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900 p-2"
            >
                <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-gray-400">{t('Native emoji library')}</summary>
                {nativeEmojiOpen && (
                    <>
                        <p className="mt-2 text-[9px] leading-4 text-gray-500">
                            {t('Every Unicode RGI emoji is available here. Skin-tone variants are generated when the selected emoji supports them.')}
                        </p>
                        <React.Suspense fallback={<p className="mt-3 text-[9px] text-gray-500">Loading emoji library…</p>}>
                            <EmojiCatalog fontFamily={selectedEmojiFontFamily} onSelect={appendEmoji} />
                        </React.Suspense>
                    </>
                )}
            </details>

            <details
                open={animatedEmojiOpen}
                onToggle={event => setAnimatedEmojiOpen(event.currentTarget.open)}
                className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900 p-2"
            >
                <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-gray-400">{t('Animated emoji library')}</summary>
                {animatedEmojiOpen && (
                    <>
                        <p className="mt-2 text-[9px] leading-4 text-gray-500">
                            {t('Curated presets are text-glyph sequences made by the editor. The official catalog below contains only emoji with real published animation frames.')}
                        </p>
                        <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-fuchsia-300">{t('Curated animated presets')}</p>
                        <div className="mt-2 grid grid-cols-2 gap-1">
                            {ANIMATED_EMOJIS.map(animation => (
                                <button key={animation.label} type="button" onClick={() => appendAnimatedEmoji({ frames: [...animation.frames], effect: 'sequence' })} className="flex min-w-0 items-center gap-2 overflow-hidden rounded border border-gray-700 bg-gray-800 px-2 py-1 text-left text-[9px] text-gray-300 hover:border-fuchsia-500 hover:bg-gray-700">
                                    <span className="shrink-0 text-xl leading-none" style={{ fontFamily: selectedEmojiFontFamily }}>{animation.frames[0]}</span>
                                    <span className="truncate">{animation.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-fuchsia-300">{t('Official Noto Animated Emoji')}</p>
                        <p className="mt-1 text-[9px] leading-4 text-gray-500">
                            {t('881 genuine Google Noto animations are available. Selecting one downloads its animation once and creates a placeable Factorio stamp at the current global size.')}
                            {' '}{t('An internet connection is required the first time an animation is selected.')}
                        </p>
                        <React.Suspense fallback={<p className="mt-3 text-[9px] text-gray-500">Loading emoji library…</p>}>
                            <NotoAnimatedEmojiCatalog
                                onSelect={entry => onCreateNotoAnimatedEmoji(entry, globalStyle.fontSize)}
                            />
                        </React.Suspense>
                        <p className="mt-2 text-[8px] leading-3 text-gray-600">
                            {t('Noto Animated Emoji by Google, licensed under CC BY 4.0.')}
                        </p>
                    </>
                )}
            </details>

            <div className="rounded-lg border border-gray-700 bg-gray-900 p-2">
                <label className="flex cursor-pointer items-center gap-2 text-[10px] text-gray-300">
                    <input type="checkbox" checked={viewportEnabled} onChange={event => setViewportEnabled(event.target.checked)} />
                    {t('Limit display area')}
                </label>
                {viewportEnabled && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="col-span-2 text-[9px] text-gray-500">
                            {t('Scroll direction')}
                            <select
                                value={scrollDirection}
                                onChange={event => setScrollDirection(event.target.value as TextScrollDirection)}
                                className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-blue-300"
                            >
                                <option value="right-to-left">{t('Right to left')}</option>
                                <option value="left-to-right">{t('Left to right')}</option>
                                <option value="top-to-bottom">{t('Top to bottom')}</option>
                                <option value="bottom-to-top">{t('Bottom to top')}</option>
                            </select>
                        </label>
                        <label className="text-[9px] text-gray-500">
                            {t(verticalScroll ? 'Zone height (cells)' : 'Zone width (cells)')}
                            <input
                                type="number"
                                min="3"
                                max="1024"
                                value={verticalScroll ? viewportHeight : viewportWidth}
                                onChange={event => {
                                    const value = Math.max(3, Math.min(1024, Number(event.target.value) || 3));
                                    if (verticalScroll) setViewportHeight(value);
                                    else setViewportWidth(value);
                                }}
                                className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-blue-300"
                            />
                        </label>
                        <ScrollTimingInput
                            label={t('Seconds / step')}
                            value={scrollTicksToSeconds(frameDurationTicks)}
                            canIncrease={frameDurationTicks < MAX_SCROLL_STEP_TICKS}
                            canDecrease={frameDurationTicks > MIN_SCROLL_STEP_TICKS}
                            increaseLabel={t('Increase')}
                            decreaseLabel={t('Decrease')}
                            onValueChange={updateTimingFromSeconds}
                            onStep={direction => stepTiming('seconds', direction)}
                        />
                        <ScrollTimingInput
                            label={t('Ticks / step')}
                            value={frameDurationTicks}
                            canIncrease={frameDurationTicks < MAX_SCROLL_STEP_TICKS}
                            canDecrease={frameDurationTicks > MIN_SCROLL_STEP_TICKS}
                            increaseLabel={t('Increase')}
                            decreaseLabel={t('Decrease')}
                            onValueChange={updateTimingFromTicks}
                            onStep={direction => stepTiming('ticks', direction)}
                        />
                        <ScrollTimingInput
                            label={t('Cells / second')}
                            value={scrollTicksToCellsPerSecond(frameDurationTicks)}
                            canIncrease={frameDurationTicks > MIN_SCROLL_STEP_TICKS}
                            canDecrease={frameDurationTicks < MAX_SCROLL_STEP_TICKS}
                            increaseLabel={t('Increase')}
                            decreaseLabel={t('Decrease')}
                            onValueChange={updateTimingFromSpeed}
                            onStep={direction => stepTiming('speed', direction)}
                        />
                        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[9px] text-gray-300">
                            <input type="checkbox" checked={scrollEnabled} onChange={event => setScrollEnabled(event.target.checked)} />
                            {t('Scroll when the text exceeds the zone')}
                        </label>
                        <p className="col-span-2 text-[9px] leading-4 text-gray-500">
                            One step moves the text by one cell. Timing is quantized to whole Factorio ticks (60 ticks/s; minimum 2 ticks).
                        </p>
                    </div>
                )}
                <p className="mt-2 text-[9px] leading-4 text-gray-500">
                    {t(verticalScroll
                        ? 'Width follows the largest characters automatically. A one-cell empty border is kept on all four sides.'
                        : 'Height follows the largest characters automatically. A one-cell empty border is kept on all four sides.')}
                </p>
            </div>
        </div>
    );
};
