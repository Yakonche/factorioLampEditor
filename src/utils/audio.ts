export interface AudioNoteEvent {
    tick: number;
    leftPitch?: number;
    rightPitch?: number;
    leftMidi?: number;
    rightMidi?: number;
    leftMidis?: number[];
    rightMidis?: number[];
}

export const AUDIO_INSTRUMENTS = {
    piano: { label: 'Piano', instrumentId: 3, firstMidi: 53, noteCount: 48, range: 'F3-E7' },
    bass: { label: 'Bass', instrumentId: 4, firstMidi: 41, noteCount: 36, range: 'F2-E5' },
    lead: { label: 'Lead', instrumentId: 5, firstMidi: 41, noteCount: 36, range: 'F2-E5' },
    saw: { label: 'Saw', instrumentId: 6, firstMidi: 41, noteCount: 36, range: 'F2-E5' },
    square: { label: 'Square', instrumentId: 7, firstMidi: 41, noteCount: 36, range: 'F2-E5' },
    celesta: { label: 'Celesta', instrumentId: 8, firstMidi: 77, noteCount: 36, range: 'F5-E8' },
    vibraphone: { label: 'Vibraphone', instrumentId: 9, firstMidi: 77, noteCount: 36, range: 'F5-E8' },
    plucked: { label: 'Plucked strings', instrumentId: 10, firstMidi: 65, noteCount: 36, range: 'F4-E7' },
    'steel-drum': { label: 'Steel drum', instrumentId: 11, firstMidi: 53, noteCount: 36, range: 'F3-E6' },
} as const;

export type AudioInstrumentName = keyof typeof AUDIO_INSTRUMENTS;
export type AudioInstrumentSelection = 'auto' | AudioInstrumentName;

export interface AudioInstrumentSelections {
    left: AudioInstrumentSelection;
    right: AudioInstrumentSelection;
}

export type ResolvedAudioInstrument = typeof AUDIO_INSTRUMENTS[AudioInstrumentName] & {
    name: AudioInstrumentName;
};

export interface ResolvedAudioInstruments {
    left: ResolvedAudioInstrument;
    right: ResolvedAudioInstrument;
}

export interface ResolvedAudioVoices {
    left: ResolvedAudioInstrument[];
    right: ResolvedAudioInstrument[];
}

export interface DecodedAudioTrack {
    sourceName: string;
    sourceChannels: number;
    sampleRate: number;
    notesPerSecond: number;
    durationTicks: number;
    durationSeconds: number;
    voicesPerChannel?: number;
    leftNoteCount: number;
    rightNoteCount: number;
    leftVoiceNoteCounts?: number[];
    rightVoiceNoteCounts?: number[];
    events: AudioNoteEvent[];
}

export type PreparedAudioEvent = Pick<AudioNoteEvent, 'tick'> & {
    leftPitch?: number;
    rightPitch?: number;
    leftPitches?: number[];
    rightPitches?: number[];
};

export const sourceEventMidis = (event: AudioNoteEvent, channel: 'left' | 'right'): number[] => {
    const midis = channel === 'left' ? event.leftMidis : event.rightMidis;
    if (midis?.length) return midis.map(midi => Math.round(midi));
    const midi = channel === 'left' ? event.leftMidi : event.rightMidi;
    if (midi !== undefined) return [Math.round(midi)];
    const legacyPitch = channel === 'left' ? event.leftPitch : event.rightPitch;
    return legacyPitch === undefined ? [] : [53 + Math.round(legacyPitch) - 1];
};

export const sourceEventMidi = (event: AudioNoteEvent, channel: 'left' | 'right') => {
    return sourceEventMidis(event, channel)[0];
};

const resolveInstrumentForMidis = (
    selection: AudioInstrumentSelection,
    midiNotes: number[],
    usedAutoInstruments: ReadonlySet<AudioInstrumentName> = new Set(),
): ResolvedAudioInstrument => {
    const candidates = Object.entries(AUDIO_INSTRUMENTS) as [
        AudioInstrumentName,
        typeof AUDIO_INSTRUMENTS[AudioInstrumentName],
    ][];
    if (selection !== 'auto') return { name: selection, ...AUDIO_INSTRUMENTS[selection] };
    const clippingCost = (instrument: typeof AUDIO_INSTRUMENTS[AudioInstrumentName]) => (
        midiNotes.reduce((total, midi) => {
            const lastMidi = instrument.firstMidi + instrument.noteCount - 1;
            return total + Math.max(instrument.firstMidi - midi, 0, midi - lastMidi);
        }, 0)
    );
    const [name, instrument] = candidates.reduce((best, candidate) => {
        const [bestName, bestInstrument] = best;
        const [candidateName, candidateInstrument] = candidate;
        const candidateCost = clippingCost(candidateInstrument);
        const bestCost = clippingCost(bestInstrument);
        if (candidateCost !== bestCost) return candidateCost < bestCost ? candidate : best;
        const candidateWasUsed = usedAutoInstruments.has(candidateName);
        const bestWasUsed = usedAutoInstruments.has(bestName);
        if (candidateWasUsed !== bestWasUsed) return candidateWasUsed ? best : candidate;
        if (candidateInstrument.noteCount !== bestInstrument.noteCount) {
            return candidateInstrument.noteCount > bestInstrument.noteCount ? candidate : best;
        }
        return best;
    }, candidates[0]);
    return { name, ...instrument };
};

