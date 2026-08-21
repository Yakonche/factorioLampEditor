import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import pako from 'pako';
import {
    calculateActivePoles,
    calculateActiveRoboports,
    calculateMediaAnimationPreviewLayout,
    generateMediaAnimationBlueprintData,
    type BlueprintEntity,
    type BlueprintJson,
} from '../src/utils/blueprint';
import {
    createAnimationUnionGrid,
    placeDecodedAnimation,
    type DecodedMediaAnimation,
} from '../src/utils/mediaAnimation';
import { POLE_DATA } from '../src/constants';

const require = createRequire(import.meta.url);
const { decodeMedia } = require(resolve('electron', 'media.cjs')) as {
    decodeMedia: (request: {
        sourceName: string;
        bytes: Buffer;
        fpsLimit: number;
    }) => Promise<DecodedMediaAnimation>;
};

const gridWidth = 1024;
const gridHeight = 1024;
const poleType = 'medium-electric-pole';
const qualityIdx = 0;
const morningPath = resolve(process.argv[2] ?? resolve('release', 'morning.gif'));
const sourceName = basename(morningPath);
const decoded = await decodeMedia({
    sourceName,
    bytes: readFileSync(morningPath),
    fpsLimit: 30,
});
const startX = Math.floor((gridWidth - decoded.width) / 2);
const startY = Math.floor((gridHeight - decoded.height) / 2);
const animation = placeDecodedAnimation(decoded, gridWidth, gridHeight, startX, startY);
const union = createAnimationUnionGrid(animation);
let minX = gridWidth;
let minY = gridHeight;
let maxX = -1;
let maxY = -1;
for (let index = 0; index < union.cells.length; index++) {
    if (!union.cells[index]) continue;
    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
}
assert.ok(maxX >= minX && maxY >= minY);

const poles = calculateActivePoles(
    poleType,
    qualityIdx,
    minX,
    minY,
    maxX,
    maxY,
    union,
    gridWidth,
    gridHeight,
);
const roboports = calculateActiveRoboports(
    poles,
    poleType,
    qualityIdx,
    union,
    gridWidth,
    gridHeight,
    true,
);
const replaced = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
const effectivePoles = poles.filter((_, index) => !replaced.has(index));
const preview = calculateMediaAnimationPreviewLayout(
    animation,
    gridWidth,
    gridHeight,
    effectivePoles,
    roboports,
    poleType,
    false,
    'left',
    true,
);
const result = generateMediaAnimationBlueprintData(animation, gridWidth, gridHeight, {
    poleType,
    qualityIdx,
    autoPole: true,
    smartPlacement: false,
    autoRoboport: true,
    autoConstruction: true,
    includeHelpDisplay: false,
    controllerSide: 'left',
    label: 'morning.gif validation',
    backgroundTile: (process.env.FACTORIO_BACKGROUND_TILE ?? '') as '' | 'stone-path' | 'concrete' | 'hazard-concrete-left' | 'refined-concrete' | 'refined-hazard-concrete-left',
});
assert.equal(result.status, 'Success');
assert.ok(result.bpString);
if (process.env.FACTORIO_BLUEPRINT_OUT) {
    writeFileSync(resolve(process.env.FACTORIO_BLUEPRINT_OUT), result.bpString, 'utf8');
}

const compressed = Uint8Array.from(Buffer.from(result.bpString.slice(1), 'base64'));
const blueprint = JSON.parse(new TextDecoder().decode(pako.inflate(compressed))) as BlueprintJson;
const entities = blueprint.blueprint.entities;
const byId = new Map(entities.map(entity => [entity.entity_number, entity]));
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
    entities.filter(entity => entity.name === 'substation' && entity.player_description?.startsWith('Media animation power')).length,
    preview.stats.controllerPoleCount,
);
assert.equal(
    entities.filter(entity => entity.player_description === 'Media controller auto-construction roboport.').length,
    preview.stats.controllerRoboportCount,
);
assert.ok(
    entities
        .filter(entity => entity.name === 'decider-combinator' || entity.name === 'arithmetic-combinator')
        .every(entity => entity.direction === 4),
    'Every left-side media combinator must face east toward the image.',
);

