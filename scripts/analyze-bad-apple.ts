import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
    calculateMediaAnimationPreviewLayout,
    generateMediaAnimationBlueprintData,
} from '../src/utils/blueprint';
import type { DecodedAudioTrack } from '../src/utils/audio';
import type { GridAnimationData } from '../src/utils/mediaAnimation';

const require = createRequire(import.meta.url);
const { decodeMedia } = require(resolve('electron/media.cjs')) as {
    decodeMedia: (request: Record<string, unknown>, binaries: { ffmpegPath: string }) => Promise<{
        firstFrame: Uint32Array;
        firstDurationTicks: number;
        transitions: GridAnimationData['transitions'];
        width: number;
        height: number;
        sampledFps: number;
        sampledFrameCount: number;
        frameCount: number;
        durationTicks: number;
    }>;
};
const ffmpegPath = require('ffmpeg-static') as string;
const { decodeAudioNotes } = require(resolve('electron/audio.cjs')) as {
    decodeAudioNotes: (
        request: Record<string, unknown>,
        binaries: { ffmpegPath: string },
    ) => Promise<DecodedAudioTrack>;
};

const startedAt = performance.now();
const decoded = await decodeMedia({
    sourceName: 'bad-apple.gif',
    bytes: readFileSync('release/bad-apple.gif'),
    fpsLimit: 20,
    maxDimension: 360,
    colorMode: 'monochrome',
    monochromeThreshold: 128,
}, { ffmpegPath });
const animation: GridAnimationData = {
    firstFrame: {
        width: decoded.width,
        height: decoded.height,
        cells: decoded.firstFrame,
    },
    firstDurationTicks: decoded.firstDurationTicks,
    transitions: decoded.transitions,
};
const preview = calculateMediaAnimationPreviewLayout(
    animation,
    decoded.width,
    decoded.height,
    [],
    [],
    'medium-electric-pole',
    false,
    'top',
);
const dynamicLineCount = preview.stats.arithmeticCombinatorCount;
const oldDenseDeciders = 1 + dynamicLineCount * (decoded.frameCount + 1);
const newSparseDeciders = preview.stats.deciderCombinatorCount;
console.log(JSON.stringify({
    dimensions: `${decoded.width}x${decoded.height}`,
    sampledFps: decoded.sampledFps,
    sampledFrames: decoded.sampledFrameCount,
    uniqueFrames: decoded.frameCount,
    durationSeconds: decoded.durationTicks / 60,
    dynamicLineCount,
    oldDenseDeciders,
    newSparseDeciders,
    removedEmptyDeciders: oldDenseDeciders - newSparseDeciders,
    reductionPercent: Number(((oldDenseDeciders - newSparseDeciders) / oldDenseDeciders * 100).toFixed(2)),
    elapsedSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
}));

if (process.argv.includes('--generate')) {
    const audioTrack = await decodeAudioNotes({
        sourceName: 'Bad Apple.mp3',
        bytes: readFileSync('release/Bad Apple.mp3'),
        notesPerSecond: 4,
    }, { ffmpegPath });
    const generationStartedAt = performance.now();
    const generated = generateMediaAnimationBlueprintData(
        animation,
        decoded.width,
        decoded.height,
        {
            poleType: 'medium-electric-pole',
            qualityIdx: 0,
            autoPole: true,
            smartPlacement: false,
            autoRoboport: false,
            autoConstruction: false,
            includeHelpDisplay: true,
            controllerSide: 'top',
            label: 'Bad Apple full fidelity + approximate stereo notes',
            audioTrack,
        },
    );
    if (!generated.bpString) throw new Error(generated.status);
    const outputPath = 'node_modules/.cache/bad-apple-full-blueprint.txt';
    writeFileSync(outputPath, generated.bpString);
    console.log(JSON.stringify({
        status: generated.status,
        outputPath,
        blueprintCharacters: generated.bpString.length,
        synchronizedAudioEvents: audioTrack.events.filter(event => event.tick < decoded.durationTicks).length,
        generationSeconds: Number(((performance.now() - generationStartedAt) / 1000).toFixed(2)),
    }));
}
