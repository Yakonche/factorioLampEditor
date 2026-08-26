import React from 'react';
import { useI18n } from '../i18n';
import {
    resolveAudioVoices,
    type AudioInstrumentSelections,
    type DecodedAudioTrack,
} from '../utils/audio';
import {
    createFactorioAudioPreview,
    type FactorioAudioPreviewController,
} from '../utils/audioPreview';

interface AudioPreviewControlsProps {
    track: DecodedAudioTrack;
    selections: AudioInstrumentSelections;
}

interface FactorioSpeakerSoundStatus {
    available: boolean;
    soundDirectory?: string;
}

type PreviewPhase = 'idle' | 'loading' | 'playing' | 'paused';

const formatTime = (seconds: number) => {
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(wholeSeconds / 60);
    return `${minutes}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

export const AudioPreviewControls: React.FC<AudioPreviewControlsProps> = ({ track, selections }) => {
    const { t } = useI18n();
    const [soundStatus, setSoundStatus] = React.useState<FactorioSpeakerSoundStatus>();
    const [phase, setPhase] = React.useState<PreviewPhase>('idle');
    const [loadProgress, setLoadProgress] = React.useState({ loaded: 0, total: 0 });
    const [time, setTime] = React.useState({ current: 0, duration: track.durationSeconds });
    const [error, setError] = React.useState<string>();
    const controllerRef = React.useRef<FactorioAudioPreviewController | undefined>(undefined);
    const requestIdRef = React.useRef(0);
    const resolved = resolveAudioVoices(track, selections);

    const refreshStatus = React.useCallback(async () => {
        const getStatus = window.factorioLampEditor?.getFactorioSpeakerSoundStatus;
        if (!getStatus) {
            setSoundStatus({ available: false });
            return;
        }
        try {
            setSoundStatus(await getStatus());
        } catch {
            setSoundStatus({ available: false });
        }
    }, []);

    React.useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    React.useEffect(() => {
        requestIdRef.current += 1;
        const controller = controllerRef.current;
        controllerRef.current = undefined;
        setPhase('idle');
        setError(undefined);
        setTime({ current: 0, duration: track.durationSeconds });
        if (controller) void controller.stop();
    }, [track, selections.left, selections.right]);

    React.useEffect(() => () => {
        requestIdRef.current += 1;
        void controllerRef.current?.stop();
    }, []);

    const selectFactorioFolder = async () => {
        const select = window.factorioLampEditor?.selectFactorioSpeakerSounds;
        if (!select) return;
        setError(undefined);
        try {
            const status = await select();
            if (!status.canceled) {
                setSoundStatus({
                    available: Boolean(status.available),
                    soundDirectory: status.soundDirectory,
                });
            }
        } catch (selectionError) {
            setError(selectionError instanceof Error ? selectionError.message : t('Unable to use this Factorio folder.'));
        }
    };

    const start = async () => {
        if (!soundStatus?.available || phase === 'loading') return;
        const requestId = ++requestIdRef.current;
        const previousController = controllerRef.current;
        controllerRef.current = undefined;
        if (previousController) await previousController.stop();
        setError(undefined);
        setLoadProgress({ loaded: 0, total: 0 });
        setTime({ current: 0, duration: track.durationSeconds });
        setPhase('loading');
        try {
            const controller = await createFactorioAudioPreview(track, selections, {
                onLoadProgress: (loaded, total) => {
                    if (requestId === requestIdRef.current) setLoadProgress({ loaded, total });
                },
                onTimeUpdate: (current, duration) => {
                    if (requestId === requestIdRef.current) setTime({ current, duration });
                },
                onEnded: () => {
                    if (requestId !== requestIdRef.current) return;
                    controllerRef.current = undefined;
                    setPhase('idle');
                },
            });
            if (requestId !== requestIdRef.current) {
                await controller.stop();
                return;
            }
            controllerRef.current = controller;
            setTime({ current: 0, duration: controller.duration });
            setPhase('playing');
        } catch (previewError) {
            if (requestId !== requestIdRef.current) return;
            setPhase('idle');
            setError(previewError instanceof Error ? previewError.message : t('Unable to play the converted preview.'));
            await refreshStatus();
        }
    };

    const togglePause = async () => {
        const controller = controllerRef.current;
        if (!controller) return;
        if (phase === 'playing') {
            await controller.pause();
            setPhase('paused');
        } else if (phase === 'paused') {
            await controller.resume();
            setPhase('playing');
        }
    };

    const stop = async () => {
        requestIdRef.current += 1;
        const controller = controllerRef.current;
        controllerRef.current = undefined;
        if (controller) await controller.stop();
        setPhase('idle');
        setTime(previous => ({ current: 0, duration: previous.duration }));
    };

    const seek = (seconds: number) => {
        const controller = controllerRef.current;
        if (!controller) return;
        const target = Math.max(0, Math.min(seconds, time.duration));
        setTime(previous => ({ ...previous, current: target }));
        void controller.seek(target);
    };

    const desktopBridgeAvailable = Boolean(window.factorioLampEditor?.getFactorioSpeakerSoundStatus);
    const loadingPercent = loadProgress.total > 0
        ? Math.round(loadProgress.loaded / loadProgress.total * 100)
        : 0;

    return (
        <div className="space-y-2 rounded border border-cyan-500/30 bg-cyan-950/20 p-2.5">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-200">
                        <i className="fa-solid fa-headphones mr-1.5"></i>
                        {t('Exact Factorio sound preview')}
                    </p>
                    <p className="mt-1 text-[9px] text-gray-400">
                        {t('Left')} : {resolved.left.map(instrument => instrument.label).join(', ')} · {t('Right')} : {resolved.right.map(instrument => instrument.label).join(', ')}
                    </p>
                </div>
                {soundStatus?.available && (
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" title={t('Factorio speaker sounds detected')}></span>
                )}
            </div>

            {!desktopBridgeAvailable ? (
                <p className="text-[9px] leading-4 text-amber-200/80">
                    {t('Exact Factorio preview is available in the installed desktop application.')}
                </p>
            ) : soundStatus === undefined ? (
                <p className="text-[9px] text-gray-400">{t('Checking Factorio installation…')}</p>
            ) : !soundStatus.available ? (
                <div className="space-y-2">
                    <p className="text-[9px] leading-4 text-amber-200/80">{t('Factorio speaker sounds not found')}</p>
                    <button
                        type="button"
                        onClick={() => void selectFactorioFolder()}
                        className="w-full rounded border border-amber-400/40 bg-amber-950/40 px-2 py-1.5 text-[9px] font-bold text-amber-100 hover:bg-amber-900/50"
                    >
                        <i className="fa-solid fa-folder-open mr-1.5"></i>{t('Select Factorio folder')}
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex gap-1.5">
                        {phase === 'idle' || phase === 'loading' ? (
                            <button
                                type="button"
                                onClick={() => void start()}
                                disabled={phase === 'loading'}
                                className="min-w-0 flex-1 rounded border border-cyan-400/40 bg-cyan-900/50 px-2 py-1.5 text-[9px] font-bold text-cyan-100 hover:bg-cyan-800/60 disabled:cursor-wait disabled:opacity-70"
                            >
                                <i className={`fa-solid ${phase === 'loading' ? 'fa-spinner fa-spin' : 'fa-play'} mr-1.5`}></i>
                                {phase === 'loading'
                                    ? `${t('Loading game sounds…')} ${loadingPercent}%`
                                    : t('Play converted preview')}
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => void togglePause()}
                                    className="min-w-0 flex-1 rounded border border-cyan-400/40 bg-cyan-900/50 px-2 py-1.5 text-[9px] font-bold text-cyan-100 hover:bg-cyan-800/60"
                                >
                                    <i className={`fa-solid ${phase === 'paused' ? 'fa-play' : 'fa-pause'} mr-1.5`}></i>
                                    {t(phase === 'paused' ? 'Resume preview' : 'Pause preview')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void stop()}
                                    className="rounded border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-gray-300 hover:bg-gray-700"
                                    title={t('Stop preview')}
                                    aria-label={t('Stop preview')}
                                >
                                    <i className="fa-solid fa-stop"></i>
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={() => void selectFactorioFolder()}
                            disabled={phase !== 'idle'}
                            className="rounded border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-gray-400 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title={t('Select another Factorio folder')}
                            aria-label={t('Select another Factorio folder')}
                        >
                            <i className="fa-solid fa-folder-open"></i>
                        </button>
                    </div>
                    <div>
                        {phase === 'loading' ? (
                            <progress
                                value={loadingPercent}
                                max={100}
                                className="h-1.5 w-full accent-cyan-400"
                            />
                        ) : (
                            <input
                                type="range"
                                min={0}
                                max={Math.max(time.duration, 0.001)}
                                step={0.01}
                                value={Math.min(time.current, time.duration)}
                                onChange={event => seek(Number(event.currentTarget.value))}
                                disabled={phase !== 'playing' && phase !== 'paused'}
                                className="h-1.5 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={t('Seek converted preview')}
                                title={t('Seek converted preview')}
                            />
                        )}
                        <div className="mt-0.5 flex justify-between font-mono text-[8px] text-gray-500">
                            <span>{formatTime(time.current)}</span>
                            <span>{formatTime(time.duration)}</span>
                        </div>
                    </div>
                    <p className="truncate text-[8px] text-gray-600" title={soundStatus.soundDirectory}>
                        {soundStatus.soundDirectory}
                    </p>
                </>
            )}

            {error && <p className="text-[9px] leading-4 text-red-300">{error}</p>}
            <p className="text-[8px] leading-3.5 text-gray-500">
                {t('The preview uses the exact local Factorio programmable-speaker samples and does not copy them into the application.')}
            </p>
        </div>
    );
};
