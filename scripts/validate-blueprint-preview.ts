import assert from 'node:assert/strict';
import pako from 'pako';
import {
    calculateActivePoles,
    calculateActiveRoboports,
    calculateAnimationPreviewLayout,
    createUnionGrid,
    generateAnimatedBlueprintData,
    type BlueprintEntity,
    type BlueprintJson,
} from '../src/utils/blueprint';
import type { GridData } from '../src/utils/grid';
import { POLE_DATA } from '../src/constants';

type RomOutput = {
    signal: { type: string; name: string };
    constant?: number;
};

const packedRgb = (packedColor: number) => {
    const red = packedColor & 0xff;
    const green = (packedColor >>> 8) & 0xff;
    const blue = (packedColor >>> 16) & 0xff;
    return (red << 16) | (green << 8) | blue || 1;
};

const width = 96;
const height = 80;
const first: GridData = { width, height, cells: new Uint32Array(width * height) };
const second: GridData = { width, height, cells: new Uint32Array(width * height) };

for (let y = 12; y < 68; y++) {
    // A static left edge fixes the crop origin, while sparse changing pixels
    // on the right force the generator to insert circuit relay lamps.
    first.cells[y * width + 14] = 0xffcc00ff;
    second.cells[y * width + 14] = 0xffcc00ff;
    first.cells[y * width + 85] = 0xffcc00ff;
    second.cells[y * width + 85] = 0x22aaffff;
}

const union = createUnionGrid(first, second, width, height);
const minX = 14;
const minY = 12;
const maxX = 85;
const maxY = 67;
const poleType = 'medium-electric-pole';
const qualityIdx = 0;
const poles = calculateActivePoles(poleType, qualityIdx, minX, minY, maxX, maxY, union, width, height);
const roboports = calculateActiveRoboports(poles, poleType, qualityIdx, union, width, height, true);
const replacedPoleIndices = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
const effectivePoles = poles.filter((_, index) => !replacedPoleIndices.has(index));
const preview = calculateAnimationPreviewLayout(
    first,
    second,
    width,
    height,
    effectivePoles,
    roboports,
    poleType,
    true,
);

const result = generateAnimatedBlueprintData(first, second, width, height, {
    poleType,
    qualityIdx,
    autoPole: true,
    smartPlacement: false,
    autoRoboport: true,
    autoConstruction: true,
    delayTicks: 900,
    includeHelpDisplay: true,
});
assert.equal(result.status, 'Success');
assert.ok(result.bpString);

const compressed = Uint8Array.from(Buffer.from(result.bpString.slice(1), 'base64'));
const blueprint = JSON.parse(new TextDecoder().decode(pako.inflate(compressed))) as BlueprintJson;
const entities = blueprint.blueprint.entities;

