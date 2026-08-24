import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import pako from 'pako';
import {
    calculateActivePoles,
    calculateActiveRoboports,
    calculateMediaAnimationPreviewLayout,
    generateMediaAnimationBlueprintData,
    MAX_BLUEPRINT_PREVIEW_ENTITIES,
    type BlueprintEntity,
    type BlueprintJson,
    type BlueprintPreviewEntity,
} from '../src/utils/blueprint';
import {
    animationFrameAtTick,
    animationDurationTicks,
    createAnimationTimeline,
    createAnimationUnionGrid,
    createGridAnimationFromFrames,
    evenlySpacedFrameIndices,
    selectAnimationFrames,
    type GridAnimationData,
} from '../src/utils/mediaAnimation';
import { buildPreviewSpatialIndex, previewEntitiesInBounds } from '../src/utils/previewSpatialIndex';
import type { GridData } from '../src/utils/grid';
import { POLE_DATA } from '../src/constants';
import { PIXEL_SIGNALS } from '../src/utils/factorioSignals';
import type { DecodedAudioTrack } from '../src/utils/audio';

type RomOutput = {
    signal: { type: string; name: string };
    constant?: number;
};

const packedRgb = (packedColor: number) => {
    if (!packedColor) return 0;
    const red = packedColor & 0xff;
    const green = (packedColor >>> 8) & 0xff;
    const blue = (packedColor >>> 16) & 0xff;
    return (red << 16) | (green << 8) | blue || 1;
};

const width = 24;
const height = 18;
const makeFrame = (phase: number): GridData => {
    const frame: GridData = { width, height, cells: new Uint32Array(width * height) };
    for (let y = 3; y <= 14; y++) {
        for (let x = 4; x <= 19; x++) {
            if ((x + y + phase) % 5 === 0) continue;
            const red = (40 + phase * 37 + x * 5) & 0xff;
            const green = (80 + y * 9 + phase * 11) & 0xff;
            const blue = (150 + x * 3 - phase * 17) & 0xff;
            frame.cells[y * width + x] = (
                0xff000000 | (blue << 16) | (green << 8) | red
            ) >>> 0;
        }
    }
    return frame;
};
const frames = [0, 1, 2, 3].map(makeFrame);
const durations = [2, 3, 2, 4];
const animation: GridAnimationData = {
    firstFrame: frames[0],
    firstDurationTicks: durations[0],
    transitions: frames.slice(1).map((frame, frameIndex) => {
        const previous = frames[frameIndex];
        const indices: number[] = [];
        const colors: number[] = [];
        for (let index = 0; index < frame.cells.length; index++) {
            if (frame.cells[index] === previous.cells[index]) continue;
            indices.push(index);
            colors.push(frame.cells[index]);
        }
        return {
            indices: Uint32Array.from(indices),
            colors: Uint32Array.from(colors),
            durationTicks: durations[frameIndex + 1],
        };
    }),
};

const timeline = createAnimationTimeline(animation);
assert.deepEqual(timeline.frameStartTicks, [0, 2, 5, 7]);
assert.equal(timeline.durationTicks, 11);
assert.deepEqual(
    Array.from({ length: 15 }, (_, tick) => animationFrameAtTick(timeline, tick)),
    [0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 3, 0, 0, 1, 1],
    'Preview playback must match Factorio frame durations and loop ticks exactly.',
);

assert.equal(MAX_BLUEPRINT_PREVIEW_ENTITIES, 100_000);
const spatialEntities: BlueprintPreviewEntity[] = Array.from({ length: 50_000 }, (_, index) => ({
    kind: 'decider-combinator',
    name: `ROM ${index}`,
    description: 'Spatial-index validation entity.',
    x: index,
    y: index % 3,
    width: 1,
    height: 1,
}));
const spatialIndex = buildPreviewSpatialIndex(spatialEntities);
assert.equal(spatialIndex.byTile.size, spatialEntities.length);
const spatialCandidates = previewEntitiesInBounds(spatialIndex, 100, 0, 110, 2);
assert.ok(spatialCandidates.length <= 64, 'A narrow viewport must not scan the complete entity list.');
for (let x = 100; x <= 110; x++) {
    assert.ok(spatialCandidates.some(entity => entity.x === x));
}