const controllerEntities = entities.filter(entity => (
    entity.name === 'decider-combinator'
    || entity.name === 'arithmetic-combinator'
    || (entity.name === 'substation' && entity.player_description?.startsWith('Media animation power'))
    || entity.player_description === 'Media controller auto-construction roboport.'
));
const occupiedControllerTiles = new Map<string, number>();
for (const entity of controllerEntities) {
    const vertical = entity.direction === 0 || entity.direction === 8;
    const width = entity.name === 'substation'
        ? 2
        : entity.name === 'roboport'
            ? 4
            : vertical ? 1 : 2;
    const height = entity.name === 'substation'
        ? 2
        : entity.name === 'roboport'
            ? 4
            : vertical ? 2 : 1;
    const left = entity.position.x - width / 2;
    const top = entity.position.y - height / 2;
    for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
            const key = `${x},${y}`;
            assert.equal(
                occupiedControllerTiles.get(key),
                undefined,
                `Controller entities ${occupiedControllerTiles.get(key)} and ${entity.entity_number} overlap at ${key}.`,
            );
            occupiedControllerTiles.set(key, entity.entity_number);
        }
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
    'morning.gif generated unpowered entities.',
);

const circuitReach = (entity: BlueprintEntity) => entity.name in POLE_DATA
    ? POLE_DATA[entity.name].wire[qualityIdx]
    : 9;
for (const [firstId, , secondId] of blueprint.blueprint.wires ?? []) {
    const first = byId.get(firstId)!;
    const second = byId.get(secondId)!;
    const dx = first.position.x - second.position.x;
    const dy = first.position.y - second.position.y;
    const reach = Math.min(circuitReach(first), circuitReach(second));
    assert.ok(dx * dx + dy * dy <= reach * reach, `Circuit wire ${firstId}-${secondId} exceeds ${reach} tiles.`);
}

const poleIds = new Set(powerPoles.map(entity => entity.entity_number));
const visitedPoles = new Set<number>();
const queue = powerPoles.length ? [powerPoles[0].entity_number] : [];
while (queue.length) {
    const id = queue.pop()!;
    if (visitedPoles.has(id)) continue;
    visitedPoles.add(id);
    for (const neighbour of byId.get(id)?.neighbours ?? []) {
        if (poleIds.has(neighbour) && !visitedPoles.has(neighbour)) queue.push(neighbour);
    }
}
assert.equal(visitedPoles.size, powerPoles.length, 'All morning.gif electric supports must share one copper network.');

const allRoboports = entities.filter(entity => entity.name === 'roboport');
const visitedRoboports = new Set<number>();
const roboportQueue = allRoboports.length ? [allRoboports[0].entity_number] : [];
while (roboportQueue.length) {
    const id = roboportQueue.pop()!;
    if (visitedRoboports.has(id)) continue;
    visitedRoboports.add(id);
    const current = byId.get(id)!;
    for (const candidate of allRoboports) {
        if (visitedRoboports.has(candidate.entity_number)) continue;
        const dx = current.position.x - candidate.position.x;
        const dy = current.position.y - candidate.position.y;
        if (dx * dx + dy * dy <= 50 * 50) roboportQueue.push(candidate.entity_number);
    }
}
assert.equal(
    visitedRoboports.size,
    allRoboports.length,
    'Image and controller roboports must form one connected logistic network.',
);
const outsideConstructionArea = entities.filter(entity => !allRoboports.some(roboport => (
    Math.abs(entity.position.x - roboport.position.x) < 55
    && Math.abs(entity.position.y - roboport.position.y) < 55
)));
assert.deepEqual(
    outsideConstructionArea.map(entity => ({ name: entity.name, position: entity.position, description: entity.player_description })),
    [],
    'Every generated entity must be covered by the connected construction network.',
);

const timer = entities.find(entity => entity.player_description?.startsWith('Media cycle timer:'))!;
const timerCondition = timer.control_behavior?.decider_conditions as {
    conditions: { constant: number }[];
};
assert.equal(timerCondition.conditions[0].constant, decoded.durationTicks);
const eventThresholds = new Set(entities
    .filter(entity => entity.player_description?.startsWith('Generated media frame'))
    .map(entity => Number(entity.player_description?.match(/T = (\d+)\.$/)?.[1])));
assert.equal(eventThresholds.size, decoded.frameCount);
assert.ok(eventThresholds.has(0));

console.log(JSON.stringify({
    source: morningPath,
    dimensions: `${decoded.width}x${decoded.height}`,
    sampledFrames: decoded.sampledFrameCount,
    uniqueFrames: decoded.frameCount,
    factorioFps: decoded.factorioFps,
    durationTicks: decoded.durationTicks,
    blueprintCharacters: result.bpString.length,
    entities: entities.length,
    wires: blueprint.blueprint.wires?.length ?? 0,
    stats: preview.stats,
}));
