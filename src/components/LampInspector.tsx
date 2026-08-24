import React from 'react';
import { useI18n } from '../i18n';
import { colorToUint32, uint32ToHex, uint32ToRgb } from '../utils/grid';

interface LampInspectorProps {
    x: number;
    y: number;
    color: number;
    hasAnimation: boolean;
    isPlaying: boolean;
    frame: number;
    frameCount: number;
    onTogglePlayback: () => void;
    onChangeColor: (color: number) => void;
    onClose: () => void;
}

type ColorDraft = {
    r: string;
    g: string;
    b: string;
    hex: string;
};

const draftFromColor = (color: number): ColorDraft => {
    const { r, g, b } = uint32ToRgb(color);
    return { r: String(r), g: String(g), b: String(b), hex: uint32ToHex(color).toUpperCase() };
};

export const LampInspector: React.FC<LampInspectorProps> = ({
    x,
    y,
    color,
    hasAnimation,
    isPlaying,
    frame,
    frameCount,
    onTogglePlayback,
    onChangeColor,
    onClose,
}) => {
    const { t } = useI18n();
    const [draft, setDraft] = React.useState<ColorDraft>(() => draftFromColor(color));
    const editingDisabled = hasAnimation && isPlaying;
    const currentRgb = uint32ToRgb(color);
    const currentHex = uint32ToHex(color).toUpperCase();

    React.useEffect(() => {
        setDraft(draftFromColor(color));
    }, [color]);

    const resetDraft = () => setDraft(draftFromColor(color));
    const updateChannel = (channel: 'r' | 'g' | 'b', rawValue: string) => {
        if (editingDisabled) return;
        setDraft(current => ({ ...current, [channel]: rawValue }));
        if (!/^\d{1,3}$/.test(rawValue)) return;
        const value = Number(rawValue);
        if (!Number.isInteger(value) || value < 0 || value > 255) return;
        const next = { ...currentRgb, [channel]: value };
        onChangeColor(colorToUint32(
            `#${[next.r, next.g, next.b].map(part => part.toString(16).padStart(2, '0')).join('')}`,
        ));
    };

    const updateHex = (rawValue: string) => {
        if (editingDisabled) return;
        const normalizedDraft = rawValue.startsWith('#') ? rawValue : `#${rawValue}`;
        setDraft(current => ({ ...current, hex: normalizedDraft.toUpperCase() }));
        if (/^#[0-9a-fA-F]{6}$/.test(normalizedDraft)) {
            onChangeColor(colorToUint32(normalizedDraft));
        }
    };

    return (
        <section
            role="dialog"
            aria-label={t('Lamp inspector')}
            className="absolute right-4 top-20 z-40 w-[min(22rem,calc(100%-2rem))] rounded-xl border border-cyan-400/40 bg-gray-950/95 p-4 text-gray-100 shadow-2xl backdrop-blur-md"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-cyan-300">
                        {t('Lamp inspector')}
                    </h2>
                    <p className="mt-1 font-mono text-[11px] text-gray-400">
                        {t('Lamp')} X : {x} · Y : {y}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-7 w-7 items-center justify-center rounded border border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-white"
                    title={t('Close')}
                    aria-label={t('Close')}
                >
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
            </div>

            {hasAnimation && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-cyan-900 bg-cyan-950/40 p-2.5">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                            {isPlaying ? t('Live animation') : t('Animation paused')}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-cyan-100/70">
                            {t('Frame')} {Math.min(frame + 1, frameCount)} / {frameCount} · 60 {t('ticks/s')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onTogglePlayback}
                        className="flex shrink-0 items-center gap-2 rounded border border-cyan-500/40 bg-cyan-900/70 px-3 py-2 text-[10px] font-bold uppercase text-cyan-100 hover:bg-cyan-800"
                        aria-pressed={!isPlaying}
                    >
                        <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`} aria-hidden="true"></i>
                        {isPlaying ? t('Pause') : t('Play')}
                    </button>
                </div>
            )}

            <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/80 p-3">
                <span
                    className="h-12 w-12 shrink-0 rounded border-2 border-gray-600 shadow-inner"
                    style={{ backgroundColor: currentHex }}
                    aria-hidden="true"
                ></span>
                <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-white">
                        RGB({currentRgb.r}, {currentRgb.g}, {currentRgb.b})
                    </p>
                    <p className="mt-1 font-mono text-xs text-cyan-300">{currentHex}</p>
                    {!color && (
                        <p className="mt-1 text-[10px] font-semibold text-amber-300">
                            {t('Transparent / off in this frame')}
                        </p>
                    )}
                </div>
            </div>

            <fieldset disabled={editingDisabled} className="mt-3 disabled:opacity-45">
                <legend className="sr-only">{t('Lamp color')}</legend>
                <div className="grid grid-cols-3 gap-2">
                    {(['r', 'g', 'b'] as const).map(channel => (
                        <label key={channel} className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                            {t(channel === 'r' ? 'Red' : channel === 'g' ? 'Green' : 'Blue')}
                            <input
                                type="number"
                                min={0}
                                max={255}
                                step={1}
                                value={draft[channel]}
                                onChange={event => updateChannel(channel, event.target.value)}
                                onBlur={resetDraft}
                                className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                        {t('Hexadecimal')}
                        <input
                            type="text"
                            inputMode="text"
                            maxLength={7}
                            value={draft.hex}
                            onChange={event => updateHex(event.target.value)}
                            onBlur={resetDraft}
                            className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 font-mono text-xs uppercase text-white outline-none focus:border-cyan-400"
                            aria-label={t('Hexadecimal color')}
                        />
                    </label>
                    <label className="flex h-[38px] w-[50px] cursor-pointer items-center justify-center rounded border border-gray-600 bg-gray-800 p-1" title={t('Color picker')}>
                        <span className="sr-only">{t('Color picker')}</span>
                        <input
                            type="color"
                            value={currentHex}
                            onChange={event => onChangeColor(colorToUint32(event.target.value))}
                            className="h-full w-full cursor-pointer border-0 bg-transparent p-0"
                            aria-label={t('Color picker')}
                        />
                    </label>
                </div>
            </fieldset>

            {editingDisabled ? (
                <p className="mt-3 rounded border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-[10px] leading-4 text-amber-200">
                    {t('Pause the animation before changing this lamp.')}
                </p>
            ) : hasAnimation ? (
                <p className="mt-3 text-[10px] leading-4 text-gray-500">
                    {t('The selected color changes only the currently displayed animation frame.')}
                </p>
            ) : null}
        </section>
    );
};