const union = createAnimationUnionGrid(animation);
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let index = 0; index < union.cells.length; index++) {
    if (!union.cells[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
}

const poleType = 'medium-electric-pole';
const qualityIdx = 0;
const normalize = (value: number) => Number(value.toFixed(4));
const decodeBlueprint = (value: string) => {
    const compressed = Uint8Array.from(Buffer.from(value.slice(1), 'base64'));
    return JSON.parse(new TextDecoder().decode(pako.inflate(compressed))) as BlueprintJson;
};
const entityFootprint = (entity: BlueprintEntity) => {
    if (entity.name === 'decider-combinator' || entity.name === 'arithmetic-combinator') {
        const vertical = entity.direction === 0 || entity.direction === 8;
        const footprintWidth = vertical ? 1 : 2;
        const footprintHeight = vertical ? 2 : 1;
        return {
            x: entity.position.x - footprintWidth / 2,
            y: entity.position.y - footprintHeight / 2,
            width: footprintWidth,
            height: footprintHeight,
        };
    }
    const size = entity.name === 'substation' ? 2 : entity.name === 'roboport' ? 4 : 1;
    return {
        x: entity.position.x - size / 2,
        y: entity.position.y - size / 2,
        width: size,
        height: size,
    };
};
const circuitReach = (entity: BlueprintEntity) => entity.name in POLE_DATA
    ? POLE_DATA[entity.name].wire[qualityIdx]
    : 9;

for (const controllerSide of ['left', 'top', 'right', 'bottom'] as const) {
    const poles = calculateActivePoles(
        poleType,
        qualityIdx,
        minX,
        minY,
        maxX,
        maxY,
        union,
        width,
        height,
    );
    const roboports = calculateActiveRoboports(
        poles,
        poleType,
        qualityIdx,
        union,
        width,
        height,
        true,
    );
    const replaced = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
    const effectivePoles = poles.filter((_, index) => !replaced.has(index));
    const preview = calculateMediaAnimationPreviewLayout(
        animation,
        width,
        height,
        effectivePoles,
        roboports,
        poleType,
        true,
        controllerSide,
        true,
    );
    const result = generateMediaAnimationBlueprintData(animation, width, height, {
        poleType,
        qualityIdx,
        autoPole: true,
        smartPlacement: false,
        autoRoboport: true,
        autoConstruction: true,
        includeHelpDisplay: true,
        controllerSide,
        label: `Media test ${controllerSide}`,
    });
    assert.equal(result.status, 'Success');
    assert.ok(result.bpString);
    const blueprint = decodeBlueprint(result.bpString);
    const entities = blueprint.blueprint.entities;
    const byId = new Map(entities.map(entity => [entity.entity_number, entity]));
    const expectedDirection = { left: 4, top: 8, right: 12, bottom: 0 }[controllerSide];
    const combinators = entities.filter(entity => (
        entity.name === 'decider-combinator' || entity.name === 'arithmetic-combinator'
    ));
    assert.ok(combinators.every(entity => entity.direction === expectedDirection));
    assert.equal(
        entities.filter(entity => entity.name === 'decider-combinator').length,
        preview.stats.deciderCombinatorCount,
    );
    assert.equal(
        entities.filter(entity => entity.name === 'arithmetic-combinator').length,
        preview.stats.arithmeticCombinatorCount,
    );
    assert.equal(
        entities.filter(entity => entity.name === 'constant-combinator').length,
        preview.stats.constantCombinatorCount,
    );
    assert.equal(
        entities.filter(entity => entity.player_description === 'Media controller auto-construction roboport.').length,
        preview.stats.controllerRoboportCount,
    );

    const infrastructure = entities.filter(entity => (
        entity.name === 'decider-combinator'
        || entity.name === 'arithmetic-combinator'
        || entity.name === 'constant-combinator'
        || entity.name === 'display-panel'
        || (entity.name === 'substation' && entity.player_description?.startsWith('Media animation power'))
        || entity.player_description === 'Media controller auto-construction roboport.'
        || (entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive media'))
    ));
    const controllerSupports = entities.filter(entity => (
        entity.name === 'substation'
        && entity.player_description?.startsWith('Media animation power')
    ));
    const controllerSupportIds = new Set(controllerSupports.map(entity => entity.entity_number));
    const controllerSupportWires = (blueprint.blueprint.wires ?? []).filter(([firstId, , secondId]) => (
        controllerSupportIds.has(firstId) && controllerSupportIds.has(secondId)
    ));
    assert.equal(
        controllerSupportWires.length,
        Math.max(0, controllerSupports.length - 1),
        `${controllerSide} controller support network must be a spanning tree.`,
    );
    const actualKeys = infrastructure.map((entity) => {
        const rect = entityFootprint(entity);
        return `${entity.name}:${normalize(minX + rect.x)},${normalize(minY + rect.y)},${rect.width},${rect.height}`;
    }).sort();
    const previewKeys = preview.entities.map((entity) => {
        const name = entity.kind === 'controller-substation'
            ? 'substation'
            : entity.kind === 'controller-roboport'
                ? 'roboport'
                : entity.kind === 'relay-pole'
                    ? 'medium-electric-pole'
                    : entity.kind;
        return `${name}:${normalize(entity.x)},${normalize(entity.y)},${entity.width},${entity.height}`;
    }).sort();
    assert.deepEqual(previewKeys, actualKeys, `${controllerSide} media preview must match the blueprint.`);

    const controllerEntities = infrastructure.filter(entity => (
        entity.name !== 'constant-combinator'
        && entity.name !== 'display-panel'
        && !(entity.name === 'medium-electric-pole')
    ));
    const controllerRects = controllerEntities.map(entity => ({
        id: entity.entity_number,
        ...entityFootprint(entity),
    }));
    for (let firstIndex = 0; firstIndex < controllerRects.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < controllerRects.length; secondIndex++) {
            const firstRect = controllerRects[firstIndex];
            const secondRect = controllerRects[secondIndex];
            assert.ok(
                firstRect.x + firstRect.width <= secondRect.x
                || secondRect.x + secondRect.width <= firstRect.x
                || firstRect.y + firstRect.height <= secondRect.y
                || secondRect.y + secondRect.height <= firstRect.y,
                `${controllerSide} controller entities ${firstRect.id} and ${secondRect.id} overlap.`,
            );
        }
    }

    const powerPoles = entities.filter(entity => entity.name in POLE_DATA);
    const poweredEntities = entities.filter(entity => (
        entity.name === 'small-lamp'
        || entity.name === 'decider-combinator'
        || entity.name === 'arithmetic-combinator'
        || entity.name === 'constant-combinator'
        || entity.name === 'roboport'
    ));
    const unpowered = poweredEntities.filter(entity => !powerPoles.some(pole => {
        const halfSupply = POLE_DATA[pole.name].supply[qualityIdx] / 2;
        const vertical = entity.direction === 0 || entity.direction === 8;
        const halfWidth = entity.name === 'roboport' ? 2 : entity.name.includes('combinator') && !vertical ? 1 : 0.5;
        const halfHeight = entity.name === 'roboport' ? 2 : entity.name.includes('combinator') && vertical ? 1 : 0.5;
        return Math.abs(entity.position.x - pole.position.x) < halfSupply + halfWidth
            && Math.abs(entity.position.y - pole.position.y) < halfSupply + halfHeight;
    }));
    assert.deepEqual(
        unpowered.map(entity => ({ name: entity.name, description: entity.player_description, position: entity.position })),
        [],
        `${controllerSide} media layout contains unpowered entities.`,
    );

    for (const [firstId, , secondId] of blueprint.blueprint.wires ?? []) {
        const first = byId.get(firstId)!;
        const second = byId.get(secondId)!;
        const dx = first.position.x - second.position.x;
        const dy = first.position.y - second.position.y;
        const maximumDistance = Math.min(circuitReach(first), circuitReach(second));
        assert.ok(
            dx * dx + dy * dy <= maximumDistance * maximumDistance,
            `${controllerSide} media circuit wire ${firstId}-${secondId} exceeds ${maximumDistance} tiles.`,
        );
    }

    const timer = entities.find(entity => entity.player_description?.startsWith('Media cycle timer:'))!;
    const timerCondition = timer.control_behavior?.decider_conditions as {
        conditions: { comparator: string; constant: number }[];
    };
    assert.equal(timerCondition.conditions[0].constant, durations.reduce((sum, value) => sum + value, 0));
    const timerIncrement = entities.find(entity => entity.player_description?.startsWith('Media animation clock increment'))!;
    const timerIncrementWires = (blueprint.blueprint.wires ?? []).filter(wire => wire[0] === timerIncrement.entity_number || wire[2] === timerIncrement.entity_number);
    assert.ok(timerIncrementWires.every(wire => (
        wire[0] === timerIncrement.entity_number ? wire[1] === 2 : wire[3] === 2
    )), 'The timer increment must stay on the private green feedback network.');

    const verticalLines = controllerSide === 'top' || controllerSide === 'bottom';
    const baseRoms = new Map<number, Map<string, number>>();
    const eventRoms = new Map<number, Map<number, Map<string, number>>>();
    for (const entity of entities) {
        const baseMatch = entity.player_description?.match(/^Generated media base ROM \(last frame\), (?:row|column) (\d+)\.$/);
        const eventMatch = entity.player_description?.match(/^Generated media frame (\d+) delta ROM, (?:row|column) (\d+), T = (\d+)\.$/);
        const outputs = ((entity.control_behavior?.decider_conditions as { outputs?: RomOutput[] } | undefined)?.outputs ?? []);
        const outputMap = new Map(outputs.map(output => [
            `${output.signal.type}:${output.signal.name}`,
            output.constant ?? 0,
        ]));
        if (baseMatch) baseRoms.set(Number(baseMatch[1]) - 1, outputMap);
        if (eventMatch) {
            const eventIndex = Number(eventMatch[1]) - 1;
            const line = Number(eventMatch[2]) - 1;
            const lines = eventRoms.get(eventIndex) ?? new Map();
            lines.set(line, outputMap);
            eventRoms.set(eventIndex, lines);
        }
    }
    assert.equal(eventRoms.size, frames.length);
    const expectedThresholds = [0, durations[0], durations[0] + durations[1], durations[0] + durations[1] + durations[2]];
    const actualThresholds = entities
        .filter(entity => entity.player_description?.startsWith('Generated media frame'))
        .map(entity => Number(entity.player_description?.match(/T = (\d+)\.$/)?.[1]))
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((first, second) => first - second);
    assert.deepEqual(actualThresholds, expectedThresholds);

    const lamps = entities.filter(entity => entity.name === 'small-lamp' && !entity.player_description);
    for (const lamp of lamps) {
        const signal = lamp.control_behavior?.rgb_signal as { type: string; name: string };
        const signalKey = `${signal.type}:${signal.name}`;
        const localX = lamp.position.x - 0.5;
        const localY = lamp.position.y - 0.5;
        const sourceX = minX + localX;
        const sourceY = minY + localY;
        const sourceIndex = sourceY * width + sourceX;
        const localLine = verticalLines ? localX : localY;
        let value = baseRoms.get(localLine)?.get(signalKey) ?? 0;
        for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
            value += eventRoms.get(frameIndex)?.get(localLine)?.get(signalKey) ?? 0;
            assert.equal(
                value,
                packedRgb(frames[frameIndex].cells[sourceIndex]),
                `${controllerSide} frame ${frameIndex + 1} mismatch at ${sourceX},${sourceY}.`,
            );
        }
    }
}

assert.equal(PIXEL_SIGNALS.length, 1024);
assert.equal(new Set(PIXEL_SIGNALS.map(signal => `${signal.type}:${signal.name}`)).size, 1024);
assert.ok(PIXEL_SIGNALS.every(signal => signal.name.length > 0 && signal.name !== 'satellite'));

const optimizedFrames: GridData[] = [
    { width: 3, height: 1, cells: Uint32Array.from([0xff3366ff, 0xff0000ff, 0]) },
    { width: 3, height: 1, cells: Uint32Array.from([0xff3366ff, 0xffff0000, 0]) },
    { width: 3, height: 1, cells: Uint32Array.from([0xff3366ff, 0, 0]) },
];
const optimizedAnimation = createGridAnimationFromFrames(optimizedFrames, [5, 7, 11]);
const optimizedResult = generateMediaAnimationBlueprintData(optimizedAnimation, 3, 1, {
    poleType,
    qualityIdx,
    autoPole: false,
    smartPlacement: false,
    autoRoboport: false,
    autoConstruction: false,
    includeHelpDisplay: false,
    controllerSide: 'left',
    backgroundTile: 'concrete',
});
assert.ok(optimizedResult.bpString);
const optimizedBlueprint = decodeBlueprint(optimizedResult.bpString);
const optimizedEntities = optimizedBlueprint.blueprint.entities;
const staticLamps = optimizedEntities.filter(entity => entity.player_description?.startsWith('Static animation pixel:'));
const dynamicLamps = optimizedEntities.filter(entity => entity.name === 'small-lamp' && !entity.player_description);
assert.equal(staticLamps.length, 1);
assert.equal(staticLamps[0].always_on, true);
assert.equal(staticLamps[0].control_behavior, undefined);
assert.equal(dynamicLamps.length, 1);
assert.equal(optimizedBlueprint.blueprint.tiles?.length, 12);
assert.ok(optimizedBlueprint.blueprint.tiles?.every(tile => tile.name === 'concrete'));
assert.deepEqual(
    new Set(optimizedBlueprint.blueprint.tiles?.map(tile => `${tile.position.x},${tile.position.y}`)),
    new Set(Array.from({ length: 3 }, (_, y) => Array.from({ length: 4 }, (_, x) => `${x - 1},${y - 1}`)).flat()),
);

const independentAnimation: GridAnimationData = {
    firstFrame: {
        width: 2,
        height: 1,
        cells: Uint32Array.from([0xff0000ff, 0xff00ff00]),
    },
    firstDurationTicks: 4,
    transitions: [{
        indices: Uint32Array.of(0),
        colors: Uint32Array.of(0xffff0000),
        durationTicks: 4,
    }],
    tracks: [{
        firstDurationTicks: 4,
        transitions: [{
            indices: Uint32Array.of(0),
            colors: Uint32Array.of(0xffff0000),
            durationTicks: 4,
        }],
    }, {
        firstDurationTicks: 6,
        transitions: [{
            indices: Uint32Array.of(1),
            colors: Uint32Array.of(0xffffffff),
            durationTicks: 6,
        }],
    }],
};
const independentResult = generateMediaAnimationBlueprintData(independentAnimation, 2, 1, {
    poleType,
    qualityIdx,
    autoPole: false,
    smartPlacement: false,
    autoRoboport: false,
    autoConstruction: false,
    includeHelpDisplay: false,
    controllerSide: 'top',
});
assert.equal(independentResult.status, 'Success');
assert.ok(independentResult.bpString);
const independentEntities = decodeBlueprint(independentResult.bpString).blueprint.entities;
const independentTimers = independentEntities.filter(entity => (
    entity.player_description?.startsWith('Independent media cycle timer')
));
assert.equal(independentTimers.length, 2, 'Each separately placed animation needs its own Factorio timer.');
assert.deepEqual(
    independentTimers.map(timer => {
        const condition = (timer.control_behavior?.decider_conditions as {
            conditions: { first_signal: { name: string }; constant: number }[];
        }).conditions[0];
        return [condition.first_signal.name, condition.constant];
    }),
    [['signal-T', 8], ['signal-A', 12]],
    'Independent clocks must preserve each source loop instead of using an LCM timeline.',
);
const independentPreview = calculateMediaAnimationPreviewLayout(
    independentAnimation,
    2,
    1,
    [],
    [],
    poleType,
    false,
    'top',
);
assert.equal(
    independentPreview.stats.deciderCombinatorCount,
    independentTimers.length
        + independentEntities.filter(entity => entity.player_description?.includes('base ROM')).length
        + independentEntities.filter(entity => entity.player_description?.includes('delta ROM')).length,
);

const emptyAudioGrid: GridData = { width: 2, height: 2, cells: new Uint32Array(4) };
const audioTrack: DecodedAudioTrack = {
    sourceName: 'stereo-test.wav',
    sourceChannels: 2,
    sampleRate: 8_000,
    notesPerSecond: 4,
    durationTicks: 120,
    durationSeconds: 2,
    leftNoteCount: 3,
    rightNoteCount: 2,
    events: [
        { tick: 0, leftPitch: 17, rightPitch: 20, leftMidi: 69, rightMidi: 72 },
        { tick: 30, leftPitch: 19, leftMidi: 71 },
        { tick: 60, leftPitch: 20, rightPitch: 24, leftMidi: 72, rightMidi: 76 },
    ],
};
const audioAnimation: GridAnimationData = {
    firstFrame: emptyAudioGrid,
    firstDurationTicks: audioTrack.durationTicks,
    transitions: [],
};
const audioProgress: number[] = [];
const audioInstruments = { left: 'bass', right: 'celesta' } as const;
const audioResult = generateMediaAnimationBlueprintData(audioAnimation, 2, 2, {
    poleType,
    qualityIdx,
    autoPole: false,
    smartPlacement: false,
    autoRoboport: false,
    autoConstruction: false,
    includeHelpDisplay: true,
    audioTrack,
    audioInstruments,
    onProgress: progress => audioProgress.push(progress),
});
assert.equal(audioResult.status, 'Success');
assert.ok(audioResult.bpString);
const audioBlueprint = decodeBlueprint(audioResult.bpString);
writeFileSync('node_modules/.cache/audio-speaker-blueprint.txt', audioResult.bpString);
const audioEntities = audioBlueprint.blueprint.entities;
const speakers = audioEntities.filter(entity => entity.name === 'programmable-speaker');
const noteRoms = audioEntities.filter(entity => entity.player_description?.startsWith('Generated stereo note event'));
assert.equal(speakers.length, 2);
assert.equal(noteRoms.length, audioTrack.events.length, 'One decider should store both channel pitches for each tick.');
assert.ok(speakers.every(speaker => speaker.parameters?.playback_mode === 'local'));
assert.deepEqual(
    new Set(speakers.map(speaker => (
        (speaker.control_behavior?.circuit_parameters as { instrument_id?: number })?.instrument_id
    ))),
    new Set([4, 8]),
);
assert.ok(audioProgress.length > 2);
assert.equal(Math.round(audioProgress.at(-1) ?? -1), 100);
assert.ok(audioProgress.every((progress, index) => index === 0 || progress >= audioProgress[index - 1]));
const audioTimer = audioEntities.find(entity => entity.player_description?.startsWith('Media cycle timer:'))!;
assert.equal(
    ((audioTimer.control_behavior?.decider_conditions as { conditions: { constant: number }[] }).conditions[0].constant),
    audioTrack.durationTicks,
);
const audioPreview = calculateMediaAnimationPreviewLayout(
    audioAnimation,
    2,
    2,
    [],
    [],
    poleType,
    true,
    'top',
    false,
    audioTrack,
    audioInstruments,
);
assert.equal(audioPreview.stats.programmableSpeakerCount, 2);
assert.equal(audioPreview.stats.deciderCombinatorCount, noteRoms.length + 1);

// Very large animations only render a bounded sample of their ROM footprints.
// The sample must cover the full controller instead of clustering in the first
// few columns, which made Bad Apple appear to have no combinators in the UI.
const samplingWidth = 20;
const samplingCells = Uint32Array.from({ length: samplingWidth }, () => 0xffffffff);
const samplingIndices = Uint32Array.from({ length: samplingWidth }, (_, index) => index);
const samplingAnimation: GridAnimationData = {
    firstFrame: { width: samplingWidth, height: 1, cells: samplingCells },
    firstDurationTicks: 2,
    transitions: Array.from({ length: 600 }, (_, transitionIndex) => ({
        indices: samplingIndices,
        colors: Uint32Array.from(
            { length: samplingWidth },
            () => transitionIndex % 2 === 0 ? 0 : 0xffffffff,
        ),
        durationTicks: 2,
    })),
};
const samplingPreview = calculateMediaAnimationPreviewLayout(
    samplingAnimation,
    samplingWidth,
    1,
    [],
    [],
    poleType,
    false,
    'top',
);
const sampledDeltaRoms = samplingPreview.entities.filter(entity => (
    entity.kind === 'decider-combinator'
    && entity.description.startsWith('Media frame ')
));
assert.ok(sampledDeltaRoms.length <= MAX_BLUEPRINT_PREVIEW_ENTITIES);
assert.ok(sampledDeltaRoms.some(entity => entity.description.endsWith('column 20')));
assert.ok(sampledDeltaRoms.some(entity => {
    const frame = Number(entity.description.match(/^Media frame (\d+)/)?.[1] ?? 0);
    return frame > 550;
}));

assert.deepEqual(evenlySpacedFrameIndices(10, 4), [0, 3, 6, 9]);
const selectedAnimation = selectAnimationFrames(animation, [0, 2]);
assert.equal(animationDurationTicks(selectedAnimation), animationDurationTicks(animation));
assert.equal(selectedAnimation.transitions.length + 1, 2);

console.log(JSON.stringify({
    frames: frames.length,
    dimensions: `${width}x${height}`,
    durations,
    sides: 4,
}));
