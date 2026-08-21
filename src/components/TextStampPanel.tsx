import React from 'react';
import {
    splitTextGraphemes,
    type TextCharacterStyle,
    type TextStampOptions,
} from '../utils/stamp';

interface TextStampPanelProps {
    initialColor: string;
    onCreate: (options: TextStampOptions) => void;
}

const FONT_OPTIONS = [
    'Noto Sans JP',
    'Arial',
    'Arial Black',
    'Comic Sans MS',
    'Courier New',
    'Georgia',
    'Impact',
    'Times New Roman',
    'Trebuchet MS',
    'Verdana',
    'Segoe UI Emoji',
];

const EMOJI_FONT_FAMILY = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

const NATIVE_EMOJIS = [
    '😀', '😂', '🥰', '😍', '🤩', '😎', '😭', '😡', '🤖', '👻',
    '💀', '👽', '🐱', '🐶', '🦊', '🐸', '🐲', '🦄', '❤️', '💔',
    '🔥', '✨', '⭐', '🌈', '☀️', '🌙', '⚡', '💥', '✅', '❌',
    '👍', '👎', '👏', '🙏', '💪', '🎉', '🎵', '🎮', '🚀', '🏭',
    '💡', '⚙️', '🛠️', '🚂', '🛰️', '☢️', '🟢', '🔴', '⬜', '⬛',
];

