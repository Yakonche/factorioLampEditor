import {
    prepareAudioEvents,
    resolveAudioVoices,
    type AudioInstrumentName,
    type AudioInstrumentSelections,
    type DecodedAudioTrack,
} from './audio';

export interface FactorioAudioPreviewCallbacks {
    onLoadProgress?: (loaded: number, total: number) => void;
    onTimeUpdate?: (seconds: number, duration: number) => void;
    onEnded?: () => void;
}

export interface FactorioAudioPreviewController {
    duration: number;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    seek: (seconds: number) => Promise<void>;
    stop: () => Promise<void>;
}

interface PreviewNote {
    tick: number;
    channel: 'left' | 'right';
    voiceIndex: number;
    instrument: AudioInstrumentName;
    pitch: number;
}

const sampleKey = (instrument: AudioInstrumentName, pitch: number) => `${instrument}:${pitch}`;

export const createFactorioAudioPreview = async (
    audioTrack: DecodedAudioTrack,
    selections: AudioInstrumentSelections,
    callbacks: FactorioAudioPreviewCallbacks = {},
): Promise<FactorioAudioPreviewController> => {
    const readSample = window.factorioLampEditor?.readFactorioSpeakerSound;
    if (!readSample) throw new Error('Factorio speaker sound access is unavailable.');

    const instruments = resolveAudioVoices(audioTrack, selections);
    const cycleTicks = Math.max(
        1,
        Math.ceil(audioTrack.durationSeconds * 60) + 1,
        audioTrack.durationTicks + 1,
    );
    const preparedEvents = prepareAudioEvents(audioTrack, cycleTicks, instruments);
    const notes: PreviewNote[] = preparedEvents.flatMap(event => {
        const eventNotes: PreviewNote[] = [];
        (event.leftPitches ?? (event.leftPitch !== undefined ? [event.leftPitch] : [])).forEach((pitch, voiceIndex) => {
            eventNotes.push({
                tick: event.tick,
                channel: 'left',
                voiceIndex,
                instrument: instruments.left[voiceIndex].name,
                pitch,
            });
        });
        (event.rightPitches ?? (event.rightPitch !== undefined ? [event.rightPitch] : [])).forEach((pitch, voiceIndex) => {
            eventNotes.push({
                tick: event.tick,
                channel: 'right',
                voiceIndex,
                instrument: instruments.right[voiceIndex].name,
                pitch,
            });
        });
        return eventNotes;
    });
    if (notes.length === 0) throw new Error('The converted audio does not contain any playable notes.');

    const context = new AudioContext();
    const masterGain = context.createGain();
    const speakerCount = instruments.left.length + instruments.right.length;
    masterGain.gain.value = Math.min(
        audioTrack.sourceChannels > 1 ? 0.58 : 0.72,
        1.1 / Math.sqrt(Math.max(1, speakerCount)),
    );
    masterGain.connect(context.destination);

    const uniqueSamples = [...new Map(notes.map(note => [
        sampleKey(note.instrument, note.pitch),
        { instrument: note.instrument, pitch: note.pitch },
    ])).values()];
    const buffers = new Map<string, AudioBuffer>();

    try {
        callbacks.onLoadProgress?.(0, uniqueSamples.length);
        let loaded = 0;
        await Promise.all(uniqueSamples.map(async sample => {
            const bytes = await readSample(sample.instrument, sample.pitch);
            const encoded = bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer;
            const buffer = await context.decodeAudioData(encoded);
            buffers.set(sampleKey(sample.instrument, sample.pitch), buffer);
            loaded += 1;
            callbacks.onLoadProgress?.(loaded, uniqueSamples.length);
        }));
    } catch (error) {
        await context.close();
        throw error;
    }

    const longestSample = Math.max(...[...buffers.values()].map(buffer => buffer.duration), 0);
    const lastNoteSeconds = notes[notes.length - 1].tick / 60;
    const duration = Math.max(audioTrack.durationSeconds, lastNoteSeconds + longestSample);
    const activeSources = new Set<AudioBufferSourceNode>();
    let scheduledIndex = 0;
    const timers: { schedulerId?: number; animationFrameId?: number } = {};
    let stopped = false;
    let ended = false;
    let paused = false;
    let startTime = 0;

    const stopActiveSources = () => {
        for (const source of activeSources) {
            try {
                source.stop();
            } catch {
                // A source can already have ended between iteration and stop().
            }
        }
        activeSources.clear();
    };

    const findFirstPotentiallyAudibleNote = (seconds: number) => {
        const earliestSeconds = Math.max(0, seconds - longestSample);
        let low = 0;
        let high = notes.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (notes[middle].tick / 60 < earliestSeconds) low = middle + 1;
            else high = middle;
        }
        return low;
    };

    const finish = async (notifyEnded: boolean) => {
        if (stopped) return;
        stopped = true;
        if (timers.schedulerId !== undefined) window.clearInterval(timers.schedulerId);
        if (timers.animationFrameId !== undefined) window.cancelAnimationFrame(timers.animationFrameId);
        stopActiveSources();
        if (context.state !== 'closed') await context.close();
        if (notifyEnded && !ended) {
            ended = true;
            callbacks.onTimeUpdate?.(duration, duration);
            callbacks.onEnded?.();
        }
    };

    const scheduleAhead = () => {
        if (stopped || paused) return;
        const elapsed = Math.max(0, context.currentTime - startTime);
        const horizon = elapsed + 1.25;
        while (scheduledIndex < notes.length && notes[scheduledIndex].tick / 60 <= horizon) {
            const note = notes[scheduledIndex];
            const buffer = buffers.get(sampleKey(note.instrument, note.pitch));
            if (buffer) {
                const intendedStart = startTime + note.tick / 60;
                const offset = Math.max(0, context.currentTime - intendedStart);
                if (offset >= buffer.duration) {
                    scheduledIndex += 1;
                    continue;
                }
                const source = context.createBufferSource();
                source.buffer = buffer;
                const panner = context.createStereoPanner();
                const channelVoices = instruments[note.channel].length;
                const voiceSpread = channelVoices > 1
                    ? (note.voiceIndex / (channelVoices - 1) - 0.5) * 0.22
                    : 0;
                panner.pan.value = audioTrack.sourceChannels > 1
                    ? Math.max(-1, Math.min(1, (note.channel === 'left' ? -0.72 : 0.72) + voiceSpread))
                    : 0;
                source.connect(panner);
                panner.connect(masterGain);
                activeSources.add(source);
                source.addEventListener('ended', () => activeSources.delete(source), { once: true });
                source.start(Math.max(context.currentTime, intendedStart), offset);
            }
            scheduledIndex += 1;
        }
    };

    const updateProgress = () => {
        if (stopped) return;
        const elapsed = Math.max(0, context.currentTime - startTime);
        callbacks.onTimeUpdate?.(Math.min(elapsed, duration), duration);
        if (elapsed >= duration) {
            void finish(true);
            return;
        }
        timers.animationFrameId = window.requestAnimationFrame(updateProgress);
    };

    await context.resume();
    startTime = context.currentTime + 0.08;
    scheduleAhead();
    timers.schedulerId = window.setInterval(scheduleAhead, 100);
    timers.animationFrameId = window.requestAnimationFrame(updateProgress);

    return {
        duration,
        pause: async () => {
            if (stopped || paused) return;
            paused = true;
            await context.suspend();
            if (timers.animationFrameId !== undefined) {
                window.cancelAnimationFrame(timers.animationFrameId);
                timers.animationFrameId = undefined;
            }
        },
        resume: async () => {
            if (stopped || !paused) return;
            await context.resume();
            paused = false;
            scheduleAhead();
            timers.animationFrameId = window.requestAnimationFrame(updateProgress);
        },
        seek: async seconds => {
            if (stopped) return;
            const target = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, duration));
            stopActiveSources();
            scheduledIndex = findFirstPotentiallyAudibleNote(target);
            startTime = context.currentTime - target;
            callbacks.onTimeUpdate?.(target, duration);
            if (!paused) scheduleAhead();
        },
        stop: () => finish(false),
    };
};