assert.equal(entities.filter(entity => entity.name === 'decider-combinator').length, preview.stats.deciderCombinatorCount);
assert.equal(entities.filter(entity => entity.name === 'constant-combinator').length, preview.stats.constantCombinatorCount);
assert.equal(entities.filter(entity => entity.name === 'display-panel').length, preview.stats.displayPanelCount);
assert.equal(
    entities.filter(entity => entity.name === 'substation' && entity.player_description?.startsWith('Animation controller')).length,
    preview.stats.controllerPoleCount,
);
assert.equal(
    entities.filter(entity => entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive animation')).length,
    preview.stats.relayPoleCount,
);
assert.ok(preview.stats.relayPoleCount > 0, 'Sparse animated rows should exercise generated relay poles.');

const normalize = (value: number) => Number(value.toFixed(4));
const actualPreviewKey = (entity: BlueprintEntity) => {
    let x: number;
    let y: number;
    let entityWidth: number;
    let entityHeight: number;
    if (entity.name === 'decider-combinator') {
        const vertical = entity.direction === 0 || entity.direction === 8;
        x = minX + entity.position.x - (vertical ? 0.5 : 1);
        y = minY + entity.position.y - (vertical ? 1 : 0.5);
        entityWidth = vertical ? 1 : 2;
        entityHeight = vertical ? 2 : 1;
    } else if (entity.name === 'substation') {
        x = minX + entity.position.x - 1;
        y = minY + entity.position.y - 1;
        entityWidth = 2;
        entityHeight = 2;
    } else {
        x = minX + entity.position.x - 0.5;
        y = minY + entity.position.y - 0.5;
        entityWidth = 1;
        entityHeight = 1;
    }
    return `${entity.name}:${normalize(x)},${normalize(y)},${entityWidth},${entityHeight}`;
};

const actualInfrastructure = entities
    .filter(entity => (
        entity.name === 'decider-combinator'
        || entity.name === 'constant-combinator'
        || entity.name === 'display-panel'
        || (entity.name === 'substation' && entity.player_description?.startsWith('Animation controller'))
        || (entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive animation'))
    ))
    .map(actualPreviewKey)
    .sort();
const previewInfrastructure = preview.entities
    .map(entity => {
        const name = entity.kind === 'controller-substation'
            ? 'substation'
            : entity.kind === 'relay-pole'
                ? 'medium-electric-pole'
                : entity.kind;
        return `${name}:${normalize(entity.x)},${normalize(entity.y)},${entity.width},${entity.height}`;
    })
    .sort();
assert.deepEqual(previewInfrastructure, actualInfrastructure, 'Preview footprints must match exported entities exactly.');

const supportRects = [
    ...effectivePoles.map(pole => ({ x: pole.x, y: pole.y, size: 1 })),
    ...roboports.map(roboport => ({ x: roboport.x, y: roboport.y, size: 4 })),
    ...entities
        .filter(entity => entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive animation'))
        .map(entity => ({ x: minX + entity.position.x - 0.5, y: minY + entity.position.y - 0.5, size: 1 })),
];
const artLamps = entities.filter(entity => entity.name === 'small-lamp' && !entity.player_description);
const staticArtLamps = entities.filter(entity => (
    entity.name === 'small-lamp'
    && entity.player_description?.startsWith('Static animation pixel:')
));
for (const lamp of artLamps) {
    const x = minX + lamp.position.x - 0.5;
    const y = minY + lamp.position.y - 0.5;
    assert.ok(!supportRects.some(rect => (
        x >= rect.x && x < rect.x + rect.size && y >= rect.y && y < rect.y + rect.size
    )), `Lamp at ${x},${y} overlaps a pole or roboport.`);
    assert.equal(lamp.always_on, undefined, `Animated lamp at ${x},${y} must not use Always ON.`);
    assert.equal(lamp.control_behavior?.circuit_enabled, true, `Animated lamp at ${x},${y} must be circuit-controlled.`);
    assert.equal(lamp.control_behavior?.use_colors, true, `Animated lamp at ${x},${y} must use circuit RGB.`);
    assert.equal(lamp.control_behavior?.color_mode, 2, `Animated lamp at ${x},${y} must use packed RGB mode.`);
}

const expectedDynamicLampCount = Array.from(union.cells).reduce((count, cell, index) => {
    if (!cell) return count;
    const x = index % width;
    const y = Math.floor(index / width);
    if (first.cells[index] === second.cells[index]) return count;
    return count + (supportRects.some(rect => (
        x >= rect.x && x < rect.x + rect.size && y >= rect.y && y < rect.y + rect.size
    )) ? 0 : 1);
}, 0);
const expectedStaticLampCount = Array.from(union.cells).reduce((count, cell, index) => {
    if (!cell || first.cells[index] !== second.cells[index]) return count;
    const x = index % width;
    const y = Math.floor(index / width);
    return count + (supportRects.some(rect => (
        x >= rect.x && x < rect.x + rect.size && y >= rect.y && y < rect.y + rect.size
    )) ? 0 : 1);
}, 0);
assert.equal(artLamps.length, expectedDynamicLampCount, 'Every changing unobstructed pixel must have one circuit-driven lamp.');
assert.equal(staticArtLamps.length, expectedStaticLampCount, 'Every constant unobstructed pixel must have one static lamp.');
assert.ok(staticArtLamps.every(lamp => lamp.always_on === true && !lamp.control_behavior));

const calculatedPower = (
    entities.filter(entity => entity.name === 'small-lamp').length * 5_000
    + entities.filter(entity => entity.name === 'decider-combinator').length * 1_000
    + entities.filter(entity => entity.name === 'roboport').length * 50_000
);
assert.ok(calculatedPower > 0);

const powerPoles = entities.filter(entity => entity.name in POLE_DATA);
const unpowered = entities.filter(entity => (
    entity.name === 'small-lamp'
    || entity.name === 'decider-combinator'
    || entity.name === 'constant-combinator'
)).filter(entity => !powerPoles.some(pole => {
    const data = POLE_DATA[pole.name];
    const halfSupply = data.supply[qualityIdx] / 2;
    return Math.abs(entity.position.x - pole.position.x) < halfSupply
        && Math.abs(entity.position.y - pole.position.y) < halfSupply;
}));
assert.deepEqual(
    unpowered.map(entity => ({ name: entity.name, position: entity.position, description: entity.player_description })),
    [],
    'Every lamp and active combinator must be inside an electric-pole supply area.',
);

const entitiesById = new Map(entities.map(entity => [entity.entity_number, entity]));
const relayPoleIds = new Set(entities
    .filter(entity => entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive animation'))
    .map(entity => entity.entity_number));
const circuitReach = (entity: BlueprintEntity) => entity.name in POLE_DATA
    ? POLE_DATA[entity.name].wire[qualityIdx]
    : 9;
for (const [firstId, , secondId] of blueprint.blueprint.wires ?? []) {
    const firstEntity = entitiesById.get(firstId)!;
    const secondEntity = entitiesById.get(secondId)!;
    const dx = firstEntity.position.x - secondEntity.position.x;
    const dy = firstEntity.position.y - secondEntity.position.y;
    const maximumDistance = Math.min(circuitReach(firstEntity), circuitReach(secondEntity));
    assert.ok(
        dx * dx + dy * dy <= maximumDistance * maximumDistance,
        `Circuit wire ${firstId}-${secondId} exceeds ${maximumDistance} tiles.`,
    );
}
for (const [firstId, firstConnector, secondId, secondConnector] of blueprint.blueprint.wires ?? []) {
    if (relayPoleIds.has(firstId)) assert.equal(firstConnector, 2, 'Animation relay poles must stay on the green circuit bus.');
    if (relayPoleIds.has(secondId)) assert.equal(secondConnector, 2, 'Animation relay poles must stay on the green circuit bus.');
}

const powerPoleIds = new Set(powerPoles.map(entity => entity.entity_number));
const visitedPowerPoles = new Set<number>();
const powerQueue = powerPoles.length ? [powerPoles[0].entity_number] : [];
while (powerQueue.length) {
    const entityId = powerQueue.pop()!;
    if (visitedPowerPoles.has(entityId)) continue;
    visitedPowerPoles.add(entityId);
    const entity = entitiesById.get(entityId)!;
    for (const neighbourId of entity.neighbours ?? []) {
        if (powerPoleIds.has(neighbourId) && !visitedPowerPoles.has(neighbourId)) powerQueue.push(neighbourId);
    }
}
assert.equal(visitedPowerPoles.size, powerPoles.length, 'All generated electric poles must share one copper network.');

// A maximum-size import can touch every canvas edge. Exercise the same edge
// geometry on a compact grid and ensure external support poles cover it.
const edgeSize = 16;
const edgeFirst: GridData = { width: edgeSize, height: edgeSize, cells: new Uint32Array(edgeSize * edgeSize).fill(0xffcc00ff) };
const edgeSecond: GridData = { width: edgeSize, height: edgeSize, cells: new Uint32Array(edgeSize * edgeSize).fill(0x22aaffff) };
const edgeResult = generateAnimatedBlueprintData(edgeFirst, edgeSecond, edgeSize, edgeSize, {
    poleType,
    qualityIdx,
    autoPole: true,
    smartPlacement: false,
    autoRoboport: false,
    autoConstruction: false,
    delayTicks: 60,
    includeHelpDisplay: false,
});
assert.ok(edgeResult.bpString);
const edgeCompressed = Uint8Array.from(Buffer.from(edgeResult.bpString.slice(1), 'base64'));
const edgeBlueprint = JSON.parse(new TextDecoder().decode(pako.inflate(edgeCompressed))) as BlueprintJson;
const edgeEntities = edgeBlueprint.blueprint.entities;
const edgePoles = edgeEntities.filter(entity => entity.name in POLE_DATA);
const edgeUnpowered = edgeEntities.filter(entity => (
    entity.name === 'small-lamp'
    || entity.name === 'decider-combinator'
    || entity.name === 'constant-combinator'
)).filter(entity => !edgePoles.some(pole => {
    const halfSupply = POLE_DATA[pole.name].supply[qualityIdx] / 2;
    return Math.abs(entity.position.x - pole.position.x) < halfSupply
        && Math.abs(entity.position.y - pole.position.y) < halfSupply;
}));
assert.equal(edgeUnpowered.length, 0, 'Canvas-edge lamps and combinators must remain powered.');

const assertCircuitContinuity = (sideEntities: BlueprintEntity[], sideWires: BlueprintJson['blueprint']['wires']) => {
    const sideEntitiesById = new Map(sideEntities.map(entity => [entity.entity_number, entity]));
    const greenAdjacency = new Map<number, number[]>();
    const redAdjacency = new Map<number, number[]>();
    const addConnection = (adjacency: Map<number, number[]>, firstId: number, secondId: number) => {
        const first = adjacency.get(firstId) ?? [];
        const second = adjacency.get(secondId) ?? [];
        first.push(secondId);
        second.push(firstId);
        adjacency.set(firstId, first);
        adjacency.set(secondId, second);
    };
    for (const [firstId, firstConnector, secondId, secondConnector] of sideWires ?? []) {
        if ((firstConnector === 2 || firstConnector === 4) && (secondConnector === 2 || secondConnector === 4)) {
            addConnection(greenAdjacency, firstId, secondId);
        }
        if ((firstConnector === 1 || firstConnector === 3) && (secondConnector === 1 || secondConnector === 3)) {
            addConnection(redAdjacency, firstId, secondId);
        }
    }
    const componentContains = (startId: number, adjacency: Map<number, number[]>, predicate: (entity: BlueprintEntity) => boolean) => {
        const queue = [startId];
        const visited = new Set<number>();
        while (queue.length) {
            const id = queue.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const entity = sideEntitiesById.get(id)!;
            if (predicate(entity)) return true;
            for (const neighbour of adjacency.get(id) ?? []) {
                if (!visited.has(neighbour)) queue.push(neighbour);
            }
        }
        return false;
    };

    const animatedLamps = sideEntities.filter(entity => (
        entity.name === 'small-lamp' && entity.control_behavior?.circuit_enabled === true
    ));
    for (const lamp of animatedLamps) {
        assert.ok(componentContains(
            lamp.entity_number,
            greenAdjacency,
            entity => entity.player_description?.startsWith('Generated image') === true,
        ), `Animated lamp ${lamp.entity_number} has no green path to an image ROM.`);
    }
    const imageRoms = sideEntities.filter(entity => entity.player_description?.startsWith('Generated image'));
    for (const rom of imageRoms) {
        assert.ok(componentContains(
            rom.entity_number,
            redAdjacency,
            entity => entity.player_description?.startsWith('EDIT DELAY: set T >') === true,
        ), `Image ROM ${rom.entity_number} has no red path to the frame selector.`);
    }
};

const assertFrameFidelity = (
    sideEntities: BlueprintEntity[],
    controllerSide: 'left' | 'top' | 'right' | 'bottom',
) => {
    const verticalLines = controllerSide === 'top' || controllerSide === 'bottom';
    const roms = new Map<string, Map<string, number>>();
    for (const entity of sideEntities) {
        const match = entity.player_description?.match(/^Generated image ([12]) ROM, (?:row|column) (\d+)\.$/);
        if (!match) continue;
        const outputs = ((entity.control_behavior?.decider_conditions as { outputs?: RomOutput[] } | undefined)?.outputs ?? []);
        roms.set(`${match[1]}:${Number(match[2]) - 1}`, new Map(outputs.map(output => [
            `${output.signal.type}:${output.signal.name}`,
            output.constant ?? 0,
        ])));
    }

    const lamps = sideEntities.filter(entity => entity.name === 'small-lamp' && !entity.player_description);
    for (const lamp of lamps) {
        assert.equal(lamp.always_on, undefined, `Animated lamp ${lamp.entity_number} unexpectedly uses Always ON.`);
        assert.equal(lamp.control_behavior?.circuit_enabled, true, `Animated lamp ${lamp.entity_number} is not circuit-controlled.`);
        assert.equal(lamp.control_behavior?.color_mode, 2, `Animated lamp ${lamp.entity_number} is not in packed RGB mode.`);
        const signal = lamp.control_behavior?.rgb_signal as { type: string; name: string } | undefined;
        assert.ok(signal, `Animated lamp ${lamp.entity_number} has no RGB signal.`);

        const localX = lamp.position.x - 0.5;
        const localY = lamp.position.y - 0.5;
        const sourceX = minX + localX;
        const sourceY = minY + localY;
        const sourceIndex = sourceY * width + sourceX;
        const localLine = verticalLines ? localX : localY;
        const signalKey = `${signal.type}:${signal.name}`;
        const firstActual = roms.get(`1:${localLine}`)?.get(signalKey) ?? 0;
        const secondActual = roms.get(`2:${localLine}`)?.get(signalKey) ?? 0;
        const firstExpected = first.cells[sourceIndex] ? packedRgb(first.cells[sourceIndex]) : 0;
        const secondExpected = second.cells[sourceIndex] ? packedRgb(second.cells[sourceIndex]) : 0;
        assert.equal(firstActual, firstExpected, `Image 1 ROM mismatch at ${sourceX},${sourceY}.`);
        assert.equal(secondActual, secondExpected, `Image 2 ROM mismatch at ${sourceX},${sourceY}.`);
    }
};

for (const controllerSide of ['left', 'top', 'right', 'bottom'] as const) {
    const sidePreview = calculateAnimationPreviewLayout(
        first,
        second,
        width,
        height,
        effectivePoles,
        roboports,
        poleType,
        true,
        controllerSide,
    );
    const sideResult = generateAnimatedBlueprintData(first, second, width, height, {
        poleType,
        qualityIdx,
        autoPole: true,
        smartPlacement: false,
        autoRoboport: true,
        autoConstruction: true,
        delayTicks: 900,
        includeHelpDisplay: true,
        controllerSide,
    });
    assert.ok(sideResult.bpString);
    const sideCompressed = Uint8Array.from(Buffer.from(sideResult.bpString.slice(1), 'base64'));
    const sideBlueprint = JSON.parse(new TextDecoder().decode(pako.inflate(sideCompressed))) as BlueprintJson;
    const sideEntities = sideBlueprint.blueprint.entities;
    const expectedDirection = { left: 4, top: 8, right: 12, bottom: 0 }[controllerSide];
    const sideDeciders = sideEntities.filter(entity => entity.name === 'decider-combinator');
    assert.ok(
        sideDeciders.every(entity => entity.direction === expectedDirection),
        `${controllerSide} deciders must face the image using Factorio 2.x direction ${expectedDirection}.`,
    );
    const deciderRects = sideDeciders.map(entity => {
        const vertical = entity.direction === 0 || entity.direction === 8;
        const footprintWidth = vertical ? 1 : 2;
        const footprintHeight = vertical ? 2 : 1;
        return {
            id: entity.entity_number,
            x: entity.position.x - footprintWidth / 2,
            y: entity.position.y - footprintHeight / 2,
            width: footprintWidth,
            height: footprintHeight,
        };
    });
    for (let firstIndex = 0; firstIndex < deciderRects.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < deciderRects.length; secondIndex++) {
            const firstRect = deciderRects[firstIndex];
            const secondRect = deciderRects[secondIndex];
            assert.ok(
                firstRect.x + firstRect.width <= secondRect.x
                || secondRect.x + secondRect.width <= firstRect.x
                || firstRect.y + firstRect.height <= secondRect.y
                || secondRect.y + secondRect.height <= firstRect.y,
                `${controllerSide} deciders ${firstRect.id} and ${secondRect.id} overlap in Factorio.`,
            );
        }
    }
    const sideInfrastructure = sideEntities.filter(entity => (
        entity.name === 'decider-combinator'
        || entity.name === 'constant-combinator'
        || entity.name === 'display-panel'
        || (entity.name === 'substation' && entity.player_description?.startsWith('Animation controller'))
        || (entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive animation'))
    )).map(actualPreviewKey).sort();
    const sidePreviewInfrastructure = sidePreview.entities.map(entity => {
        const name = entity.kind === 'controller-substation'
            ? 'substation'
            : entity.kind === 'relay-pole'
                ? 'medium-electric-pole'
                : entity.kind;
        return `${name}:${normalize(entity.x)},${normalize(entity.y)},${entity.width},${entity.height}`;
    }).sort();
    assert.deepEqual(
        sidePreviewInfrastructure,
        sideInfrastructure,
        `${controllerSide} preview footprints must match the exported controller.`,
    );

    const controllerSpine = sideEntities.filter(entity => (
        entity.name === 'substation' && entity.player_description?.startsWith('Animation controller')
    ));
    const imageWidth = maxX - minX + 1;
    const imageHeight = maxY - minY + 1;
    if (controllerSide === 'left') assert.ok(controllerSpine.every(entity => entity.position.x < 0));
    if (controllerSide === 'right') assert.ok(controllerSpine.every(entity => entity.position.x > imageWidth));
    if (controllerSide === 'top') assert.ok(controllerSpine.every(entity => entity.position.y < 0));
    if (controllerSide === 'bottom') assert.ok(controllerSpine.every(entity => entity.position.y > imageHeight));

    const sideRelayIds = new Set(sideEntities
        .filter(entity => entity.name === 'medium-electric-pole' && entity.player_description?.startsWith('Generated passive animation'))
        .map(entity => entity.entity_number));
    for (const [firstId, firstConnector, secondId, secondConnector] of sideBlueprint.blueprint.wires ?? []) {
        if (sideRelayIds.has(firstId)) assert.equal(firstConnector, 2);
        if (sideRelayIds.has(secondId)) assert.equal(secondConnector, 2);
    }
    const sideById = new Map(sideEntities.map(entity => [entity.entity_number, entity]));
    const sidePowerPoles = sideEntities.filter(entity => entity.name in POLE_DATA);
    const sideUnpowered = sideEntities.filter(entity => (
        entity.name === 'small-lamp'
        || entity.name === 'decider-combinator'
        || entity.name === 'constant-combinator'
    )).filter(entity => !sidePowerPoles.some(pole => {
        const halfSupply = POLE_DATA[pole.name].supply[qualityIdx] / 2;
        return Math.abs(entity.position.x - pole.position.x) < halfSupply
            && Math.abs(entity.position.y - pole.position.y) < halfSupply;
    }));
    assert.deepEqual(
        sideUnpowered.map(entity => ({ name: entity.name, position: entity.position, description: entity.player_description })),
        [],
        `${controllerSide} layout contains unpowered entities.`,
    );
    for (const [firstId, , secondId] of sideBlueprint.blueprint.wires ?? []) {
        const firstEntity = sideById.get(firstId)!;
        const secondEntity = sideById.get(secondId)!;
        const dx = firstEntity.position.x - secondEntity.position.x;
        const dy = firstEntity.position.y - secondEntity.position.y;
        const maximumDistance = Math.min(circuitReach(firstEntity), circuitReach(secondEntity));
        assert.ok(
            dx * dx + dy * dy <= maximumDistance * maximumDistance,
            `${controllerSide} circuit wire ${firstId}-${secondId} exceeds ${maximumDistance} tiles.`,
        );
    }
    const sidePoleIds = new Set(sidePowerPoles.map(entity => entity.entity_number));
    const sideVisitedPoles = new Set<number>();
    const sidePoleQueue = sidePowerPoles.length ? [sidePowerPoles[0].entity_number] : [];
    while (sidePoleQueue.length) {
        const id = sidePoleQueue.pop()!;
        if (sideVisitedPoles.has(id)) continue;
        sideVisitedPoles.add(id);
        for (const neighbour of sideById.get(id)?.neighbours ?? []) {
            if (sidePoleIds.has(neighbour) && !sideVisitedPoles.has(neighbour)) sidePoleQueue.push(neighbour);
        }
    }
    assert.equal(sideVisitedPoles.size, sidePowerPoles.length, `${controllerSide} electric poles are disconnected.`);
    assertCircuitContinuity(sideEntities, sideBlueprint.blueprint.wires);
    assertFrameFidelity(sideEntities, controllerSide);
}

console.log(JSON.stringify({
    entities: entities.length,
    previewEntities: preview.entities.length,
    roboports: roboports.length,
    stats: preview.stats,
    calculatedPowerWatts: calculatedPower,
}));
