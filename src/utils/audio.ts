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