const ANIMATED_EMOJIS = [
    { label: 'Blink', frames: ['😐', '😑', '😐', '🙂'] },
    { label: 'Heart', frames: ['❤️', '🩷', '💖', '🩷'] },
    { label: 'Sparkle', frames: ['✨', '🌟', '💫', '🌟'] },
    { label: 'Fire', frames: ['🔥', '❤️‍🔥', '🔥', '✨'] },
    { label: 'Moon', frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'] },
    { label: 'Signal', frames: ['🔴', '🟠', '🟡', '🟢'] },
] as const;

export const TextStampPanel: React.FC<TextStampPanelProps> = ({ initialColor, onCreate }) => {
    const [text, setText] = React.useState('');
    const [globalStyle, setGlobalStyle] = React.useState<TextCharacterStyle>({
        fontSize: 14,
        fontFamily: 'Noto Sans JP',
        color: initialColor,
    });
    const [characterStyles, setCharacterStyles] = React.useState<Record<number, Partial<TextCharacterStyle>>>({});
    const [animatedCharacters, setAnimatedCharacters] = React.useState<Record<number, string[]>>({});
    const [selectedCharacter, setSelectedCharacter] = React.useState<number | null>(null);
    const [importedFonts, setImportedFonts] = React.useState<string[]>([]);
    const [viewportEnabled, setViewportEnabled] = React.useState(false);
    const [viewportWidth, setViewportWidth] = React.useState(32);
    const [scrollEnabled, setScrollEnabled] = React.useState(true);
    const [frameSeconds, setFrameSeconds] = React.useState(0.1);
    const [fontStatus, setFontStatus] = React.useState('');

    const graphemes = React.useMemo(() => splitTextGraphemes(text), [text]);
    const availableFonts = [...FONT_OPTIONS, ...importedFonts];
    const selectedOverride = selectedCharacter === null ? undefined : characterStyles[selectedCharacter];
    const selectedStyle: TextCharacterStyle = {
        ...globalStyle,
        ...(selectedOverride ?? {}),
    };

    const updateSelectedStyle = (patch: Partial<TextCharacterStyle>) => {
        if (selectedCharacter === null) return;
        setCharacterStyles(previous => ({
            ...previous,
            [selectedCharacter]: { ...previous[selectedCharacter], ...patch },
        }));
    };

    const appendEmoji = (emoji: string) => {
        const nextIndex = splitTextGraphemes(text).length;
        setText(previous => previous + emoji);
        setSelectedCharacter(nextIndex);
    };

    const appendAnimatedEmoji = (frames: readonly string[]) => {
        const nextIndex = splitTextGraphemes(text).length;
        setText(previous => previous + frames[0]);
        setAnimatedCharacters(previous => ({ ...previous, [nextIndex]: [...frames] }));
        setSelectedCharacter(nextIndex);
    };

    const importFont = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            setFontStatus('Loading font…');
            const cleanName = file.name.replace(/\.(?:ttf|otf)$/i, '').replace(/[^a-z0-9 _-]/gi, '').trim() || 'Custom font';
            const family = `${cleanName} ${Date.now().toString(36)}`;
            const fontFace = new FontFace(family, await file.arrayBuffer());
            await fontFace.load();
            document.fonts.add(fontFace);
            setImportedFonts(previous => [...previous, family]);
            setGlobalStyle(previous => ({ ...previous, fontFamily: family }));
            setFontStatus(`${file.name} loaded`);
        } catch (error) {
            console.error('Unable to load font.', error);
            setFontStatus('Unsupported or invalid font');
        }
    };

    const submit = () => onCreate({
        text,
        defaultStyle: globalStyle,
        characterStyles,
        animatedCharacters,
        viewportWidth: viewportEnabled ? Math.max(3, viewportWidth) : undefined,
        scroll: viewportEnabled && scrollEnabled,
        frameDurationTicks: Math.max(2, Math.round(frameSeconds * 60)),
    });

    return (
        <div className="space-y-3">
            <div className="flex items-stretch gap-2">
                <textarea
                    value={text}
                    onChange={(event) => {
                        setText(event.target.value);
                        setSelectedCharacter(null);
                        setAnimatedCharacters({});
                    }}
                    placeholder={'Text\n日本語も対応'}
                    rows={3}
                    className="min-w-0 flex-1 resize-y rounded border border-gray-600 bg-gray-900 px-3 py-2 text-xs text-yellow-400 outline-none transition-colors focus:border-yellow-500"
                    style={{ fontFamily: EMOJI_FONT_FAMILY }}
                    onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                            event.preventDefault();
                            submit();
                        }
                    }}
                />
                <button
                    type="button"
                    className="rounded border border-yellow-500/50 bg-yellow-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-yellow-500 disabled:opacity-40"
                    onClick={submit}
                    disabled={!text}
                    title="Create text stamp (Ctrl+Enter)"
                >
                    Create
                </button>
            </div>

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
                    >
                        {availableFonts.map(font => <option key={font} value={font}>{font}</option>)}
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
                    <i className="fa-solid fa-font" /> Import .ttf / .otf
                    <input type="file" accept=".ttf,.otf,font/ttf,font/otf" className="hidden" onChange={importFont} />
                </label>
                {fontStatus && <p className="col-span-3 truncate text-[9px] text-blue-300" title={fontStatus}>{fontStatus}</p>}
                <button
                    type="button"
                    onClick={() => setCharacterStyles({})}
                    className="col-span-3 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[9px] text-gray-300 hover:bg-gray-700"
                >
                    Apply global style to every character
                </button>
            </div>

            {graphemes.some(grapheme => grapheme !== '\n') && (
                <div className="rounded-lg border border-gray-700 bg-gray-900 p-2">
                    <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-gray-500">Individual character</p>
                    <div className="mb-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                        {graphemes.map((grapheme, index) => grapheme === '\n' ? null : (
                            <button
                                key={`${index}-${grapheme}`}
                                type="button"
                                onClick={() => setSelectedCharacter(index)}
                                className={`relative min-w-8 rounded border px-2 py-1 text-sm ${selectedCharacter === index ? 'border-fuchsia-400 bg-fuchsia-900 text-white' : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
                                title={`Character ${index + 1}`}
                            >
                                {grapheme}
                                {(characterStyles[index] || animatedCharacters[index]) && <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />}
                            </button>
                        ))}
                    </div>
                    {selectedCharacter !== null && graphemes[selectedCharacter] !== undefined && (
                        <div className="grid grid-cols-3 gap-2 border-t border-gray-700 pt-2">
                            <label className="text-[9px] text-gray-500">
                                Size
                                <input
                                    type="number"
                                    min="1"
                                    max="128"
                                    value={selectedStyle.fontSize}
                                    onChange={event => updateSelectedStyle({ fontSize: Math.max(1, Math.min(128, Number(event.target.value) || 1)) })}
                                    className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-fuchsia-300"
                                />
                            </label>
                            <label className="col-span-2 text-[9px] text-gray-500">
                                Font
                                <select
                                    value={selectedStyle.fontFamily}
                                    onChange={event => updateSelectedStyle({ fontFamily: event.target.value })}
                                    className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                                >
                                    {availableFonts.map(font => <option key={font} value={font}>{font}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-2 text-[9px] text-gray-500">
                                Color
                                <input type="color" value={selectedStyle.color} onChange={event => updateSelectedStyle({ color: event.target.value })} className="h-7 w-10" />
                            </label>
                            <button
                                type="button"
                                onClick={() => {
                                    setCharacterStyles(previous => {
                                        const next = { ...previous };
                                        delete next[selectedCharacter];
                                        return next;
                                    });
                                }}
                                className="col-span-2 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[9px] text-gray-300 hover:bg-gray-700"
                            >
                                Reset this character
                            </button>
                        </div>
                    )}
                </div>
            )}

            <details className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900 p-2">
                <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-gray-400">Native emoji library</summary>
                <div
                    className="mt-2 grid max-h-40 w-full gap-1 overflow-x-hidden overflow-y-auto pr-1"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.25rem, 1fr))' }}
                >
                    {NATIVE_EMOJIS.map((emoji, index) => (
                        <button
                            key={`${emoji}-${index}`}
                            type="button"
                            onClick={() => appendEmoji(emoji)}
                            className="flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded border border-gray-700 bg-gray-800 p-0 hover:border-yellow-500 hover:bg-gray-700"
                            aria-label={`Insert ${emoji}`}
                            title={`Insert ${emoji}`}
                        >
                            <span className="block text-[22px] leading-none" style={{ fontFamily: EMOJI_FONT_FAMILY }}>{emoji}</span>
                        </button>
                    ))}
                </div>
            </details>

            <details className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900 p-2">
                <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-gray-400">Animated emoji library</summary>
                <div className="mt-2 grid grid-cols-2 gap-1">
                    {ANIMATED_EMOJIS.map(animation => (
                        <button key={animation.label} type="button" onClick={() => appendAnimatedEmoji(animation.frames)} className="flex min-w-0 items-center gap-2 overflow-hidden rounded border border-gray-700 bg-gray-800 px-2 py-1 text-left text-[9px] text-gray-300 hover:border-fuchsia-500 hover:bg-gray-700">
                            <span className="shrink-0 text-xl leading-none" style={{ fontFamily: EMOJI_FONT_FAMILY }}>{animation.frames[0]}</span>
                            <span className="truncate">{animation.label}</span>
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[9px] leading-4 text-gray-500">Animated presets generate real Factorio animation frames; they increase blueprint size.</p>
            </details>

            <div className="rounded-lg border border-gray-700 bg-gray-900 p-2">
                <label className="flex cursor-pointer items-center gap-2 text-[10px] text-gray-300">
                    <input type="checkbox" checked={viewportEnabled} onChange={event => setViewportEnabled(event.target.checked)} />
                    Limit display width
                </label>
                {viewportEnabled && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[9px] text-gray-500">
                            Zone width (cells)
                            <input type="number" min="3" max="1024" value={viewportWidth} onChange={event => setViewportWidth(Math.max(3, Math.min(1024, Number(event.target.value) || 3)))} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-blue-300" />
                        </label>
                        <label className="text-[9px] text-gray-500">
                            Seconds / step
                            <input type="number" min="0.034" max="60" step="0.01" value={frameSeconds} onChange={event => setFrameSeconds(Math.max(2 / 60, Math.min(60, Number(event.target.value) || 0.1)))} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-blue-300" />
                        </label>
                        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[9px] text-gray-300">
                            <input type="checkbox" checked={scrollEnabled} onChange={event => setScrollEnabled(event.target.checked)} />
                            Scroll horizontally when the text exceeds the zone
                        </label>
                    </div>
                )}
                <p className="mt-2 text-[9px] leading-4 text-gray-500">Height follows the largest characters automatically. A one-cell empty border is kept on all four sides.</p>
            </div>
        </div>
    );
};
