export interface AudioNoteEvent {
    tick: number;
    leftPitch?: number;
    rightPitch?: number;
    leftMidi?: number;
    rightMidi?: number;
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

export interface DecodedAudioTrack {
    sourceName: string;
    sourceChannels: number;
    sampleRate: number;
    notesPerSecond: number;
    durationTicks: number;
    durationSeconds: number;
    leftNoteCount: number;
    rightNoteCount: number;
    events: AudioNoteEvent[];
}

export type PreparedAudioEvent = Pick<AudioNoteEvent, 'tick'> & {
    leftPitch?: number;
    rightPitch?: number;
};

export const sourceEventMidi = (event: AudioNoteEvent, channel: 'left' | 'right') => {
    const midi = channel === 'left' ? event.leftMidi : event.rightMidi;
    if (midi !== undefined) return Math.round(midi);
    const legacyPitch = channel === 'left' ? event.leftPitch : event.rightPitch;
    return legacyPitch === undefined ? undefined : 53 + Math.round(legacyPitch) - 1;
};

export const resolveAudioInstrument = (
    selection: AudioInstrumentSelection,
    audioTrack: DecodedAudioTrack | undefined,
    channel: 'left' | 'right',
): ResolvedAudioInstrument => {
    const candidates = Object.entries(AUDIO_INSTRUMENTS) as [
        AudioInstrumentName,
        typeof AUDIO_INSTRUMENTS[AudioInstrumentName],
    ][];
    let name: AudioInstrumentName;
    if (selection !== 'auto') {
        name = selection;
    } else {
        const midiNotes = audioTrack?.events
            .map(event => sourceEventMidi(event, channel))
            .filter((midi): midi is number => midi !== undefined) ?? [];
        name = candidates.reduce((bestName, [candidateName, candidate]) => {
            const best = AUDIO_INSTRUMENTS[bestName];
            const clippingCost = (instrument: typeof candidate) => midiNotes.reduce((total, midi) => {
                const lastMidi = instrument.firstMidi + instrument.noteCount - 1;
                return total + Math.max(instrument.firstMidi - midi, 0, midi - lastMidi);
            }, 0);
            const candidateCost = clippingCost(candidate);
            const bestCost = clippingCost(best);
            if (candidateCost !== bestCost) return candidateCost < bestCost ? candidateName : bestName;
            if (candidate.noteCount !== best.noteCount) {
                return candidate.noteCount > best.noteCount ? candidateName : bestName;
            }
            return bestName;
        }, 'piano' as AudioInstrumentName);
    }
    return { name, ...AUDIO_INSTRUMENTS[name] };
};

export const resolveAudioInstruments = (
    audioTrack: DecodedAudioTrack | undefined,
    selections: AudioInstrumentSelections | undefined,
): ResolvedAudioInstruments => ({
    left: resolveAudioInstrument(selections?.left ?? 'auto', audioTrack, 'left'),
    right: resolveAudioInstrument(selections?.right ?? 'auto', audioTrack, 'right'),
});

export const prepareAudioEvents = (
    audioTrack: DecodedAudioTrack | undefined,
    cycleTicks: number,
    instruments: ResolvedAudioInstruments,
): PreparedAudioEvent[] => {
    if (!audioTrack) return [];
    const byTick = new Map<number, PreparedAudioEvent>();
    for (const sourceEvent of audioTrack.events) {
        const tick = Math.max(0, Math.round(sourceEvent.tick));
        if (tick >= cycleTicks) continue;
        const pitchFor = (channel: 'left' | 'right') => {
            const midi = sourceEventMidi(sourceEvent, channel);
            if (midi === undefined) return undefined;
            const instrument = instruments[channel];
            return Math.max(1, Math.min(
                instrument.noteCount,
                midi - instrument.firstMidi + 1,
            ));
        };
        const leftPitch = pitchFor('left');
        const rightPitch = pitchFor('right');
        if (leftPitch === undefined && rightPitch === undefined) continue;
        byTick.set(tick, { tick, leftPitch, rightPitch });
    }
    return [...byTick.values()].sort((first, second) => first.tick - second.tick);
};
