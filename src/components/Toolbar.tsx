import React from 'react';
import {
    ARITHMETIC_COMBINATOR_POWER_WATTS,
    BACKGROUND_TILES,
    DECIDER_COMBINATOR_POWER_WATTS,
    LAMP_POWER_WATTS,
    MAX_DEFINITION_LIMIT,
    QUALITY_COLORS,
    QUALITY_IMAGES,
    QUALITY_NAMES,
    POLE_DATA,
    PROGRAMMABLE_SPEAKER_POWER_WATTS,
    ROBOPORT_DRAIN_WATTS,
    type BackgroundTileName,
} from '../constants';
import type { AnimationControllerSide } from '../utils/blueprint';
import type { StampBuffer, TextStampOptions } from '../utils/stamp';
import {
    AUDIO_INSTRUMENTS,
    resolveAudioVoices,
    type AudioInstrumentSelection,
    type DecodedAudioTrack,
} from '../utils/audio';
import { TextStampPanel } from './TextStampPanel';
import { AudioPreviewControls } from './AudioPreviewControls';
import { useI18n } from '../i18n';
import type { NotoAnimatedEmojiEntry } from '../utils/notoAnimatedEmoji';

export type ToolType = 'brush' | 'fill' | 'erase' | 'pan';

export interface MediaAnimationInfo {
    sourceName: string;
    sourceWidth: number;
    sourceHeight: number;
    width: number;
    height: number;
    sampledFrameCount: number;
    frameCount: number;
    sampledFps: number;
    factorioFps: number;
    durationTicks: number;
    gifTimingRepaired?: boolean;
    gifEmbeddedFrameCount?: number;
    resizable?: boolean;
}

export type MediaColorMode = 'full' | 'grayscale' | 'monochrome';

export interface SequenceFrameInfo {
    id: string;
    sourceName: string;
    originalWidth: number;
    originalHeight: number;
    currentWidth: number;
    currentHeight: number;
    delaySeconds: number;
    thumbnailUrl: string;
}

interface ToolbarProps {
    currentTool: ToolType;
    setTool: (t: ToolType) => void;
    color: string;
    setColor: (c: string) => void;
    onUndo: () => void;
    onRedo: () => void;

    // Stamp props
    renderTextStamp: (options: TextStampOptions) => void;
    renderNotoAnimatedEmojiStamp: (
        entry: NotoAnimatedEmojiEntry,
        size: number,
        activateGridStamp: boolean,
    ) => Promise<StampBuffer | null>;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onImageDimensionChange: (axis: 'width' | 'height', value: number) => void;
    lockImageAspectRatio: boolean;
    setLockImageAspectRatio: (value: boolean) => void;

    // Pole Props
    autoPole: boolean;
    setAutoPole: (v: boolean) => void;
    autoRoboport: boolean;
    setAutoRoboport: (v: boolean) => void;
    autoConstruction: boolean;
    setAutoConstruction: (v: boolean) => void;
    smartPlacement: boolean;
    setSmartPlacement: (v: boolean) => void;
    poleType: string;
    setPoleType: (v: string) => void;
    qualityIdx: number;
    setQualityIdx: (v: number) => void;
    isDragging?: boolean;
    lampCount: number;
    relayPoleCount: number;
    deciderCombinatorCount: number;
    arithmeticCombinatorCount: number;
    constantCombinatorCount: number;
    displayPanelCount: number;
    programmableSpeakerCount: number;
    poleCount: number;
    controllerPoleCount: number;
    roboportCount: number;
    imageDimensions?: {
        originalWidth: number;
        originalHeight: number;
        currentWidth: number;
        currentHeight: number;
    };
    maxDefinition: number;
    setMaxDefinition: (value: number) => void;
    maxFrameCount: number;
    setMaxFrameCount: (value: number) => void;
    backgroundTile: BackgroundTileName;
    setBackgroundTile: (value: BackgroundTileName) => void;
    animationEnabled: boolean;
    setAnimationEnabled: (value: boolean) => void;
    onSequenceImagesUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    sequenceFrameCount: number;
    sequenceGlobalDelaySeconds: number;
    onSequenceGlobalDelayChange: (seconds: number) => void;
    includeAnimationHelp: boolean;
    setIncludeAnimationHelp: (value: boolean) => void;
    animationControllerSide: AnimationControllerSide;
    setAnimationControllerSide: (side: AnimationControllerSide) => void;
    onMediaUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    mediaFpsLimit: number;
    setMediaFpsLimit: (fps: number) => void;
    mediaColorMode: MediaColorMode;
    setMediaColorMode: (mode: MediaColorMode) => void;
    mediaMonochromeThreshold: number;
    setMediaMonochromeThreshold: (value: number) => void;
    mediaDifferenceThreshold: number;
    setMediaDifferenceThreshold: (value: number) => void;
    onMediaDimensionChange: (axis: 'width' | 'height', value: number) => void;
    mediaAnimationInfo?: MediaAnimationInfo;
    mediaImporting: boolean;
    mediaPreviewFrame: number;
    setMediaPreviewFrame: (frame: number) => void;
    onRemoveMediaAnimation: () => void;
    onAudioUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    audioNotesPerSecond: number;
    setAudioNotesPerSecond: (value: number) => void;
    audioVoicesPerChannel: number;
    setAudioVoicesPerChannel: (value: number) => void;
    audioTrackInfo?: DecodedAudioTrack;
    audioImporting: boolean;
    onRemoveAudioTrack: () => void;
    audioPlaced: boolean;
    onPlaceAudioTrack: () => void;
    hasAnimation: boolean;
    audioLinkedToAnimation: boolean;
    setAudioLinkedToAnimation: (value: boolean) => void;
    leftAudioInstrument: AudioInstrumentSelection;
    setLeftAudioInstrument: (value: AudioInstrumentSelection) => void;
    rightAudioInstrument: AudioInstrumentSelection;
    setRightAudioInstrument: (value: AudioInstrumentSelection) => void;
}

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatPower = (watts: number) => (
    watts >= 1_000_000
        ? `${formatNumber(watts / 1_000_000)} MW`
        : `${formatNumber(watts / 1_000)} kW`
);

const formatEnergyPerSecond = (watts: number) => (
    watts >= 1_000_000
        ? `${formatNumber(watts / 1_000_000)} MJ/s`
        : `${formatNumber(watts / 1_000)} kJ/s`
);