export const resolveAudioInstrument = (
    selection: AudioInstrumentSelection,
    audioTrack: DecodedAudioTrack | undefined,
    channel: 'left' | 'right',
): ResolvedAudioInstrument => {
    const midiNotes = audioTrack?.events.flatMap(event => sourceEventMidis(event, channel)) ?? [];
    return resolveInstrumentForMidis(selection, midiNotes);
};

export const resolveAudioVoices = (
    audioTrack: DecodedAudioTrack | undefined,
    selections: AudioInstrumentSelections | undefined,
): ResolvedAudioVoices => {
    const configuredVoiceCount = Math.max(1, Math.min(4, audioTrack?.voicesPerChannel ?? 1));
    const usedAutoInstruments = new Set<AudioInstrumentName>();
    const resolveChannel = (channel: 'left' | 'right') => {
        const detectedVoiceCount = audioTrack?.events.reduce((maximum, event) => (
            Math.max(maximum, sourceEventMidis(event, channel).length)
        ), 1) ?? 1;
        const voiceCount = Math.max(1, Math.min(configuredVoiceCount, detectedVoiceCount));
        return Array.from({ length: voiceCount }, (_, voiceIndex) => {
        const midiNotes = audioTrack?.events
            .map(event => sourceEventMidis(event, channel)[voiceIndex])
            .filter((midi): midi is number => midi !== undefined) ?? [];
        const selection = voiceIndex === 0 ? selections?.[channel] ?? 'auto' : 'auto';
        const instrument = resolveInstrumentForMidis(selection, midiNotes, usedAutoInstruments);
        if (selection === 'auto') usedAutoInstruments.add(instrument.name);
        return instrument;
        });
    };
    return {
        left: resolveChannel('left'),
        right: resolveChannel('right'),
    };
};

export const resolveAudioInstruments = (
    audioTrack: DecodedAudioTrack | undefined,
    selections: AudioInstrumentSelections | undefined,
): ResolvedAudioInstruments => {
    const voices = resolveAudioVoices(audioTrack, selections);
    return { left: voices.left[0], right: voices.right[0] };
};

export const prepareAudioEvents = (
    audioTrack: DecodedAudioTrack | undefined,
    cycleTicks: number,
    instruments: ResolvedAudioInstruments | ResolvedAudioVoices,
): PreparedAudioEvent[] => {
    if (!audioTrack) return [];
    const voiceInstruments: ResolvedAudioVoices = Array.isArray(instruments.left)
        ? instruments as ResolvedAudioVoices
        : {
            left: [(instruments as ResolvedAudioInstruments).left],
            right: [(instruments as ResolvedAudioInstruments).right],
        };
    const byTick = new Map<number, PreparedAudioEvent>();
    for (const sourceEvent of audioTrack.events) {
        const tick = Math.max(0, Math.round(sourceEvent.tick));
        if (tick >= cycleTicks) continue;
        const pitchesFor = (channel: 'left' | 'right') => sourceEventMidis(sourceEvent, channel)
            .slice(0, voiceInstruments[channel].length)
            .map((midi, voiceIndex) => {
                const instrument = voiceInstruments[channel][voiceIndex];
                return Math.max(1, Math.min(
                    instrument.noteCount,
                    midi - instrument.firstMidi + 1,
                ));
            });
        const leftPitches = pitchesFor('left');
        const rightPitches = pitchesFor('right');
        const leftPitch = leftPitches[0];
        const rightPitch = rightPitches[0];
        if (leftPitch === undefined && rightPitch === undefined) continue;
        byTick.set(tick, {
            tick,
            leftPitch,
            rightPitch,
            ...(leftPitches.length ? { leftPitches } : {}),
            ...(rightPitches.length ? { rightPitches } : {}),
        });
    }
    return [...byTick.values()].sort((first, second) => first.tick - second.tick);
};