const SIDEBAR_STORAGE_KEY = 'factorio-lamp-editor.sidebar-width';
const SIDEBAR_DEFAULT_WIDTH = 288;
const SIDEBAR_MIN_WIDTH = 256;
const SIDEBAR_MAX_WIDTH = 640;

const clampSidebarWidth = (width: number) => {
    const viewportMaximum = typeof window === 'undefined'
        ? SIDEBAR_MAX_WIDTH
        : Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 320));
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(viewportMaximum, Math.round(width)));
};

export const Toolbar: React.FC<ToolbarProps> = ({
    currentTool, setTool,
    color, setColor,
    onUndo, onRedo,
    renderTextStamp, renderNotoAnimatedEmojiStamp, onImageUpload, onImageDimensionChange,
    lockImageAspectRatio, setLockImageAspectRatio,
    autoPole, setAutoPole,
    autoRoboport, setAutoRoboport,
    autoConstruction, setAutoConstruction,
    smartPlacement, setSmartPlacement,
    poleType, setPoleType,
    qualityIdx, setQualityIdx,
    isDragging = false,
    lampCount, relayPoleCount,
    deciderCombinatorCount, arithmeticCombinatorCount, constantCombinatorCount, displayPanelCount,
    programmableSpeakerCount,
    poleCount, controllerPoleCount, roboportCount, imageDimensions,
    maxDefinition, setMaxDefinition,
    maxFrameCount, setMaxFrameCount,
    backgroundTile, setBackgroundTile,
    animationEnabled, setAnimationEnabled,
    onSequenceImagesUpload, sequenceFrameCount,
    sequenceGlobalDelaySeconds, onSequenceGlobalDelayChange,
    includeAnimationHelp, setIncludeAnimationHelp,
    animationControllerSide, setAnimationControllerSide,
    onMediaUpload, mediaFpsLimit, setMediaFpsLimit,
    mediaColorMode, setMediaColorMode,
    mediaMonochromeThreshold, setMediaMonochromeThreshold,
    mediaDifferenceThreshold, setMediaDifferenceThreshold,
    onMediaDimensionChange,
    mediaAnimationInfo, mediaImporting, mediaPreviewFrame,
    setMediaPreviewFrame, onRemoveMediaAnimation,
    onAudioUpload, audioNotesPerSecond, setAudioNotesPerSecond,
    audioVoicesPerChannel, setAudioVoicesPerChannel,
    audioTrackInfo, audioImporting, onRemoveAudioTrack,
    audioPlaced, onPlaceAudioTrack,
    hasAnimation, audioLinkedToAnimation, setAudioLinkedToAnimation,
    leftAudioInstrument, setLeftAudioInstrument,
    rightAudioInstrument, setRightAudioInstrument,
}) => {
    const { t } = useI18n();
    const [showQualityDropdown, setShowQualityDropdown] = React.useState(false);
    const [sidebarWidth, setSidebarWidth] = React.useState(() => {
        if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
        const stored = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
        return Number.isFinite(stored) ? clampSidebarWidth(stored) : SIDEBAR_DEFAULT_WIDTH;
    });
    const [resizingSidebar, setResizingSidebar] = React.useState(false);
    const resizeStartRef = React.useRef({ clientX: 0, width: SIDEBAR_DEFAULT_WIDTH });

    React.useEffect(() => {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    }, [sidebarWidth]);

    React.useEffect(() => {
        const clampToViewport = () => setSidebarWidth(previous => clampSidebarWidth(previous));
        window.addEventListener('resize', clampToViewport);
        return () => window.removeEventListener('resize', clampToViewport);
    }, []);

    React.useEffect(() => {
        if (!resizingSidebar) return;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const handlePointerMove = (event: PointerEvent) => {
            setSidebarWidth(clampSidebarWidth(
                resizeStartRef.current.width + event.clientX - resizeStartRef.current.clientX,
            ));
        };
        const stopResizing = () => setResizingSidebar(false);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopResizing);
        window.addEventListener('pointercancel', stopResizing);
        return () => {
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopResizing);
            window.removeEventListener('pointercancel', stopResizing);
        };
    }, [resizingSidebar]);
    const totalLampCount = lampCount;
    const combinatorCount = deciderCombinatorCount + arithmeticCombinatorCount + constantCombinatorCount;
    const lampPower = totalLampCount * LAMP_POWER_WATTS;
    const combinatorPower = (
        deciderCombinatorCount * DECIDER_COMBINATOR_POWER_WATTS
        + arithmeticCombinatorCount * ARITHMETIC_COMBINATOR_POWER_WATTS
    );
    const roboportPower = roboportCount * ROBOPORT_DRAIN_WATTS;
    const speakerPower = programmableSpeakerCount * PROGRAMMABLE_SPEAKER_POWER_WATTS;
    const totalPower = lampPower + combinatorPower + roboportPower + speakerPower;
    const resolvedAudioVoices = audioTrackInfo
        ? resolveAudioVoices(audioTrackInfo, { left: leftAudioInstrument, right: rightAudioInstrument })
        : undefined;
    const convertedSpeakerCount = resolvedAudioVoices
        ? resolvedAudioVoices.left.length + resolvedAudioVoices.right.length
        : 0;

    return (
        <div
            className="toolbar-shell relative z-10 order-2 shrink-0 md:order-1"
            style={{ '--toolbar-width': `${sidebarWidth}px` } as React.CSSProperties}
        >
            <aside className="flex h-full max-h-[40vh] w-full flex-col overflow-x-hidden overflow-y-auto border-t border-gray-700 bg-gray-800 shadow-2xl md:max-h-full md:border-r md:border-t-0">

            {/* Drawing Tools */}
            <div className="p-4 md:p-6 border-b border-gray-700">
                <div className="flex justify-between items-center mb-2 md:mb-4">
                    <h3 className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Drawing Tools
                    </h3>
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 relative rounded overflow-hidden border border-gray-600 shadow-sm group hover:border-gray-500 transition-colors">
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="absolute inset-0 p-0 m-0 border-0 outline-none cursor-pointer w-[150%] h-[150%] -top-1/4 -left-1/4"
                                title="Choose Color"
                            />
                        </div>
                        <div className="flex gap-1">
                            <button className="tool-btn text-xs py-1 px-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded border border-gray-600" onClick={onUndo} title="Undo">
                                <i className="fa-solid fa-rotate-left"></i>
                            </button>
                            <button className="tool-btn text-xs py-1 px-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded border border-gray-600" onClick={onRedo} title="Redo">
                                <i className="fa-solid fa-rotate-right"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'pan', icon: 'fa-hand', label: 'Pan (H)' },
                        { id: 'brush', icon: 'fa-pencil', label: 'Brush (B)' },
                        { id: 'fill', icon: 'fa-fill-drip', label: 'Fill (F)' },
                        { id: 'erase', icon: 'fa-eraser', label: 'Erase (E)' }
                    ].map(tool => (
                        <button
                            key={tool.id}
                            onClick={() => setTool(tool.id as ToolType)}
                            className={`flex h-9 w-9 items-center justify-center rounded border text-sm transition-all ${currentTool === tool.id
                                ? 'bg-yellow-600 text-white border-yellow-500 transform -translate-y-[2px] shadow-sm'
                                : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                                }`}
                            title={tool.label}
                        >
                            <i className={`fa-solid ${tool.icon}`}></i>
                        </button>
                    ))}
                </div>
            </div>

            {/* Stamps */}
            <div className="p-4 md:p-6 border-b border-gray-700">
                <h3 className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 md:mb-4">
                    Stamps
                </h3>
                <div className="mb-3 md:mb-5">
                    <TextStampPanel
                        initialColor={color}
                        onCreate={renderTextStamp}
                        onCreateNotoAnimatedEmoji={renderNotoAnimatedEmojiStamp}
                    />
                </div>

                <div className="mb-2">
                    <label className={`flex items-center justify-center w-full h-10 px-4 transition border rounded cursor-pointer group gap-2 ${isDragging
                        ? 'bg-blue-600 border-blue-400 animate-pulse ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800'
                        : 'bg-gray-700 hover:bg-gray-600 border-gray-600'
                        }`}>
                        <i className="fa-solid fa-file-import text-gray-200 group-hover:text-white transition-colors"></i>
                        <span className="text-xs font-bold text-gray-200 group-hover:text-white transition-colors uppercase tracking-wider">
                            Import Image
                        </span>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={onImageUpload}
                        />
                    </label>
                </div>

                {imageDimensions && (
                    <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-[10px] text-gray-300">
                        <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-wider text-gray-500">Image dimensions</p>
                        <p>
                            <span className="text-gray-500">Original: </span>
                            {imageDimensions.originalWidth} × {imageDimensions.originalHeight} px
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-gray-500">Current size</span>
                            <button
                                type="button"
                                onClick={() => setLockImageAspectRatio(!lockImageAspectRatio)}
                                className={`flex items-center gap-1.5 rounded border px-2 py-1 font-sans text-[10px] font-bold transition-colors ${lockImageAspectRatio
                                    ? 'border-blue-400/40 bg-blue-600/80 text-white hover:bg-blue-500'
                                    : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
                                    }`}
                                title={lockImageAspectRatio ? 'Unlock proportions' : 'Lock proportions'}
                                aria-pressed={lockImageAspectRatio}
                            >
                                <i className={`fa-solid ${lockImageAspectRatio ? 'fa-link' : 'fa-link-slash'}`}></i>
                                {lockImageAspectRatio ? 'Proportions locked' : 'Proportions unlocked'}
                            </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="block">
                                <span className="mb-1 block font-sans text-[10px] font-bold text-gray-400">Width (px)</span>
                                <div className="flex overflow-hidden rounded border border-gray-600 bg-gray-800 focus-within:border-blue-500">
                                    <input
                                        type="number"
                                        min="1"
                                        max={maxDefinition}
                                        value={imageDimensions.currentWidth}
                                        onChange={(e) => {
                                            if (e.target.value !== '') onImageDimensionChange('width', Number(e.target.value));
                                        }}
                                        className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs font-bold text-blue-300 outline-none"
                                        aria-label="Image width in pixels"
                                    />
                                    <span className="flex w-5 flex-col border-l border-gray-600">
                                        <button type="button" onClick={() => onImageDimensionChange('width', imageDimensions.currentWidth + 1)} className="flex-1 text-[8px] text-gray-300 hover:bg-gray-700" title="Increase width by 1 pixel"><i className="fa-solid fa-chevron-up"></i></button>
                                        <button type="button" onClick={() => onImageDimensionChange('width', imageDimensions.currentWidth - 1)} className="flex-1 text-[8px] text-gray-300 hover:bg-gray-700" title="Decrease width by 1 pixel"><i className="fa-solid fa-chevron-down"></i></button>
                                    </span>
                                </div>
                            </label>
                            <label className="block">
                                <span className="mb-1 block font-sans text-[10px] font-bold text-gray-400">Height (px)</span>
                                <div className="flex overflow-hidden rounded border border-gray-600 bg-gray-800 focus-within:border-blue-500">
                                    <input
                                        type="number"
                                        min="1"
                                        max={maxDefinition}
                                        value={imageDimensions.currentHeight}
                                        onChange={(e) => {
                                            if (e.target.value !== '') onImageDimensionChange('height', Number(e.target.value));
                                        }}
                                        className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs font-bold text-blue-300 outline-none"
                                        aria-label="Image height in pixels"
                                    />
                                    <span className="flex w-5 flex-col border-l border-gray-600">
                                        <button type="button" onClick={() => onImageDimensionChange('height', imageDimensions.currentHeight + 1)} className="flex-1 text-[8px] text-gray-300 hover:bg-gray-700" title="Increase height by 1 pixel"><i className="fa-solid fa-chevron-up"></i></button>
                                        <button type="button" onClick={() => onImageDimensionChange('height', imageDimensions.currentHeight - 1)} className="flex-1 text-[8px] text-gray-300 hover:bg-gray-700" title="Decrease height by 1 pixel"><i className="fa-solid fa-chevron-down"></i></button>
                                    </span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* Shared output settings */}
            <div className="border-b border-gray-700 p-4 md:p-6">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 md:text-xs">
                    Output settings
                </h3>
                <div className="space-y-3">
                    <label className="block rounded-lg border border-gray-700 bg-gray-900 p-3">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Maximum definition</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="1"
                                max="1024"
                                step="1"
                                value={maxDefinition}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (Number.isFinite(value)) setMaxDefinition(Math.max(1, Math.min(MAX_DEFINITION_LIMIT, Math.round(value))));
                                }}
                                className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-xs font-bold text-blue-300 outline-none focus:border-blue-500"
                            />
                            <span className="text-[10px] text-gray-500">px / side</span>
                        </div>
                    </label>
                    <label className="block rounded-lg border border-gray-700 bg-gray-900 p-3">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Maximum animation frames</span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={maxFrameCount}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value)) setMaxFrameCount(Math.max(1, Math.round(value)));
                            }}
                            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-xs font-bold text-blue-300 outline-none focus:border-blue-500"
                        />
                        <span className="mt-1 block text-[10px] leading-4 text-gray-500">
                            Shared by slideshows, GIFs, and videos. Raise this value when you intentionally want a very large blueprint.
                        </span>
                    </label>
                    <label className="block rounded-lg border border-gray-700 bg-gray-900 p-3">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Blueprint background</span>
                        <select
                            value={backgroundTile}
                            onChange={(event) => setBackgroundTile(event.target.value as BackgroundTileName)}
                            className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-xs font-bold text-gray-200 outline-none focus:border-blue-500"
                        >
                            {BACKGROUND_TILES.map(tile => (
                                <option key={tile.value || 'none'} value={tile.value}>{tile.label}</option>
                            ))}
                        </select>
                        <span className="mt-1 block text-[10px] leading-4 text-gray-500">
                            Fills the complete artwork rectangle with the selected Factorio tile in every mode.
                        </span>
                    </label>
                </div>
            </div>

            {/* Animated media */}
            <div className="border-b border-gray-700 p-4 md:p-6">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 md:mb-4 md:text-xs">
                    {t('Animated media')}
                </h3>
                <div className="grid grid-cols-[1fr_76px_82px] gap-2">
                    <label className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded border px-3 transition ${mediaImporting
                        ? 'cursor-wait border-pink-400/40 bg-pink-950/50 text-pink-200'
                        : 'border-pink-500/40 bg-pink-950/30 text-pink-200 hover:bg-pink-900/40'
                        }`}>
                        <i className={`fa-solid ${mediaImporting ? 'fa-spinner fa-spin' : 'fa-film'}`}></i>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                            {mediaImporting ? 'Decoding' : mediaAnimationInfo ? 'Replace' : 'Import'}
                        </span>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/gif,image/apng,image/png,image/webp,video/*,application/x-tgsticker,.gif,.apng,.png,.webp,.webm,.tgs,.mp4,.mov,.mkv,.avi,.m4v"
                            onChange={onMediaUpload}
                            disabled={mediaImporting}
                        />
                    </label>
                    <label className="rounded border border-gray-600 bg-gray-900 px-2 py-1">
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">FPS limit</span>
                        <input
                            type="number"
                            min="0.1"
                            max="30"
                            step="0.1"
                            value={mediaFpsLimit}
                            disabled={mediaImporting}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value)) setMediaFpsLimit(Math.max(0.1, Math.min(30, value)));
                            }}
                            className="w-full bg-transparent font-mono text-xs font-bold text-pink-300 outline-none"
                            aria-label="Media FPS limit"
                        />
                    </label>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-gray-500">
                    {t('GIF, APNG, static or animated WebP, transparent WebM, video, and TGS are supported. Ratio and alpha are preserved; reductions above the selected definition or 30 FPS require confirmation.')} ({maxDefinition} × {maxDefinition})
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2">
                    <label className="flex flex-col text-[9px] font-bold uppercase tracking-wider text-gray-500">
                        <span className="flex min-h-8 items-end">Color mode</span>
                        <select
                            value={mediaColorMode}
                            disabled={mediaImporting}
                            onChange={event => setMediaColorMode(event.target.value as MediaColorMode)}
                            className="mt-1 h-10 w-full rounded border border-gray-600 bg-gray-800 px-2 text-[10px] text-gray-200"
                        >
                            <option value="full">Full color</option>
                            <option value="grayscale">Grayscale</option>
                            <option value="monochrome">Monochrome / Bad Apple</option>
                        </select>
                    </label>
                    {mediaColorMode === 'monochrome' ? (
                        <label className="flex flex-col text-[9px] font-bold uppercase tracking-wider text-gray-500">
                            <span className="flex min-h-8 items-end">White threshold</span>
                            <input type="number" min="0" max="255" value={mediaMonochromeThreshold} disabled={mediaImporting} onChange={event => setMediaMonochromeThreshold(Math.max(0, Math.min(255, Math.round(Number(event.target.value) || 0))))} className="mt-1 h-10 w-full rounded border border-gray-600 bg-gray-800 px-2 text-[10px] text-pink-300" />
                        </label>
                    ) : (
                        <label className="flex flex-col text-[9px] font-bold uppercase tracking-wider text-gray-500">
                            <span className="flex min-h-8 items-end">Ignore color delta ≤</span>
                            <input type="number" min="0" max="255" value={mediaDifferenceThreshold} disabled={mediaImporting} onChange={event => setMediaDifferenceThreshold(Math.max(0, Math.min(255, Math.round(Number(event.target.value) || 0))))} className="mt-1 h-10 w-full rounded border border-gray-600 bg-gray-800 px-2 text-[10px] text-pink-300" />
                        </label>
                    )}
                    <p className="col-span-2 text-[9px] leading-4 text-gray-500">
                        {mediaColorMode === 'monochrome'
                            ? 'Pixels at or above the white threshold become white; all others become black. Source dimensions and timing are preserved.'
                            : 'Ignore color delta compares consecutive frames per RGB channel. 0 keeps every change; a higher value reuses the previous color for tiny variations, reducing flicker and decider ROMs at the cost of subtle detail. Changes to or from an unlit pixel are always kept.'}
                    </p>
                </div>

                {mediaAnimationInfo && (
                    <div className="mt-3 space-y-3">
                        <div className="rounded-lg border border-pink-500/20 bg-gray-900 p-3 font-mono text-[10px] text-gray-300">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate font-sans text-[10px] font-bold text-pink-200" title={mediaAnimationInfo.sourceName}>
                                        {mediaAnimationInfo.sourceName}
                                    </p>
                                    <p className="mt-1 text-gray-500">
                                        {mediaAnimationInfo.sourceWidth} x {mediaAnimationInfo.sourceHeight} → {mediaAnimationInfo.width} x {mediaAnimationInfo.height} px
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onRemoveMediaAnimation}
                                    className="rounded px-2 py-1 text-gray-500 hover:bg-red-950 hover:text-red-300"
                                    title="Remove GIF/video animation"
                                >
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            {mediaAnimationInfo.gifTimingRepaired && (
                                <p className="mt-2 rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1 font-sans text-[9px] leading-4 text-amber-200">
                                    {t('Legacy GIF repaired: all embedded image frames were recovered and missing timing was reconstructed at 10 FPS.')}
                                    {mediaAnimationInfo.gifEmbeddedFrameCount
                                        ? ` ${mediaAnimationInfo.gifEmbeddedFrameCount.toLocaleString()} ${t('embedded frames found')}.`
                                        : ''}
                                </p>
                            )}
                            {mediaAnimationInfo.resizable && <div className="mt-2 grid grid-cols-2 gap-2 border-t border-gray-700 pt-2">
                                <label className="font-sans text-[9px] text-gray-500">
                                    Width (ratio locked)
                                    <input
                                        type="number"
                                        min="1"
                                        max={maxDefinition}
                                        value={mediaAnimationInfo.width}
                                        disabled={mediaImporting}
                                        onChange={event => event.target.value !== '' && onMediaDimensionChange('width', Number(event.target.value))}
                                        className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 font-mono text-[10px] text-blue-300"
                                    />
                                </label>
                                <label className="font-sans text-[9px] text-gray-500">
                                    Height (ratio locked)
                                    <input
                                        type="number"
                                        min="1"
                                        max={maxDefinition}
                                        value={mediaAnimationInfo.height}
                                        disabled={mediaImporting}
                                        onChange={event => event.target.value !== '' && onMediaDimensionChange('height', Number(event.target.value))}
                                        className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 font-mono text-[10px] text-blue-300"
                                    />
                                </label>
                            </div>}
                            <div className="mt-2 grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-800/60 p-2">
                                <span><span className="text-gray-500">Frames: </span>{mediaAnimationInfo.frameCount.toLocaleString()}</span>
                                <span><span className="text-gray-500">Samples: </span>{mediaAnimationInfo.sampledFrameCount.toLocaleString()}</span>
                                <span><span className="text-gray-500">Decoded: </span>{formatNumber(mediaAnimationInfo.sampledFps)} FPS</span>
                                <span><span className="text-gray-500">Factorio: </span>{formatNumber(mediaAnimationInfo.factorioFps)} FPS</span>
                                <span className="col-span-2"><span className="text-gray-500">Loop: </span>{formatNumber(mediaAnimationInfo.durationTicks / 60)} s ({mediaAnimationInfo.durationTicks.toLocaleString()} ticks)</span>
                            </div>
                        </div>

                        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                            <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                <span>Preview frame</span>
                                <span className="font-mono text-pink-300">{mediaPreviewFrame + 1} / {mediaAnimationInfo.frameCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMediaPreviewFrame(Math.max(0, mediaPreviewFrame - 1))}
                                    className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-300 hover:bg-gray-700"
                                    title="Previous frame"
                                ><i className="fa-solid fa-chevron-left"></i></button>
                                <input
                                    type="range"
                                    min="0"
                                    max={Math.max(0, mediaAnimationInfo.frameCount - 1)}
                                    value={mediaPreviewFrame}
                                    onChange={(event) => setMediaPreviewFrame(Number(event.target.value))}
                                    className="min-w-0 flex-1 accent-pink-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => setMediaPreviewFrame(Math.min(mediaAnimationInfo.frameCount - 1, mediaPreviewFrame + 1))}
                                    className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-300 hover:bg-gray-700"
                                    title="Next frame"
                                ><i className="fa-solid fa-chevron-right"></i></button>
                            </div>
                        </div>

                        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                Controller position
                            </span>
                            <div className="grid grid-cols-4 gap-1" role="group" aria-label="Media controller position">
                                {([
                                    ['left', 'Left', 'fa-arrow-left'],
                                    ['top', 'Top', 'fa-arrow-up'],
                                    ['right', 'Right', 'fa-arrow-right'],
                                    ['bottom', 'Bottom', 'fa-arrow-down'],
                                ] as const).map(([side, label, icon]) => (
                                    <button
                                        key={side}
                                        type="button"
                                        onClick={() => setAnimationControllerSide(side)}
                                        aria-pressed={animationControllerSide === side}
                                        className={`rounded border px-1 py-2 text-[9px] font-bold transition ${animationControllerSide === side
                                            ? 'border-pink-400 bg-pink-700 text-white'
                                            : 'border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700'
                                            }`}
                                        title={`Place media controller on the ${label.toLowerCase()}`}
                                    >
                                        <i className={`fa-solid ${icon} mr-1`}></i>{label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex cursor-pointer select-none items-start gap-2 rounded-lg border border-gray-700 bg-gray-900 p-3">
                            <input
                                type="checkbox"
                                checked={includeAnimationHelp}
                                onChange={(event) => setIncludeAnimationHelp(event.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-700 text-pink-600 focus:ring-pink-500"
                            />
                            <span className="text-[10px] leading-4 text-gray-300">
                                Add an in-game display with frame count, loop duration, and timer value.
                            </span>
                        </label>

                        <p className="rounded border border-pink-500/20 bg-pink-950/20 p-2 text-[10px] leading-4 text-pink-100/80">
                            Consecutive duplicate frames share their duration. The blueprint stores one base image plus ordered per-frame differences in line memories.
                        </p>
                    </div>
                )}
            </div>

            {/* Audio note sequencer */}
            <div className="border-b border-gray-700 p-4 md:p-6">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 md:mb-4 md:text-xs">
                    Audio / programmable speakers
                </h3>
                <div className="grid grid-cols-[1fr_88px] gap-2">
                    <label className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded border px-3 transition ${audioImporting
                        ? 'cursor-wait border-cyan-400/40 bg-cyan-950/50 text-cyan-200'
                        : 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-900/40'
                        }`}>
                        <i className={`fa-solid ${audioImporting ? 'fa-spinner fa-spin' : 'fa-music'}`}></i>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                            {audioImporting ? 'Analyzing' : audioTrackInfo ? 'Replace' : 'Import audio'}
                        </span>
                        <input
                            type="file"
                            className="hidden"
                            accept="audio/*,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.wma"
                            onChange={onAudioUpload}
                            disabled={audioImporting}
                        />
                    </label>
                    <label className="rounded border border-gray-600 bg-gray-900 px-2 py-1">
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">Notes / sec</span>
                        <input
                            type="number"
                            min="1"
                            max="60"
                            step="1"
                            value={audioNotesPerSecond}
                            disabled={audioImporting}
                            onChange={event => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value)) setAudioNotesPerSecond(Math.max(1, Math.min(60, Math.round(value))));
                            }}
                            className="w-full bg-transparent font-mono text-xs font-bold text-cyan-300 outline-none"
                            aria-label="Audio notes per second"
                        />
                    </label>
                    <label className="rounded border border-gray-600 bg-gray-900 px-2 py-1">
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-gray-500">Voices / ch.</span>
                        <input
                            type="number"
                            min="1"
                            max="4"
                            step="1"
                            value={audioVoicesPerChannel}
                            disabled={audioImporting}
                            onChange={event => {
                                const value = Number(event.target.value);
                                if (Number.isFinite(value)) setAudioVoicesPerChannel(Math.max(1, Math.min(4, Math.round(value))));
                            }}
                            className="w-full bg-transparent font-mono text-xs font-bold text-cyan-300 outline-none"
                            aria-label="Audio voices per channel"
                        />
                    </label>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-gray-500">
                    FFmpeg extracts up to four simultaneous pitches per left/right channel. Each voice gets its own native Factorio instrument and speaker; every speaker shares one tick clock. Factorio allows at most one new sample per tick: 1–60 notes/s; 4–8 is recommended.
                </p>

                {audioTrackInfo && (
                    <div className="mt-3 space-y-3 rounded-lg border border-cyan-500/20 bg-gray-900 p-3 text-[10px] text-gray-300">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate font-bold text-cyan-200" title={audioTrackInfo.sourceName}>{audioTrackInfo.sourceName}</p>
                                <p className="mt-1 font-mono text-gray-500">
                                    {formatNumber(audioTrackInfo.durationSeconds)} s · {audioTrackInfo.sourceChannels === 1 ? 'mono duplicated' : 'stereo'} · {formatNumber(audioTrackInfo.notesPerSecond)} notes/s
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onRemoveAudioTrack}
                                className="rounded px-2 py-1 text-gray-500 hover:bg-red-950 hover:text-red-300"
                                title="Remove audio track"
                            >
                                <i className="fa-solid fa-trash"></i>
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-800/60 p-2 font-mono">
                            <span><span className="text-gray-500">Events: </span>{audioTrackInfo.events.length.toLocaleString()}</span>
                            <span><span className="text-gray-500">Speakers: </span>{convertedSpeakerCount}</span>
                            <span><span className="text-gray-500">Left notes: </span>{audioTrackInfo.leftNoteCount.toLocaleString()}</span>
                            <span><span className="text-gray-500">Right notes: </span>{audioTrackInfo.rightNoteCount.toLocaleString()}</span>
                        </div>
                        <button
                            type="button"
                            onClick={onPlaceAudioTrack}
                            className={`flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-[9px] font-bold uppercase tracking-wider transition ${audioPlaced
                                ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-900/50'
                                : 'border-amber-400/50 bg-amber-950/40 text-amber-100 hover:bg-amber-900/50'
                                }`}
                        >
                            <i className="fa-solid fa-location-crosshairs"></i>
                            {audioPlaced ? 'Move audio controller' : 'Place audio controller on grid'}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                ['Left primary voice', leftAudioInstrument, setLeftAudioInstrument],
                                ['Right primary voice', rightAudioInstrument, setRightAudioInstrument],
                            ] as const).map(([label, value, setValue]) => (
                                <label key={label} className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                                    {label}
                                    <select
                                        value={value}
                                        onChange={event => setValue(event.target.value as AudioInstrumentSelection)}
                                        className="mt-1 h-9 w-full rounded border border-gray-600 bg-gray-800 px-2 text-[9px] normal-case text-cyan-100"
                                    >
                                        <option value="auto">Auto (best range)</option>
                                        {Object.entries(AUDIO_INSTRUMENTS).map(([name, instrument]) => (
                                            <option key={name} value={name}>
                                                {instrument.label} · {instrument.range} · {instrument.noteCount} notes
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                        <p className="rounded border border-gray-700 bg-gray-800/50 p-2 leading-4 text-gray-400">
                            Auto selects the native instruments whose pitch ranges clip the fewest detected notes. Equivalent ranges use different timbres when possible; each voice keeps one instrument for the whole track.
                        </p>
                        <AudioPreviewControls
                            track={audioTrackInfo}
                            selections={{ left: leftAudioInstrument, right: rightAudioInstrument }}
                        />
                        {hasAnimation && (
                            <button
                                type="button"
                                onClick={() => setAudioLinkedToAnimation(!audioLinkedToAnimation)}
                                className={`flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-[9px] font-bold uppercase tracking-wider transition ${audioLinkedToAnimation
                                    ? 'border-emerald-400/50 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/60'
                                    : 'border-amber-400/50 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50'
                                    }`}
                                title={audioLinkedToAnimation ? 'Unlink the speakers from this animation' : 'Start the speakers and animation on the same tick counter'}
                            >
                                <i className={`fa-solid ${audioLinkedToAnimation ? 'fa-link' : 'fa-link-slash'}`}></i>
                                {audioLinkedToAnimation ? 'Audio linked to animation' : 'Link audio to animation'}
                            </button>
                        )}
                        <p className={`rounded border p-2 leading-4 ${hasAnimation && !audioLinkedToAnimation
                            ? 'border-amber-500/30 bg-amber-950/30 text-amber-100/80'
                            : 'border-cyan-500/20 bg-cyan-950/20 text-cyan-100/80'
                            }`}>
                            {!audioPlaced
                                ? 'The audio is ready. Place its controller on the grid before it can be exported.'
                                : hasAnimation
                                ? audioLinkedToAnimation
                                    ? <>Tick 0 is shared with the animation timer. {mediaAnimationInfo
                                        ? audioTrackInfo.durationTicks > mediaAnimationInfo.durationTicks
                                            ? `The video loop is shorter, so playback uses its first ${formatNumber(mediaAnimationInfo.durationTicks / 60)} seconds before both restart.`
                                            : 'The audio becomes silent if it ends before the animation loop.'
                                        : 'The slideshow and both speakers start together and share the same loop counter.'}</>
                                    : 'This audio is not included in the animation blueprint yet. Use the link button above to synchronize and include both speakers.'
                                : 'With no animation, the complete audio duration defines the speaker loop.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Multi-image slideshow */}
            <div className="border-b border-gray-700 p-4 md:p-6">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 md:mb-4 md:text-xs">
                    Multi-image slideshow
                </h3>
                <label className="flex cursor-pointer select-none items-center gap-2">
                    <input
                        type="checkbox"
                        checked={animationEnabled}
                        onChange={(event) => {
                            if (event.target.checked && mediaAnimationInfo) onRemoveMediaAnimation();
                            setAnimationEnabled(event.target.checked);
                        }}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-fuchsia-600 focus:ring-fuchsia-500"
                    />
                    <span className="text-xs font-medium text-gray-200">Cycle through any number of images</span>
                </label>

                {animationEnabled && (
                    <div className="mt-3 space-y-3">
                        <label className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded border border-fuchsia-500/40 bg-fuchsia-950/40 px-4 transition hover:bg-fuchsia-900/50">
                            <i className="fa-solid fa-images text-fuchsia-300"></i>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                                Add one or more images
                            </span>
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
                                onChange={onSequenceImagesUpload}
                            />
                        </label>

                        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[10px] font-bold text-fuchsia-200">
                                        {sequenceFrameCount.toLocaleString()} imported frame{sequenceFrameCount === 1 ? '' : 's'}
                                    </p>
                                    <p className="text-[9px] text-gray-500">Frames are edited in the dedicated tray below the canvas.</p>
                                </div>
                            </div>
                            <label className="mt-3 block text-[9px] font-bold uppercase tracking-wider text-gray-500">
                                Set every frame duration
                                <div className="mt-1 flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0.1"
                                        max="86400"
                                        step="0.1"
                                        value={sequenceGlobalDelaySeconds}
                                        onChange={(event) => onSequenceGlobalDelayChange(Number(event.target.value))}
                                        className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-yellow-300 outline-none focus:border-fuchsia-500"
                                    />
                                    <span className="text-[10px] text-gray-500">seconds</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onSequenceGlobalDelayChange(sequenceGlobalDelaySeconds)}
                                    className="mt-2 w-full rounded border border-fuchsia-500/40 bg-fuchsia-950/50 px-2 py-1.5 text-[9px] font-bold text-fuchsia-200 hover:bg-fuchsia-900/60"
                                >
                                    Apply this duration to all frames
                                </button>
                            </label>
                            <p className="mt-2 text-[9px] leading-4 text-gray-500">This deliberately overwrites every individual duration. You can then fine-tune each frame in the bottom tray.</p>
                        </div>

                        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                Controller position
                            </span>
                            <div className="grid grid-cols-4 gap-1" role="group" aria-label="Controller position">
                                {([
                                    ['left', 'Left', 'fa-arrow-left'],
                                    ['top', 'Top', 'fa-arrow-up'],
                                    ['right', 'Right', 'fa-arrow-right'],
                                    ['bottom', 'Bottom', 'fa-arrow-down'],
                                ] as const).map(([side, label, icon]) => (
                                    <button
                                        key={side}
                                        type="button"
                                        onClick={() => setAnimationControllerSide(side)}
                                        aria-pressed={animationControllerSide === side}
                                        className={`rounded border px-1 py-2 text-[9px] font-bold transition ${
                                            animationControllerSide === side
                                                ? 'border-teal-400 bg-teal-700 text-white'
                                                : 'border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}
                                        title={`Place animation controller on the ${label.toLowerCase()}`}
                                    >
                                        <i className={`fa-solid ${icon} mr-1`}></i>{label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex cursor-pointer select-none items-start gap-2 rounded-lg border border-gray-700 bg-gray-900 p-3">
                            <input
                                type="checkbox"
                                checked={includeAnimationHelp}
                                onChange={(event) => setIncludeAnimationHelp(event.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-700 text-yellow-600 focus:ring-yellow-500"
                            />
                            <span className="text-[10px] leading-4 text-gray-300">
                                Add an in-game help display beside the generated slideshow timer.
                            </span>
                        </label>

                        <p className="text-[10px] leading-4 text-gray-500">
                            Imported images are the actual slideshow frames. No empty “Canvas” frame is inserted. Pole and roboport placement uses the union of every frame.
                        </p>
                        <p className="rounded border border-teal-500/20 bg-teal-950/20 p-2 text-[10px] leading-4 text-teal-200/80">
                            Pixels that never change are exported as regular Always ON lamps and consume no animation ROM, memory, or decider combinator.
                        </p>
                    </div>
                )}
            </div>

            {/* Power Support */}
            <div className="p-4 md:p-6 border-b border-gray-700">
                <h3 className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 md:mb-4">
                    Power Support
                </h3>

                <div className="space-y-3">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoPole}
                            onChange={(e) => setAutoPole(e.target.checked)}
                            className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                        />
                        <span className="text-xs font-medium text-gray-200">Auto-place Poles</span>
                    </label>

                    <label className={`flex items-center space-x-2 select-none ${autoPole ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                        <input
                            type="checkbox"
                            checked={autoRoboport}
                            onChange={(e) => setAutoRoboport(e.target.checked)}
                            disabled={!autoPole}
                            className="form-checkbox h-4 w-4 text-emerald-600 rounded border-gray-600 bg-gray-700 focus:ring-emerald-500 disabled:cursor-not-allowed"
                        />
                        <span className="text-xs font-medium text-gray-200">Auto-place Roboports</span>
                    </label>
                    {autoPole && autoRoboport && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3">
                            <label className="flex cursor-pointer select-none items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={autoConstruction}
                                    onChange={(event) => setAutoConstruction(event.target.checked)}
                                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-bold text-emerald-200">Auto construction</span>
                            </label>
                            <p className="mt-2 text-[10px] leading-4 text-gray-400">
                                Builds one connected logistic and electric backbone so robots can expand the blueprint from a single edge connection.
                            </p>
                        </div>
                    )}
                    {!autoPole && (
                        <p className="-mt-1 text-[10px] text-gray-500">Requires auto-placed poles for power.</p>
                    )}

                    <div className="relative mb-2">
                        <select
                            value={poleType}
                            onChange={(e) => setPoleType(e.target.value)}
                            className="w-full bg-gray-900 text-white text-xs font-bold border border-gray-600 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-blue-500 appearance-none disabled:opacity-50"
                        >
                            {Object.keys(POLE_DATA).map(k => (
                                <option key={k} value={k}>{k.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                            <i className="fa-solid fa-chevron-down text-[10px]"></i>
                        </div>
                    </div>

                    <div className="relative z-20">
                        <button
                            onClick={() => setShowQualityDropdown(!showQualityDropdown)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-2 pr-3 py-2 flex items-center justify-between hover:border-gray-500 transition-colors focus:outline-none focus:border-blue-500"
                        >
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                                <img src={QUALITY_IMAGES[qualityIdx]} className="w-5 h-5 object-contain" />
                                <span className="capitalize" style={{ color: qualityIdx > 0 ? QUALITY_COLORS[qualityIdx] : '#e5e7eb' }}>
                                    {QUALITY_NAMES[qualityIdx]}
                                </span>
                            </div>
                            <span className="text-[10px] text-gray-400">▼</span>
                        </button>

                        {showQualityDropdown && (
                            <div className="absolute top-full left-0 w-full mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-xl overflow-hidden flex flex-col">
                                {QUALITY_NAMES.map((name, idx) => (
                                    <button
                                        key={name}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-800 text-left transition-colors w-full border-b border-gray-800 last:border-0"
                                        onClick={() => {
                                            setQualityIdx(idx);
                                            setShowQualityDropdown(false);
                                        }}
                                    >
                                        <img src={QUALITY_IMAGES[idx]} className="w-5 h-5 object-contain" />
                                        <span className={`text-xs font-bold capitalize ${idx === 0 ? 'text-gray-300' : ''}`} style={{ color: idx > 0 ? QUALITY_COLORS[idx] : '' }}>
                                            {name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Click outside listener */}
                        {showQualityDropdown && (
                            <div className="fixed inset-0 z-[-1]" onClick={() => setShowQualityDropdown(false)}></div>
                        )}
                    </div>

                    {/* Mode Toggle */}

                    <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-600 relative items-center">
                        <div className="flex-1 flex gap-1">
                            <button
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${!smartPlacement ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                                onClick={() => setSmartPlacement(false)}
                            >
                                Grid
                            </button>
                            <button
                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${smartPlacement ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                                onClick={() => setSmartPlacement(true)}
                            >
                                Smart
                            </button>
                        </div>

                        {/* Info Icon */}
                        <div className="group relative ml-2 mr-1">
                            <i className="fa-solid fa-circle-question text-gray-500 hover:text-gray-300 cursor-help"></i>
                            {/* Tooltip */}
                            <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-48 bg-gray-900 text-gray-200 text-xs p-2 rounded border border-gray-600 shadow-xl z-50">
                                <p className="font-bold text-yellow-500 mb-1">Experimental Feature</p>
                                <p>Optimizes pole placement to avoid covering lamps.</p>
                                <p className="mt-1 text-gray-400 italic">May be slow on large canvases.</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Statistics */}
            <div className="p-4 md:p-6 pb-20 md:pb-6 border-b border-gray-700">
                <h3 className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 md:mb-4">
                    Statistics
                </h3>
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                        <span>Lamps:</span>
                        <span className="text-right font-mono text-yellow-500">
                            {totalLampCount.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between items-start gap-3 text-xs font-bold text-gray-300">
                        <span>Lamp power:</span>
                        <span className="text-right font-mono text-yellow-500">
                            {formatPower(lampPower)}
                            <span className="block text-[10px] font-normal text-gray-500">({formatEnergyPerSecond(lampPower)})</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                        <span>Combinators:</span>
                        <span className="text-right font-mono text-cyan-400">
                            {combinatorCount.toLocaleString()}
                            {combinatorCount > 0 && (
                                <span className="block text-[9px] font-normal text-gray-500">
                                    {deciderCombinatorCount.toLocaleString()} decider + {arithmeticCombinatorCount.toLocaleString()} arithmetic + {constantCombinatorCount.toLocaleString()} constant
                                </span>
                            )}
                        </span>
                    </div>
                    {combinatorCount > 0 && (
                        <div className="flex justify-between items-start gap-3 text-xs font-bold text-gray-300">
                            <span>Combinator power:</span>
                            <span className="text-right font-mono text-cyan-400">
                                {formatPower(combinatorPower)}
                                <span className="block text-[10px] font-normal text-gray-500">Decider and arithmetic combinators</span>
                            </span>
                        </div>
                    )}
                    {displayPanelCount > 0 && (
                        <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                            <span>Display panels:</span>
                            <span className="text-right font-mono text-purple-400">
                                {displayPanelCount.toLocaleString()}
                                <span className="block text-[9px] font-normal text-gray-500">0 W</span>
                            </span>
                        </div>
                    )}
                    {programmableSpeakerCount > 0 && (
                        <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                            <span>Speakers:</span>
                            <span className="text-right font-mono text-cyan-300">
                                {programmableSpeakerCount.toLocaleString()}
                                <span className="block text-[9px] font-normal text-gray-500">{formatPower(speakerPower)}</span>
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                        <span>Roboports:</span>
                        <span className="font-mono text-emerald-400">{roboportCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-start gap-3 text-xs font-bold text-gray-300">
                        <span>Roboport drain:</span>
                        <span className="text-right font-mono text-emerald-400">
                            {formatPower(roboportPower)}
                            <span className="block text-[10px] font-normal text-gray-500">({formatEnergyPerSecond(roboportPower)})</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-start gap-3 border-t border-gray-700 pt-2 text-xs font-bold text-gray-200">
                        <span>Total power:</span>
                        <span className="text-right font-mono text-yellow-400">
                            {formatPower(totalPower)}
                            <span className="block text-[10px] font-normal text-gray-500">({formatEnergyPerSecond(totalPower)})</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                        <span>Poles:</span>
                        <span className="text-right font-mono text-blue-400">
                            {(poleCount + controllerPoleCount + relayPoleCount).toLocaleString()}
                            {(controllerPoleCount > 0 || relayPoleCount > 0) && (
                                <span className="block text-[9px] font-normal text-gray-500">
                                    {poleCount.toLocaleString()} image + {controllerPoleCount.toLocaleString()} controller + {relayPoleCount.toLocaleString()} relays
                                </span>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            </aside>
            <div
                role="separator"
                aria-label="Resize sidebar"
                aria-orientation="vertical"
                aria-valuemin={SIDEBAR_MIN_WIDTH}
                aria-valuemax={SIDEBAR_MAX_WIDTH}
                aria-valuenow={sidebarWidth}
                tabIndex={0}
                title="Drag to resize the sidebar · double-click to reset"
                onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    resizeStartRef.current = { clientX: event.clientX, width: sidebarWidth };
                    setResizingSidebar(true);
                }}
                onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') {
                        event.preventDefault();
                        setSidebarWidth(previous => clampSidebarWidth(previous - 16));
                    } else if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        setSidebarWidth(previous => clampSidebarWidth(previous + 16));
                    } else if (event.key === 'Home') {
                        event.preventDefault();
                        setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
                    }
                }}
                className={`group absolute inset-y-0 right-0 z-30 hidden w-3 translate-x-1/2 cursor-col-resize touch-none outline-none md:block ${resizingSidebar ? 'bg-blue-500/10' : ''}`}
            >
                <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${resizingSidebar ? 'bg-blue-400' : 'bg-gray-600 group-hover:bg-blue-400 group-focus:bg-blue-400'}`} />
            </div>
        </div>
    );
};
