import pako from "pako";
import { uint32ToRgb, type GridData } from "./grid";
import {
    IMAGE_SIGNAL,
    PIXEL_SIGNALS,
    TIMER_SIGNAL,
    type FactorioSignalID,
} from './factorioSignals';
import {
    POLE_DATA,
    QUALITY_NAMES,
    AUTO_CONSTRUCTION_POLE_RADIUS,
    ROBOPORT_CONSTRUCTION_RADIUS,
    ROBOPORT_LOGISTICS_RADIUS,
    ROBOPORT_SIZE,
    type BackgroundTileName,
} from "../constants";
import {
    animationDurationTicks,
    createAnimationConstantGrid,
    createAnimationUnionGrid,
    type GridAnimationData,
    type MediaFrameTransition,
} from './mediaAnimation';
import {
    AUDIO_INSTRUMENTS,
    type AudioInstrumentName,
    type AudioInstrumentSelections,
    type AudioInstrumentSelection,
    type AudioNoteEvent,
    type DecodedAudioTrack,
} from './audio';

/** Maximum sampled controller/audio footprints drawn in the editor preview. */
export const MAX_BLUEPRINT_PREVIEW_ENTITIES = 100_000;

export interface BlueprintEntity {
    entity_number: number;
    name: string;
    position: { x: number; y: number };
    color?: { r: number; g: number; b: number; a: number };
    always_on?: boolean;
    quality?: string;
    neighbours?: number[];
    direction?: number;
    control_behavior?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    player_description?: string;
    text?: string;
    icon?: FactorioSignalID;
}

export type BlueprintWire = [number, number, number, number];

export interface BlueprintJson {
    blueprint: {
        item: string;
        label: string;
        entities: BlueprintEntity[];
        tiles?: { name: string; position: { x: number; y: number } }[];
        wires?: BlueprintWire[];
        icons: { signal: { type: string; name: string }; index: number }[];
        version: number;
    };
}

const blueprintBytesToBase64 = (
    bytes: Uint8Array,
    onProgress?: (fraction: number) => void,
) => {
    // The chunk size is divisible by three, so concatenated btoa output never
    // introduces padding in the middle of the final Base64 payload.
    const chunkSize = 24_576;
    let encoded = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
        let binary = '';
        for (let index = 0; index < chunk.length; index++) {
            binary += String.fromCharCode(chunk[index]);
        }
        encoded += btoa(binary);
        if (offset % (chunkSize * 64) === 0) {
            onProgress?.(bytes.length ? Math.min(1, (offset + chunk.length) / bytes.length) : 1);
        }
    }
    onProgress?.(1);
    return encoded;
};

/**
 * Streams the very large entities/wires arrays into pako. A full-resolution
 * Bad Apple blueprint exceeds V8's maximum single-string length before it is
 * compressed, so JSON.stringify(blueprintJson) cannot be used for that case.
 */
const deflateBlueprintJson = (
    blueprintJson: BlueprintJson,
    onProgress?: (fraction: number) => void,
) => {
    const encoder = new TextEncoder();
    const deflator = new pako.Deflate({ level: 9 });
    const flushThreshold = 1_048_576;
    let pending = '';
    const flush = (final: boolean) => {
        if (pending.length || final) {
            deflator.push(encoder.encode(pending), final);
            pending = '';
            if (deflator.err) throw new Error(deflator.msg || `Blueprint compression failed (${deflator.err}).`);
        }
    };
    const write = (value: string) => {
        pending += value;
        if (pending.length >= flushThreshold) flush(false);
    };
    const blueprint = blueprintJson.blueprint;
    const totalValues = (
        blueprint.entities.length
        + (blueprint.tiles?.length ?? 0)
        + (blueprint.wires?.length ?? 0)
        + blueprint.icons.length
    );
    let writtenValues = 0;
    const reportWrittenValue = () => {
        writtenValues++;
        if (writtenValues % 2_048 === 0 || writtenValues === totalValues) {
            onProgress?.(totalValues ? writtenValues / totalValues : 1);
        }
    };
    const writeArray = (values: unknown[]) => {
        write('[');
        values.forEach((value, index) => {
            if (index) write(',');
            write(JSON.stringify(value));
            reportWrittenValue();
        });
        write(']');
    };

    onProgress?.(0);
    write('{"blueprint":{');
    write(`"item":${JSON.stringify(blueprint.item)}`);
    write(`,"label":${JSON.stringify(blueprint.label)}`);
    write(',"entities":');
    writeArray(blueprint.entities);
    if (blueprint.tiles) {
        write(',"tiles":');
        writeArray(blueprint.tiles);
    }
    if (blueprint.wires) {
        write(',"wires":');
        writeArray(blueprint.wires);
    }
    write(',"icons":');
    writeArray(blueprint.icons);
    write(`,"version":${blueprint.version}}}`);
    flush(true);
    if (!(deflator.result instanceof Uint8Array)) {
        throw new Error('Blueprint compression returned an unexpected result.');
    }
    onProgress?.(1);
    return deflator.result;
};

export function encodeBlueprint(
    blueprintJson: BlueprintJson,
    onProgress?: (fraction: number) => void,
): string | null {
    try {
        const compressed = deflateBlueprintJson(
            blueprintJson,
            fraction => onProgress?.(fraction * 0.95),
        );
        return `0${blueprintBytesToBase64(
            compressed,
            fraction => onProgress?.(0.95 + fraction * 0.05),
        )}`;
    } catch (e) {
        console.error(e);
        return null;
    }
}

export interface ActivePole {
    x: number;
    y: number;
    id: number; // temp index
    group: number;
    neighbours?: number[]; // indices in activePoles array
    entity_number?: number;
}

export interface ActiveRoboport {
    x: number;
    y: number;
    poweredBy: number;
    replacedPoleIndices: number[];
}

export type BlueprintPreviewKind =
    | 'decider-combinator'
    | 'arithmetic-combinator'
    | 'constant-combinator'
    | 'display-panel'
    | 'controller-substation'
    | 'controller-roboport'
    | 'relay-pole'
    | 'programmable-speaker';

export interface BlueprintPreviewEntity {
    kind: BlueprintPreviewKind;
    name: string;
    description: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AnimationEntityStats {
    deciderCombinatorCount: number;
    arithmeticCombinatorCount: number;
    constantCombinatorCount: number;
    displayPanelCount: number;
    controllerPoleCount: number;
    controllerRoboportCount: number;
    relayPoleCount: number;
    programmableSpeakerCount: number;
}

export interface BlueprintPreviewBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface AnimationPreviewLayout {
    entities: BlueprintPreviewEntity[];
    stats: AnimationEntityStats;
    bounds: BlueprintPreviewBounds | null;
}

/** Connects arbitrary pole islands with a deterministic snake path. */
function addPoleConnectivityBridges(poles: ActivePole[], reach: number): ActivePole[] {
    if (poles.length < 2) return poles;
    const rows = new Map<number, ActivePole[]>();
    for (const pole of poles) {
        const row = rows.get(pole.y) ?? [];
        row.push(pole);
        rows.set(pole.y, row);
    }
    const ordered: ActivePole[] = [];
    [...rows.entries()]
        .sort(([firstY], [secondY]) => firstY - secondY)
        .forEach(([, row], rowIndex) => {
            row.sort((first, second) => rowIndex % 2 === 0 ? first.x - second.x : second.x - first.x);
            ordered.push(...row);
        });

    const positions = new Set(poles.map(pole => `${pole.x},${pole.y}`));
    const addBridgePole = (x: number, y: number) => {
        const key = `${x},${y}`;
        if (positions.has(key)) return;
        positions.add(key);
        poles.push({ x, y, id: poles.length, group: 0 });
    };
    for (let index = 1; index < ordered.length; index++) {
        let x = ordered[index - 1].x;
        let y = ordered[index - 1].y;
        const target = ordered[index];
        while (Math.abs(target.x - x) > reach) {
            x += Math.sign(target.x - x) * reach;
            addBridgePole(x, y);
        }
        if (x !== target.x) {
            x = target.x;
            addBridgePole(x, y);
        }
        while (Math.abs(target.y - y) > reach) {
            y += Math.sign(target.y - y) * reach;
            addBridgePole(x, y);
        }
    }
    return poles;
}

export function calculateActivePoles(
    type: string,
    qualityIdx: number,
    boundsMinX: number,
    boundsMinY: number,
    boundsMaxX: number,
    boundsMaxY: number,
    gridData: GridData,
    gridW: number,
    gridH: number
): ActivePole[] {
    const data = POLE_DATA[type];
    const coverage = data.supply[qualityIdx];
    const reach = data.wire[qualityIdx];
    const offset = Math.floor((coverage - 1) / 2);

    const margin = coverage + 5;
    // Pole centres may legitimately sit just outside the editable canvas to
    // supply pixels on a 1024x1024 image edge. The overlap probe below is
    // already clipped to the grid, so keeping this search margin is safe.
    const searchMinX = boundsMinX - margin;
    const searchMaxX = boundsMaxX + margin;
    const searchMinY = boundsMinY - margin;
    const searchMaxY = boundsMaxY + margin;

    const areaHasLamp = (px: number, py: number, w: number, h: number) => {
        const sx = Math.max(0, px);
        const sy = Math.max(0, py);
        const ex = Math.min(gridW, px + w);
        const ey = Math.min(gridH, py + h);
        for (let y = sy; y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                if (gridData.cells[y * gridW + x]) return true;
            }
        }
        return false;
    };

    const activePoles: ActivePole[] = [];

    const startX = Math.floor((searchMinX) / coverage) * coverage + offset;
    const startY = Math.floor((searchMinY) / coverage) * coverage + offset;

    for (let y = startY; y <= searchMaxY; y += coverage) {
        for (let x = startX; x <= searchMaxX; x += coverage) {
            if (areaHasLamp(x - offset, y - offset, coverage, coverage)) {
                activePoles.push({ x, y, id: activePoles.length, group: activePoles.length });
            }
        }
    }

    return addPoleConnectivityBridges(activePoles, reach);
}

export function calculateSmartPoles(
    type: string,
    qualityIdx: number,
    boundsMinX: number,
    boundsMinY: number,
    boundsMaxX: number,
    boundsMaxY: number,
    gridData: GridData,
    gridW: number,
    gridH: number
): ActivePole[] {
    const data = POLE_DATA[type];
    const coverage = data.supply[qualityIdx]; // Width/Height of supply area
    const reach = data.wire[qualityIdx];
    // const offset = Math.floor((coverage - 1) / 2); // Center offset

    // 1. Identify all pixels that need coverage
    // detailedPixels: {x, y, covered}
    const pixels: { x: number, y: number, covered: boolean }[] = [];
    const pixelSet = new Set<string>();

    for (let y = boundsMinY; y <= boundsMaxY; y++) {
        for (let x = boundsMinX; x <= boundsMaxX; x++) {
            if (gridData.cells[y * gridW + x]) {
                pixels.push({ x, y, covered: false });
                pixelSet.add(`${x},${y}`);
            }
        }
    }

    if (pixels.length === 0) return [];
    // The exhaustive smart candidate map grows with pixels × coverage². Keep
    // large 1024² imports responsive by falling back to the deterministic grid.
    if (pixels.length > 10_000) {
        return calculateActivePoles(type, qualityIdx, boundsMinX, boundsMinY, boundsMaxX, boundsMaxY, gridData, gridW, gridH);
    }

    const activePoles: ActivePole[] = [];
    let uncoveredCount = pixels.length;

    // 2. Generate Candidate Positions
    // A candidate is valid if it covers at least one pixel.
    // Optimization: Only consider positions that are "centered" relative to some pixel?
    // Or just iterate every possible top-left position that could cover a pixel?
    // A pole at (px, py) covers [px, px+size-1] x [py, py+size-1] physical footprint
    // Supply area is larger: [px + size/2 - cov/2, ...]
    // Let's us Supply Area Top-Left (sx, sy) as the main coordinate for simplicity iterate.
    // Supply Rect: [sx, sy, coverage, coverage]
    // The pole entity is at:
    // PoleX = sx + coverage/2 - size/2
    // PoleY = sy + coverage/2 - size/2
    // We want Integer coords.
    // Let's iterate candidates based on the grid of the bounding box extended by coverage.

    // Better selection of candidates:
    // For every pixel `p`, a pole covers it if the pole's supply rect contains `p`.
    // Supply Rect (sx, sy) contains (px, py) iff sx <= px < sx + coverage AND sy <= py < sy + coverage
    // So sx in (px - coverage + 1, px)
    // We can collect all "useful" candidate Supply Rect Top-Lefts.

    const candidateScores = new Map<string, { sx: number, sy: number, cost: number, covers: number[] }>();

    // Helper to get ID
    const cId = (sx: number, sy: number) => `${sx},${sy}`;

    // For every pixel, generate potential candidates that cover it
    for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i];
        // Possible supply top-lefts that cover this pixel
        const startSX = p.x - coverage + 1;
        const startSY = p.y - coverage + 1;
        // We iterate all valid top-lefts for supply area
        for (let sy = startSY; sy <= p.y; sy++) {
            for (let sx = startSX; sx <= p.x; sx++) {
                // Bounds check (optional, but good to keep poles somewhat in bounds)
                // if (sx < 0 || sy < 0 || sx >= gridW || sy >= gridH) continue; 
                // Actually supply area can be anywhere, but pole entity must be essentially "valid"

                const id = cId(sx, sy);
                if (!candidateScores.has(id)) {
                    // Calculate Cost
                    // Real Pole Position
                    // supply center = sx + coverage/2
                    // pole top-left = supply center - size/2
                    const realX = Math.round(sx + coverage / 2 - data.size / 2);
                    const realY = Math.round(sy + coverage / 2 - data.size / 2);

                    let cost = 1.0;
                    // Check overlap with image (Soft Constraint)
                    let overlaps = false;
                    for (let py = 0; py < data.size; py++) {
                        for (let px = 0; px < data.size; px++) {
                            const checkX = realX + px;
                            const checkY = realY + py;
                            if (checkX >= 0 && checkX < gridW && checkY >= 0 && checkY < gridH) {
                                if (gridData.cells[checkY * gridW + checkX]) {
                                    overlaps = true;
                                    break;
                                }
                            }
                        }
                        if (overlaps) break;
                    }
                    if (overlaps) cost += 1000; // High penalty

                    candidateScores.set(id, { sx, sy, cost, covers: [] });
                }
                candidateScores.get(id)!.covers.push(i);
            }
        }
    }

    // 3. Greedy Loop
    const usedCandidates = new Set<string>();

    while (uncoveredCount > 0) {
        let bestCandidate = null;
        let maxScore = -1;

        // Evaluate all candidates
        // Optimization: We could maintain a heap or priority queue, but simple iteration is easier to implement first.
        // JS Map iteration is efficient enough for typical canvas size?
        // number of candidates ~ pixels * coverage^2. 
        // 512x512 with cov 7 = 250k * 49 = 12M checks? A bit heavy for single frame.
        // But active pixels are sparse usually.
        // Let's optimization: We only iterate candidates that cover CURRENTLY UNCOVERED pixels.

        // Actually, we can just iterate the map.
        // Score = NewCovered / Cost.

        for (const [id, cand] of candidateScores) {
            if (usedCandidates.has(id)) continue;

            let newlyCovered = 0;
            for (const pIdx of cand.covers) {
                if (!pixels[pIdx].covered) newlyCovered++;
            }

            if (newlyCovered === 0) {
                // Optimization: Remove useless candidate?
                // candidateScores.delete(id); 
                continue;
            }

            const score = newlyCovered / cand.cost;
            if (score > maxScore) {
                maxScore = score;
                bestCandidate = cand;
            }
        }

        if (!bestCandidate) break; // Should not happen if uncovered > 0

        // Select best
        usedCandidates.add(cId(bestCandidate.sx, bestCandidate.sy));

        // Apply coverage
        for (const pIdx of bestCandidate.covers) {
            if (!pixels[pIdx].covered) {
                pixels[pIdx].covered = true;
                uncoveredCount--;
            }
        }

        // Add to result
        const realX = Math.round(bestCandidate.sx + coverage / 2 - data.size / 2);
        const realY = Math.round(bestCandidate.sy + coverage / 2 - data.size / 2);

        // Push Pole
        activePoles.push({
            x: realX,
            y: realY,
            id: activePoles.length,
            group: activePoles.length
        });
    }

    return addPoleConnectivityBridges(activePoles, reach);
}

/**
 * Places roboports on tiles supplied by the generated electric poles.  The
 * construction areas are first laid out on a slightly-overlapping grid, then
 * any remaining lamp outside those areas receives a nearby powered roboport.
 */
export function calculateActiveRoboports(
    activePoles: ActivePole[],
    poleType: string,
    qualityIdx: number,
    gridData: GridData,
    gridW: number,
    gridH: number,
    autoConstruction = false,
): ActiveRoboport[] {
    if (activePoles.length === 0) return [];

    let minX = gridW;
    let minY = gridH;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            if (!gridData.cells[y * gridW + x]) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX === -1) return [];

    const poleData = POLE_DATA[poleType];
    const supplyHalf = poleData.supply[qualityIdx] / 2;
    const cellCount = gridW * gridH;
    const poleCells = new Int32Array(cellCount).fill(-1);
    const roboportCells = new Uint8Array(cellCount);
    const coveredCells = new Uint8Array(cellCount);
    const roboports: ActiveRoboport[] = [];
    const externalPoleIndices: number[] = [];

    const inGrid = (x: number, y: number) => x >= 0 && x < gridW && y >= 0 && y < gridH;
    const cellIndex = (x: number, y: number) => y * gridW + x;

    activePoles.forEach((pole, poleIndex) => {
        if (pole.x < 0 || pole.y < 0 || pole.x + poleData.size > gridW || pole.y + poleData.size > gridH) {
            externalPoleIndices.push(poleIndex);
        }
        for (let y = pole.y; y < pole.y + poleData.size; y++) {
            for (let x = pole.x; x < pole.x + poleData.size; x++) {
                if (inGrid(x, y)) poleCells[cellIndex(x, y)] = poleIndex;
            }
        }
    });

    const rectHasRoboport = (x: number, y: number) => {
        if (roboports.some(roboport => (
            x < roboport.x + ROBOPORT_SIZE
            && x + ROBOPORT_SIZE > roboport.x
            && y < roboport.y + ROBOPORT_SIZE
            && y + ROBOPORT_SIZE > roboport.y
        ))) return true;
        for (let py = y; py < y + ROBOPORT_SIZE; py++) {
            for (let px = x; px < x + ROBOPORT_SIZE; px++) {
                if (inGrid(px, py) && roboportCells[cellIndex(px, py)]) return true;
            }
        }
        return false;
    };

    const overlappingPoleIndices = (x: number, y: number) => {
        const overlaps = new Set<number>();
        for (let py = y; py < y + ROBOPORT_SIZE; py++) {
            for (let px = x; px < x + ROBOPORT_SIZE; px++) {
                if (!inGrid(px, py)) continue;
                const poleIndex = poleCells[cellIndex(px, py)];
                if (poleIndex !== -1) overlaps.add(poleIndex);
            }
        }
        for (const poleIndex of externalPoleIndices) {
            const pole = activePoles[poleIndex];
            if (
                x < pole.x + poleData.size
                && x + ROBOPORT_SIZE > pole.x
                && y < pole.y + poleData.size
                && y + ROBOPORT_SIZE > pole.y
            ) overlaps.add(poleIndex);
        }
        return [...overlaps];
    };

    const lampOverlapCount = (x: number, y: number) => {
        let overlaps = 0;
        for (let py = y; py < y + ROBOPORT_SIZE; py++) {
            for (let px = x; px < x + ROBOPORT_SIZE; px++) {
                if (inGrid(px, py) && gridData.cells[py * gridW + px]) overlaps++;
            }
        }
        return overlaps;
    };

    const markRoboport = (roboport: ActiveRoboport) => {
        for (let py = roboport.y; py < roboport.y + ROBOPORT_SIZE; py++) {
            for (let px = roboport.x; px < roboport.x + ROBOPORT_SIZE; px++) {
                if (inGrid(px, py)) roboportCells[cellIndex(px, py)] = 1;
            }
        }

        const centerX = roboport.x + ROBOPORT_SIZE / 2;
        const centerY = roboport.y + ROBOPORT_SIZE / 2;
        const startX = Math.max(0, Math.ceil(centerX - ROBOPORT_CONSTRUCTION_RADIUS));
        const endX = Math.min(gridW, Math.ceil(centerX + ROBOPORT_CONSTRUCTION_RADIUS));
        const startY = Math.max(0, Math.ceil(centerY - ROBOPORT_CONSTRUCTION_RADIUS));
        const endY = Math.min(gridH, Math.ceil(centerY + ROBOPORT_CONSTRUCTION_RADIUS));

        for (let py = startY; py < endY; py++) {
            coveredCells.fill(1, cellIndex(startX, py), cellIndex(endX, py));
        }
    };

    const isConstructionCovered = (center: number, target: number) => (
        target >= center - ROBOPORT_CONSTRUCTION_RADIUS
        && target < center + ROBOPORT_CONSTRUCTION_RADIUS
    );

    const candidateCenters = (target: number, min: number, max: number) => {
        if (autoConstruction) {
            const candidates: number[] = [];
            for (let value = Math.ceil(min); value <= Math.floor(max); value++) candidates.push(value);
            return candidates;
        }
        const ideal = Math.min(max, Math.max(min, target));
        const candidates = new Set<number>([min, max, Math.round(ideal)]);
        for (let offset = -2; offset <= 2; offset++) {
            candidates.add(Math.round(ideal) + offset);
        }
        return [...candidates].filter(value => value >= min && value <= max);
    };

    const removedPoleIndices = new Set<number>();
    const protectedPoleIndices = new Set<number>();

    const addRoboportFor = (targetX: number, targetY: number, preferredPoleIndices?: readonly number[]) => {
        let best: { roboport: ActiveRoboport; score: number } | null = null;
        const preferredPoles = preferredPoleIndices ? new Set(preferredPoleIndices) : undefined;

        for (const [poleIndex, pole] of activePoles.entries()) {
            if (preferredPoles && !preferredPoles.has(poleIndex)) continue;
            if (removedPoleIndices.has(poleIndex)) continue;
            const poleCenterX = pole.x + poleData.size / 2;
            const poleCenterY = pole.y + poleData.size / 2;
            // A roboport only needs part of its 4×4 footprint in a pole's
            // supply area. Expand the valid centre range accordingly so even
            // normal big electric poles can power an adjacent roboport.
            const minCenterX = Math.floor(poleCenterX - supplyHalf - ROBOPORT_SIZE / 2) + 1;
            const maxCenterX = Math.ceil(poleCenterX + supplyHalf + ROBOPORT_SIZE / 2) - 1;
            const minCenterY = Math.floor(poleCenterY - supplyHalf - ROBOPORT_SIZE / 2) + 1;
            const maxCenterY = Math.ceil(poleCenterY + supplyHalf + ROBOPORT_SIZE / 2) - 1;

            if (
                targetX < minCenterX - ROBOPORT_CONSTRUCTION_RADIUS
                || targetX >= maxCenterX + ROBOPORT_CONSTRUCTION_RADIUS
                || targetY < minCenterY - ROBOPORT_CONSTRUCTION_RADIUS
                || targetY >= maxCenterY + ROBOPORT_CONSTRUCTION_RADIUS
            ) continue;

            const xCenters = candidateCenters(targetX, minCenterX, maxCenterX);
            const yCenters = candidateCenters(targetY, minCenterY, maxCenterY);

            for (const centerX of xCenters) {
                for (const centerY of yCenters) {
                    if (
                        !isConstructionCovered(centerX, targetX)
                        || !isConstructionCovered(centerY, targetY)
                    ) continue;

                    const x = centerX - ROBOPORT_SIZE / 2;
                    const y = centerY - ROBOPORT_SIZE / 2;
                    if (x < -ROBOPORT_SIZE || y < -ROBOPORT_SIZE || x > gridW || y > gridH) continue;
                    if (rectHasRoboport(x, y)) continue;
                    if (autoConstruction && roboports.length > 0 && !roboports.some(roboport => {
                        const existingCenterX = roboport.x + ROBOPORT_SIZE / 2;
                        const existingCenterY = roboport.y + ROBOPORT_SIZE / 2;
                        const dx = centerX - existingCenterX;
                        const dy = centerY - existingCenterY;
                        const maximumDistance = ROBOPORT_LOGISTICS_RADIUS * 2;
                        return dx * dx + dy * dy <= maximumDistance * maximumDistance;
                    })) continue;

                    const replacedPoleIndices = overlappingPoleIndices(x, y);
                    if (
                        replacedPoleIndices.includes(poleIndex)
                        || replacedPoleIndices.some(index => protectedPoleIndices.has(index))
                    ) continue;
                    if (autoConstruction && replacedPoleIndices.length > 0) continue;

                    const distance = Math.pow(centerX - targetX, 2) + Math.pow(centerY - targetY, 2);
                    const score = distance + lampOverlapCount(x, y) * 50;
                    if (!best || score < best.score) {
                        best = {
                            roboport: { x, y, poweredBy: poleIndex, replacedPoleIndices },
                            score,
                        };
                    }
                }
            }
        }

        if (!best) return false;
        roboports.push(best.roboport);
        best.roboport.replacedPoleIndices.forEach(index => removedPoleIndices.add(index));
        protectedPoleIndices.add(best.roboport.poweredBy);
        markRoboport(best.roboport);
        return true;
    };

    if (autoConstruction) {
        const adjacency = Array.from({ length: activePoles.length }, () => [] as number[]);
        for (const [firstIndex, secondIndex] of calculatePoleEdges(activePoles, poleData.wire[qualityIdx])) {
            adjacency[firstIndex].push(secondIndex);
            adjacency[secondIndex].push(firstIndex);
        }

        const startPoleIndex = activePoles.reduce((bestIndex, pole, index) => {
            const best = activePoles[bestIndex];
            return pole.x < best.x || (pole.x === best.x && pole.y < best.y) ? index : bestIndex;
        }, 0);
        const queue = [startPoleIndex];
        const visited = new Uint8Array(activePoles.length);
        visited[startPoleIndex] = 1;
        let queueIndex = 0;

        while (queueIndex < queue.length) {
            const poleIndex = queue[queueIndex++];
            const pole = activePoles[poleIndex];
            const poleCenterX = pole.x + poleData.size / 2;
            const poleCenterY = pole.y + poleData.size / 2;
            let nearestRoboportDistance = Infinity;
            for (const roboport of roboports) {
                const dx = poleCenterX - (roboport.x + ROBOPORT_SIZE / 2);
                const dy = poleCenterY - (roboport.y + ROBOPORT_SIZE / 2);
                nearestRoboportDistance = Math.min(nearestRoboportDistance, Math.sqrt(dx * dx + dy * dy));
            }

            if (nearestRoboportDistance > AUTO_CONSTRUCTION_POLE_RADIUS) {
                const nearbyPoleIndices = [poleIndex, ...adjacency[poleIndex]];
                const placed = addRoboportFor(poleCenterX, poleCenterY, nearbyPoleIndices)
                    || addRoboportFor(poleCenterX, poleCenterY);
                if (!placed) {
                    throw new Error(`Unable to extend the auto-construction roboport network near (${Math.round(poleCenterX)}, ${Math.round(poleCenterY)}).`);
                }
            }

            for (const neighbourIndex of adjacency[poleIndex]) {
                if (visited[neighbourIndex]) continue;
                visited[neighbourIndex] = 1;
                queue.push(neighbourIndex);
            }
        }

        if (queue.length !== activePoles.length) {
            throw new Error('Auto-construction requires one connected electric-pole network.');
        }

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const index = cellIndex(x, y);
                if (!gridData.cells[index] || coveredCells[index]) continue;
                if (!addRoboportFor(x, y)) {
                    throw new Error(`Unable to cover lamp (${x}, ${y}) with the connected auto-construction network.`);
                }
            }
        }

        return roboports;
    }

    const makeTargets = (start: number, end: number) => {
        const targets: number[] = [];
        const spacing = ROBOPORT_CONSTRUCTION_RADIUS * 2 - 10;
        for (let value = start; value <= end; value += spacing) targets.push(value);
        if (targets[targets.length - 1] !== end) targets.push(end);
        return targets;
    };

    const targetXs = makeTargets(minX, maxX);
    const targetYs = makeTargets(minY, maxY);
    targetYs.forEach((targetY) => {
        targetXs.forEach((targetX) => {
            if (!coveredCells[cellIndex(targetX, targetY)]) addRoboportFor(targetX, targetY);
        });
    });

    // Guarantee that every lamp has a construction area, even for sparse or
    // irregularly-shaped artwork where the bounding box has empty regions.
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (gridData.cells[y * gridW + x] && !coveredCells[cellIndex(x, y)]) {
                addRoboportFor(x, y);
            }
        }
    }

    return roboports;
}

export function generateBlueprintData(
    gridData: GridData,
    gridW: number,
    gridH: number,
    poleType: string,
    qualityIdx: number,
    autoPole: boolean,
    smartPlacement: boolean,
    autoRoboport: boolean,
    autoConstruction = false,
    label = "Factorio Art",
    backgroundTile: BackgroundTileName = '',
): { bpString: string | null, status: string } {

    const entities: BlueprintEntity[] = [];
    let entityId = 1;
    const data = POLE_DATA[poleType];

    let minX = gridW, minY = gridH, maxX = -1, maxY = -1;
    let hasPixels = false;

    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            if (gridData.cells[y * gridW + x]) {
                hasPixels = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (!hasPixels) {
        return { bpString: null, status: "Empty Canvas" };
    }

    const poles: ActivePole[] = [];
    let roboports: ActiveRoboport[] = [];
    if (autoPole) {
        let activePoles: ActivePole[];
        if (smartPlacement) {
            activePoles = calculateSmartPoles(poleType, qualityIdx, minX, minY, maxX, maxY, gridData, gridW, gridH);
        } else {
            activePoles = calculateActivePoles(poleType, qualityIdx, minX, minY, maxX, maxY, gridData, gridW, gridH);
        }

        if (autoRoboport) {
            roboports = calculateActiveRoboports(activePoles, poleType, qualityIdx, gridData, gridW, gridH, autoConstruction);
            const replacedPoleIndices = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
            activePoles = activePoles.filter((_, index) => !replacedPoleIndices.has(index));
        }

        const reach = data.wire[qualityIdx];

        activePoles.forEach(p => p.neighbours = []);
        calculatePoleEdges(activePoles, reach).forEach(([firstIndex, secondIndex]) => {
            activePoles[firstIndex].neighbours!.push(secondIndex);
            activePoles[secondIndex].neighbours!.push(firstIndex);
        });

        activePoles.forEach((p) => {
            p.entity_number = entityId++;
        });

        activePoles.forEach((p) => {
            const neighbourIds = p.neighbours!.map(nIdx => activePoles[nIdx].entity_number!);
            const entity: BlueprintEntity = {
                entity_number: p.entity_number!,
                name: poleType,
                // Factorio entities are centered. p.x is Top-Left integer.
                // Center = TopLeft + Size/2
                position: { x: (p.x - minX) + data.size / 2, y: (p.y - minY) + data.size / 2 },
                neighbours: neighbourIds
            };
            if (qualityIdx > 0) {
                entity.quality = QUALITY_NAMES[qualityIdx];
            }
            entities.push(entity);
            poles.push(p);
        });
    }

    roboports.forEach((roboport) => {
        entities.push({
            entity_number: entityId++,
            name: "roboport",
            position: {
                x: (roboport.x - minX) + ROBOPORT_SIZE / 2,
                y: (roboport.y - minY) + ROBOPORT_SIZE / 2,
            },
        });
    });

    const isPole = (x: number, y: number) => {
        if (!autoPole) return false;
        return poles.some(p => {
            return x >= p.x && x < p.x + data.size && y >= p.y && y < p.y + data.size;
        });
    };

    const isRoboport = (x: number, y: number) => roboports.some((roboport) => (
        x >= roboport.x
        && x < roboport.x + ROBOPORT_SIZE
        && y >= roboport.y
        && y < roboport.y + ROBOPORT_SIZE
    ));

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const packedColor = gridData.cells[y * gridW + x];
            if (packedColor) {
                if (isPole(x, y) || isRoboport(x, y)) continue;

                const rgb = uint32ToRgb(packedColor);
                entities.push({
                    entity_number: entityId++,
                    name: "small-lamp",
                    // Lamp is 1x1. Center is x + 0.5
                    position: { x: (x - minX) + 0.5, y: (y - minY) + 0.5 },
                    color: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: 1 },
                    always_on: true,
                });
            }
        }
    }

    const bp: BlueprintJson = {
        blueprint: {
            item: "blueprint",
            label,
            entities: entities,
            ...(backgroundTile ? { tiles: createBackgroundTiles(backgroundTile, maxX - minX + 1, maxY - minY + 1) } : {}),
            icons: [{ signal: { type: "item", name: "small-lamp" }, index: 1 }],
            version: 562949958139904,
        },
    };

    return { bpString: encodeBlueprint(bp), status: "Success" };
}

export function createUnionGrid(
    firstFrame: GridData,
    secondFrame: GridData,
    gridW: number,
    gridH: number,
): GridData {
    const cells = new Uint32Array(gridW * gridH);
    for (let index = 0; index < cells.length; index++) {
        cells[index] = firstFrame.cells[index] || secondFrame.cells[index];
    }
    return { width: gridW, height: gridH, cells };
}

const packedRgb = (packedColor: number) => {
    const rgb = uint32ToRgb(packedColor);
    // Zero means "no signal" to Factorio. Pure black is represented by the
    // visually indistinguishable #000001 so it remains different from transparency.
    return (rgb.r << 16) | (rgb.g << 8) | rgb.b || 1;
};

const createBackgroundTiles = (
    tileName: BackgroundTileName,
    width: number,
    height: number,
) => {
    if (!tileName) return [];
    const tiles: { name: string; position: { x: number; y: number } }[] = [];
    // Leave one complete tile beyond every outer lamp edge. This makes the
    // concrete visibly frame the artwork instead of ending flush with it.
    for (let y = -1; y <= height; y++) {
        for (let x = -1; x <= width; x++) {
            tiles.push({ name: tileName, position: { x, y } });
        }
    }
    return tiles;
};

const addNeighbour = (entity: BlueprintEntity, neighbourId: number) => {
    entity.neighbours ??= [];
    if (!entity.neighbours.includes(neighbourId)) entity.neighbours.push(neighbourId);
};

const calculatePoleEdges = (poles: ActivePole[], reach: number) => {
    const edges: { u: number; v: number; dist: number }[] = [];
    const buckets = new Map<string, number[]>();
    const bucketSize = Math.max(1, reach);
    for (let i = 0; i < poles.length; i++) {
        const bucketX = Math.floor(poles[i].x / bucketSize);
        const bucketY = Math.floor(poles[i].y / bucketSize);
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
            for (let offsetX = -1; offsetX <= 1; offsetX++) {
                const neighbours = buckets.get(`${bucketX + offsetX},${bucketY + offsetY}`) ?? [];
                for (const j of neighbours) {
                    const dx = poles[i].x - poles[j].x;
                    const dy = poles[i].y - poles[j].y;
                    const distanceSquared = dx * dx + dy * dy;
                    if (distanceSquared <= reach * reach) edges.push({ u: j, v: i, dist: distanceSquared });
                }
            }
        }
        const key = `${bucketX},${bucketY}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(i);
        buckets.set(key, bucket);
    }
    edges.sort((a, b) => a.dist - b.dist);

    const parent = Array.from({ length: poles.length }, (_, index) => index);
    const find = (index: number): number => {
        if (parent[index] !== index) parent[index] = find(parent[index]);
        return parent[index];
    };
    const result: [number, number][] = [];
    for (const edge of edges) {
        const rootU = find(edge.u);
        const rootV = find(edge.v);
        if (rootU === rootV) continue;
        parent[rootU] = rootV;
        result.push([edge.u, edge.v]);
    }
    return result;
};

export type AnimationControllerSide = 'left' | 'top' | 'right' | 'bottom';

// Factorio 2.x blueprint directions use the 16-way defines.direction values.
// Cardinal directions are therefore spaced by four, not by two as in 1.x.
const FACTORIO_DIRECTION = {
    north: 0,
    east: 4,
    south: 8,
    west: 12,
} as const;

/** Faces every decider's output connector toward the image. */
const animationCombinatorDirection = (side: AnimationControllerSide) => {
    switch (side) {
        case 'left': return FACTORIO_DIRECTION.east;
        case 'top': return FACTORIO_DIRECTION.south;
        case 'right': return FACTORIO_DIRECTION.west;
        case 'bottom': return FACTORIO_DIRECTION.north;
    }
};

type AnimationSupportRect = { x: number; y: number; size: number };

type AnimationControllerGeometry = {
    side: AnimationControllerSide;
    verticalLines: boolean;
    pathDirection: 1 | -1;
    spineCoord: number;
    firstRomCoord: number;
    secondRomCoord: number;
    spineLineCoords: number[];
};

const animationPoint = (
    side: AnimationControllerSide,
    pathCoordinate: number,
    lineCoordinate: number,
) => side === 'left' || side === 'right'
    ? { x: pathCoordinate, y: lineCoordinate }
    : { x: lineCoordinate, y: pathCoordinate };

const calculateAnimationControllerGeometry = (
    supportRects: AnimationSupportRect[],
    side: AnimationControllerSide,
    pathLength: number,
    dynamicLineCoords: number[],
): AnimationControllerGeometry => {
    const verticalLines = side === 'top' || side === 'bottom';
    const lowSide = side === 'left' || side === 'top';
    const pathDirection: 1 | -1 = lowSide ? 1 : -1;
    const supportMin = supportRects.reduce((minimum, rect) => (
        Math.min(minimum, verticalLines ? rect.y : rect.x)
    ), 0);
    const supportMax = supportRects.reduce((maximum, rect) => (
        Math.max(maximum, (verticalLines ? rect.y : rect.x) + rect.size)
    ), pathLength);
    const spineCoord = lowSide ? supportMin - 2 : supportMax + 2;
    const firstRomCoord = spineCoord - pathDirection * 6;
    const secondRomCoord = spineCoord - pathDirection * 3;
    const firstDynamicLine = dynamicLineCoords.length ? dynamicLineCoords[0] : 0;
    const lastDynamicLine = dynamicLineCoords.length ? dynamicLineCoords[dynamicLineCoords.length - 1] : 0;
    const spineLineCoords: number[] = [];
    for (let line = firstDynamicLine; line <= lastDynamicLine; line += 12) spineLineCoords.push(line);
    if (
        spineLineCoords[spineLineCoords.length - 1] !== lastDynamicLine
        && lastDynamicLine - spineLineCoords[spineLineCoords.length - 1] > 6
    ) {
        spineLineCoords.push(lastDynamicLine);
    }
    return {
        side,
        verticalLines,
        pathDirection,
        spineCoord,
        firstRomCoord,
        secondRomCoord,
        spineLineCoords,
    };
};

type MediaAnimationControllerGeometry = {
    side: AnimationControllerSide;
    verticalLines: boolean;
    pathDirection: 1 | -1;
    spineCoord: number;
    memoryCoord: number;
    baseRomCoord: number;
    transitionRomCoords: number[];
    powerPathCoords: number[];
    spineLineCoords: number[];
};

/**
 * Multi-frame controllers use banks of combinators. Four banks fit between
 * two substation corridors; the extra three-tile corridor keeps every bank
 * powered without placing a support entity over a ROM.
 */
const mediaBankDepth = (bankIndex: number) => (
    3 * (bankIndex + 1) + 3 * Math.floor(bankIndex / 4)
);

const calculateMediaAnimationControllerGeometry = (
    supportRects: AnimationSupportRect[],
    side: AnimationControllerSide,
    pathLength: number,
    dynamicLineCoords: number[],
    frameCount: number,
): MediaAnimationControllerGeometry => {
    const verticalLines = side === 'top' || side === 'bottom';
    const lowSide = side === 'left' || side === 'top';
    const pathDirection: 1 | -1 = lowSide ? 1 : -1;
    const supportMin = supportRects.reduce((minimum, rect) => (
        Math.min(minimum, verticalLines ? rect.y : rect.x)
    ), 0);
    const supportMax = supportRects.reduce((maximum, rect) => (
        Math.max(maximum, (verticalLines ? rect.y : rect.x) + rect.size)
    ), pathLength);
    const spineCoord = lowSide ? supportMin - 2 : supportMax + 2;
    const bankCount = frameCount + 2; // line memory + base ROM + one transition ROM per frame
    const bankCoords = Array.from({ length: bankCount }, (_, bankIndex) => (
        spineCoord - pathDirection * mediaBankDepth(bankIndex)
    ));
    const corridorCount = Math.max(0, Math.ceil((bankCount - 3) / 4));
    const powerPathCoords = [
        spineCoord,
        ...Array.from({ length: corridorCount }, (_, index) => (
            spineCoord - pathDirection * 15 * (index + 1)
        )),
    ];
    const firstDynamicLine = dynamicLineCoords.length ? dynamicLineCoords[0] : 0;
    const lastDynamicLine = dynamicLineCoords.length
        ? dynamicLineCoords[dynamicLineCoords.length - 1]
        : 0;
    const spineLineCoords: number[] = [];
    for (let line = firstDynamicLine; line <= lastDynamicLine; line += 12) {
        spineLineCoords.push(line);
    }
    if (
        spineLineCoords[spineLineCoords.length - 1] !== lastDynamicLine
        && lastDynamicLine - spineLineCoords[spineLineCoords.length - 1] > 6
    ) {
        spineLineCoords.push(lastDynamicLine);
    }
    return {
        side,
        verticalLines,
        pathDirection,
        spineCoord,
        memoryCoord: bankCoords[0],
        baseRomCoord: bankCoords[1],
        transitionRomCoords: bankCoords.slice(2),
        powerPathCoords,
        spineLineCoords,
    };
};

const calculateMediaControllerRoboportCoordinates = (
    geometry: MediaAnimationControllerGeometry,
) => {
    if (!geometry.powerPathCoords.length || !geometry.spineLineCoords.length) return [];
    const pathCoordinates = geometry.powerPathCoords.filter((_, index) => index % 3 === 0);
    const lastPath = geometry.powerPathCoords[geometry.powerPathCoords.length - 1];
    if (pathCoordinates[pathCoordinates.length - 1] !== lastPath) pathCoordinates.push(lastPath);
    const firstLine = geometry.spineLineCoords[0];
    const lastLine = geometry.spineLineCoords[geometry.spineLineCoords.length - 1];
    const lineCoordinates: number[] = [];
    for (let line = firstLine + 6; line <= lastLine + 24; line += 48) lineCoordinates.push(line);
    if (!lineCoordinates.length) lineCoordinates.push(firstLine + 6);
    return pathCoordinates.flatMap(pathCoordinate => (
        lineCoordinates.map(lineCoordinate => ({ pathCoordinate, lineCoordinate }))
    ));
};

type RowCircuitPath = {
    path: number[];
    generatedRelayXs: number[];
};

/**
 * Calculates the exact lamp path used to keep each red-wire hop below ten
 * tiles. This is shared by blueprint generation and the visual preview so the
 * relay positions cannot drift apart.
 */
const calculateLineCircuitPath = (
    targetCoordinates: number[],
    existingLampCoordinates: Set<number>,
    secondRomCoordinate: number,
    pathDirection: 1 | -1,
    isSupportOccupied: (localCoordinate: number) => boolean,
): RowCircuitPath => {
    const lampCoordinates = new Set(existingLampCoordinates);
    const path: number[] = [];
    const generatedRelayXs: number[] = [];
    let previousCoordinate = secondRomCoordinate;

    for (const targetCoordinate of [...targetCoordinates].sort((first, second) => (
        pathDirection * (first - second)
    ))) {
        const targetCenter = targetCoordinate + 0.5;
        while ((targetCenter - previousCoordinate) * pathDirection > 9) {
            let relayCoordinate = pathDirection === 1
                ? Math.min(targetCoordinate - 1, Math.floor(previousCoordinate + 8.5))
                : Math.max(targetCoordinate + 1, Math.ceil(previousCoordinate - 9.5));
            while (
                (relayCoordinate + 0.5 - previousCoordinate) * pathDirection > 0
                && isSupportOccupied(relayCoordinate)
            ) relayCoordinate -= pathDirection;
            if ((relayCoordinate + 0.5 - previousCoordinate) * pathDirection <= 0) {
                relayCoordinate = pathDirection === 1
                    ? Math.floor(previousCoordinate + 0.5)
                    : Math.ceil(previousCoordinate - 1.5);
                while (
                    (targetCoordinate - relayCoordinate) * pathDirection > 0
                    && isSupportOccupied(relayCoordinate)
                ) relayCoordinate += pathDirection;
            }
            if (
                (targetCoordinate - relayCoordinate) * pathDirection <= 0
                || (relayCoordinate + 0.5 - previousCoordinate) * pathDirection <= 0
            ) break;
            if (!lampCoordinates.has(relayCoordinate)) {
                lampCoordinates.add(relayCoordinate);
                generatedRelayXs.push(relayCoordinate);
            }
            path.push(relayCoordinate);
            previousCoordinate = relayCoordinate + 0.5;
        }
        if (previousCoordinate !== targetCenter) {
            path.push(targetCoordinate);
            previousCoordinate = targetCenter;
        }
    }
    return { path, generatedRelayXs };
};

const emptyAnimationStats = (): AnimationEntityStats => ({
    deciderCombinatorCount: 0,
    arithmeticCombinatorCount: 0,
    constantCombinatorCount: 0,
    displayPanelCount: 0,
    controllerPoleCount: 0,
    controllerRoboportCount: 0,
    relayPoleCount: 0,
    programmableSpeakerCount: 0,
});

/**
 * Produces lightweight, tile-aligned entities for the editor preview. All
 * coordinates are absolute canvas tiles, whereas Factorio stores the same
 * entities relative to the cropped image origin.
 */
export function calculateAnimationPreviewLayout(
    firstFrame: GridData,
    secondFrame: GridData,
    gridW: number,
    gridH: number,
    activePoles: ActivePole[],
    roboports: ActiveRoboport[],
    poleType: string,
    includeHelpDisplay: boolean,
    controllerSide: AnimationControllerSide = 'top',
): AnimationPreviewLayout {
    const unionGrid = createUnionGrid(firstFrame, secondFrame, gridW, gridH);
    let minX = gridW;
    let minY = gridH;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < unionGrid.cells.length; index++) {
        if (!unionGrid.cells[index]) continue;
        const x = index % gridW;
        const y = Math.floor(index / gridW);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    if (maxX === -1) return { entities: [], stats: emptyAnimationStats(), bounds: null };

    const occupied = new Uint8Array(gridW * gridH);
    const markOccupied = (x: number, y: number, size: number) => {
        for (let py = y; py < y + size; py++) {
            for (let px = x; px < x + size; px++) {
                if (px >= 0 && px < gridW && py >= 0 && py < gridH) occupied[py * gridW + px] = 1;
            }
        }
    };
    const poleSize = POLE_DATA[poleType].size;
    activePoles.forEach(pole => markOccupied(pole.x, pole.y, poleSize));
    roboports.forEach(roboport => markOccupied(roboport.x, roboport.y, ROBOPORT_SIZE));

    const supportRects: AnimationSupportRect[] = [
        ...activePoles.map(pole => ({ x: pole.x - minX, y: pole.y - minY, size: poleSize })),
        ...roboports.map(roboport => ({ x: roboport.x - minX, y: roboport.y - minY, size: ROBOPORT_SIZE })),
    ];
    const isSupportOccupied = (localX: number, localY: number) => supportRects.some(rect => (
        localX >= rect.x
        && localX < rect.x + rect.size
        && localY >= rect.y
        && localY < rect.y + rect.size
    ));

    const verticalLines = controllerSide === 'top' || controllerSide === 'bottom';
    const dynamicLines: { localLine: number; targets: number[]; lamps: Set<number> }[] = [];
    const lineCount = verticalLines ? maxX - minX + 1 : maxY - minY + 1;
    const pathLength = verticalLines ? maxY - minY + 1 : maxX - minX + 1;
    for (let localLine = 0; localLine < lineCount; localLine++) {
        const targets: number[] = [];
        const lamps = new Set<number>();
        for (let localPath = 0; localPath < pathLength; localPath++) {
            const x = verticalLines ? minX + localLine : minX + localPath;
            const y = verticalLines ? minY + localPath : minY + localLine;
            const index = y * gridW + x;
            const first = firstFrame.cells[index];
            const second = secondFrame.cells[index];
            if ((!first && !second) || occupied[index]) continue;
            lamps.add(localPath);
            if (first === second) continue;
            targets.push(localPath);
        }
        if (targets.length) dynamicLines.push({ localLine, targets, lamps });
    }

    const geometry = calculateAnimationControllerGeometry(
        supportRects,
        controllerSide,
        pathLength,
        dynamicLines.map(line => line.localLine),
    );
    const entities: BlueprintPreviewEntity[] = [];
    const addPreview = (
        kind: BlueprintPreviewKind,
        name: string,
        description: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ) => entities.push({ kind, name, description, x, y, width, height });

    const absolutePoint = (pathCoordinate: number, lineCoordinate: number) => {
        const point = animationPoint(controllerSide, pathCoordinate, lineCoordinate);
        return { x: minX + point.x, y: minY + point.y };
    };
    const addDeciderPreview = (description: string, pathCoordinate: number, lineCoordinate: number) => {
        const center = absolutePoint(pathCoordinate, lineCoordinate);
        addPreview(
            'decider-combinator',
            'Decider combinator',
            description,
            center.x - (verticalLines ? 0.5 : 1),
            center.y - (verticalLines ? 1 : 0.5),
            verticalLines ? 1 : 2,
            verticalLines ? 2 : 1,
        );
    };

    geometry.spineLineCoords.forEach((lineCoordinate) => {
        const center = absolutePoint(geometry.spineCoord, lineCoordinate);
        addPreview(
            'controller-substation',
            'Substation',
            `Animation controller power and circuit spine (${controllerSide})`,
            center.x - 1,
            center.y - 1,
            2,
            2,
        );
    });
    const clockLine = geometry.spineLineCoords[0] - 3.5;
    const timerIncrementCenter = absolutePoint(
        geometry.firstRomCoord - geometry.pathDirection * 0.5,
        clockLine,
    );
    addPreview(
        'constant-combinator',
        'Constant combinator',
        'Animation clock increment (T = 1)',
        timerIncrementCenter.x - 0.5,
        timerIncrementCenter.y - 0.5,
        1,
        1,
    );
    addDeciderPreview(
        'Animation cycle timer',
        geometry.secondRomCoord - geometry.pathDirection,
        clockLine,
    );
    addDeciderPreview(
        'Frame selector',
        geometry.spineCoord - geometry.pathDirection,
        clockLine,
    );
    if (includeHelpDisplay) {
        const displayCenter = absolutePoint(
            geometry.firstRomCoord - geometry.pathDirection * 0.5,
            clockLine + 2,
        );
        addPreview(
            'display-panel',
            'Display panel',
            'Animation delay editing guide',
            displayCenter.x - 0.5,
            displayCenter.y - 0.5,
            1,
            1,
        );
    }

    let relayPoleCount = 0;
    for (const line of dynamicLines) {
        const lineLabel = verticalLines ? 'column' : 'row';
        addDeciderPreview(
            `Image 1 ROM, ${lineLabel} ${line.localLine + 1}`,
            geometry.firstRomCoord,
            line.localLine + 0.5,
        );
        addDeciderPreview(
            `Image 2 ROM, ${lineLabel} ${line.localLine + 1}`,
            geometry.secondRomCoord,
            line.localLine + 0.5,
        );
        const circuitPath = calculateLineCircuitPath(
            line.targets,
            line.lamps,
            geometry.secondRomCoord,
            geometry.pathDirection,
            localPath => {
                const point = animationPoint(controllerSide, localPath, line.localLine);
                return isSupportOccupied(point.x, point.y);
            },
        );
        circuitPath.generatedRelayXs.forEach((relayCoordinate) => {
            const point = absolutePoint(relayCoordinate, line.localLine);
            addPreview(
                'relay-pole',
                'Medium electric pole',
                'Generated passive circuit relay and local power distributor',
                point.x,
                point.y,
                1,
                1,
            );
        });
        relayPoleCount += circuitPath.generatedRelayXs.length;
    }

    let previewMinX = minX;
    let previewMinY = minY;
    let previewMaxX = maxX + 1;
    let previewMaxY = maxY + 1;
    const includeBounds = (x: number, y: number, width: number, height: number) => {
        previewMinX = Math.min(previewMinX, x);
        previewMinY = Math.min(previewMinY, y);
        previewMaxX = Math.max(previewMaxX, x + width);
        previewMaxY = Math.max(previewMaxY, y + height);
    };
    activePoles.forEach(pole => includeBounds(pole.x, pole.y, poleSize, poleSize));
    roboports.forEach(roboport => includeBounds(roboport.x, roboport.y, ROBOPORT_SIZE, ROBOPORT_SIZE));
    entities.forEach(entity => includeBounds(entity.x, entity.y, entity.width, entity.height));

    return {
        entities,
        stats: {
            deciderCombinatorCount: 2 + dynamicLines.length * 2,
            arithmeticCombinatorCount: 0,
            constantCombinatorCount: 1,
            displayPanelCount: includeHelpDisplay ? 1 : 0,
            controllerPoleCount: geometry.spineLineCoords.length,
            controllerRoboportCount: 0,
            relayPoleCount,
            programmableSpeakerCount: 0,
        },
        bounds: { minX: previewMinX, minY: previewMinY, maxX: previewMaxX, maxY: previewMaxY },
    };
}

/** Lightweight preview for FFmpeg-backed animations with any frame count. */
export function calculateMediaAnimationPreviewLayout(
    animation: GridAnimationData,
    gridW: number,
    gridH: number,
    activePoles: ActivePole[],
    roboports: ActiveRoboport[],
    poleType: string,
    includeHelpDisplay: boolean,
    controllerSide: AnimationControllerSide = 'top',
    includeControllerRoboports = false,
    audioTrack?: DecodedAudioTrack,
    audioInstruments?: AudioInstrumentSelections,
): AnimationPreviewLayout {
    const unionGrid = createAnimationUnionGrid(animation);
    const constantGrid = createAnimationConstantGrid(animation);
    let minX = gridW;
    let minY = gridH;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < unionGrid.cells.length; index++) {
        if (!unionGrid.cells[index]) continue;
        const x = index % gridW;
        const y = Math.floor(index / gridW);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    if (maxX === -1) {
        if (!audioTrack) return { entities: [], stats: emptyAnimationStats(), bounds: null };
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
    }

    const occupied = new Uint8Array(gridW * gridH);
    const markOccupied = (x: number, y: number, size: number) => {
        for (let py = y; py < y + size; py++) {
            for (let px = x; px < x + size; px++) {
                if (px >= 0 && px < gridW && py >= 0 && py < gridH) occupied[py * gridW + px] = 1;
            }
        }
    };
    const poleSize = POLE_DATA[poleType].size;
    activePoles.forEach(pole => markOccupied(pole.x, pole.y, poleSize));
    roboports.forEach(roboport => markOccupied(roboport.x, roboport.y, ROBOPORT_SIZE));

    const supportRects: AnimationSupportRect[] = [
        ...activePoles.map(pole => ({ x: pole.x - minX, y: pole.y - minY, size: poleSize })),
        ...roboports.map(roboport => ({ x: roboport.x - minX, y: roboport.y - minY, size: ROBOPORT_SIZE })),
    ];
    const isSupportOccupied = (localX: number, localY: number) => supportRects.some(rect => (
        localX >= rect.x
        && localX < rect.x + rect.size
        && localY >= rect.y
        && localY < rect.y + rect.size
    ));

    const verticalLines = controllerSide === 'top' || controllerSide === 'bottom';
    const dynamicLines: { localLine: number; targets: number[]; lamps: Set<number> }[] = [];
    const lineCount = verticalLines ? maxX - minX + 1 : maxY - minY + 1;
    const pathLength = verticalLines ? maxY - minY + 1 : maxX - minX + 1;
    for (let localLine = 0; localLine < lineCount; localLine++) {
        const targets: number[] = [];
        const lamps = new Set<number>();
        for (let localPath = 0; localPath < pathLength; localPath++) {
            const x = verticalLines ? minX + localLine : minX + localPath;
            const y = verticalLines ? minY + localPath : minY + localLine;
            const index = y * gridW + x;
            if (!unionGrid.cells[index] || occupied[index]) continue;
            lamps.add(localPath);
            if (constantGrid.cells[index]) continue;
            targets.push(localPath);
        }
        if (targets.length) dynamicLines.push({ localLine, targets, lamps });
    }

    const localLineByGridIndex = new Int32Array(gridW * gridH);
    localLineByGridIndex.fill(-1);
    for (const line of dynamicLines) {
        for (const localPath of line.targets) {
            const x = verticalLines ? minX + line.localLine : minX + localPath;
            const y = verticalLines ? minY + localPath : minY + line.localLine;
            localLineByGridIndex[y * gridW + x] = line.localLine;
        }
    }
    const transitionLines: Set<number>[] = [];
    const lastFrameCells = animation.firstFrame.cells.slice();
    for (const transition of animation.transitions) {
        for (let index = 0; index < transition.indices.length; index++) {
            lastFrameCells[transition.indices[index]] = transition.colors[index];
        }
    }
    const loopLines = new Set<number>();
    for (let gridIndex = 0; gridIndex < localLineByGridIndex.length; gridIndex++) {
        const localLine = localLineByGridIndex[gridIndex];
        if (
            localLine >= 0
            && packedRgbOrZero(lastFrameCells[gridIndex]) !== packedRgbOrZero(animation.firstFrame.cells[gridIndex])
        ) loopLines.add(localLine);
    }
    transitionLines.push(loopLines);
    for (const transition of animation.transitions) {
        const lines = new Set<number>();
        for (const gridIndex of transition.indices) {
            const localLine = localLineByGridIndex[gridIndex];
            if (localLine >= 0) lines.add(localLine);
        }
        transitionLines.push(lines);
    }
    const lineTransitionIndices = new Map<number, number[]>();
    transitionLines.forEach((lines, eventIndex) => {
        for (const localLine of lines) {
            const indices = lineTransitionIndices.get(localLine) ?? [];
            indices.push(eventIndex);
            lineTransitionIndices.set(localLine, indices);
        }
    });
    const sparseRomCount = [...lineTransitionIndices.values()]
        .reduce((total, indices) => total + indices.length, 0);
    const maximumSparseRomCount = [...lineTransitionIndices.values()]
        .reduce((maximum, indices) => Math.max(maximum, indices.length), 0);
    const resolvedAudioInstruments = resolveAudioInstruments(audioTrack, audioInstruments);
    const preparedAudioEvents = prepareAudioEvents(
        audioTrack,
        Math.max(2, animationDurationTicks(animation)),
        resolvedAudioInstruments,
    );
    const transitionBankCount = Math.max(2, maximumSparseRomCount, preparedAudioEvents.length);
    const geometry = calculateMediaAnimationControllerGeometry(
        supportRects,
        controllerSide,
        pathLength,
        dynamicLines.map(line => line.localLine),
        transitionBankCount,
    );
    const entities: BlueprintPreviewEntity[] = [];
    const addPreview = (
        kind: BlueprintPreviewKind,
        name: string,
        description: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ) => entities.push({ kind, name, description, x, y, width, height });
    const absolutePoint = (pathCoordinate: number, lineCoordinate: number) => {
        const point = animationPoint(controllerSide, pathCoordinate, lineCoordinate);
        return { x: minX + point.x, y: minY + point.y };
    };
    const addCombinatorPreview = (
        kind: 'decider-combinator' | 'arithmetic-combinator',
        name: string,
        description: string,
        pathCoordinate: number,
        lineCoordinate: number,
    ) => {
        const center = absolutePoint(pathCoordinate, lineCoordinate);
        addPreview(
            kind,
            name,
            description,
            center.x - (verticalLines ? 0.5 : 1),
            center.y - (verticalLines ? 1 : 0.5),
            verticalLines ? 1 : 2,
            verticalLines ? 2 : 1,
        );
    };

    for (const pathCoordinate of geometry.powerPathCoords) {
        for (const lineCoordinate of geometry.spineLineCoords) {
            const center = absolutePoint(pathCoordinate, lineCoordinate);
            addPreview(
                'controller-substation',
                'Substation',
                `Media animation controller power and clock network (${controllerSide})`,
                center.x - 1,
                center.y - 1,
                2,
                2,
            );
        }
    }
    const controllerRoboports = includeControllerRoboports
        ? calculateMediaControllerRoboportCoordinates(geometry)
        : [];
    for (const coordinate of controllerRoboports) {
        const center = absolutePoint(coordinate.pathCoordinate, coordinate.lineCoordinate);
        addPreview(
            'controller-roboport',
            'Roboport',
            'Media controller auto-construction roboport',
            center.x - ROBOPORT_SIZE / 2,
            center.y - ROBOPORT_SIZE / 2,
            ROBOPORT_SIZE,
            ROBOPORT_SIZE,
        );
    }

    const clockLine = geometry.spineLineCoords[0] - 3.5;
    const timerIncrementCenter = absolutePoint(
        geometry.memoryCoord - geometry.pathDirection * 0.5,
        clockLine,
    );
    addPreview(
        'constant-combinator',
        'Constant combinator',
        'Media animation clock increment (T = 1)',
        timerIncrementCenter.x - 0.5,
        timerIncrementCenter.y - 0.5,
        1,
        1,
    );
    const controllerEnableCenter = absolutePoint(
        geometry.baseRomCoord - geometry.pathDirection * 0.5,
        clockLine,
    );
    addPreview(
        'constant-combinator',
        'Constant combinator',
        'Media animation controller enable (I = 1)',
        controllerEnableCenter.x - 0.5,
        controllerEnableCenter.y - 0.5,
        1,
        1,
    );
    addCombinatorPreview(
        'decider-combinator',
        'Decider combinator',
        'Media animation cycle timer',
        geometry.spineCoord - geometry.pathDirection,
        clockLine,
    );
    if (includeHelpDisplay) {
        const displayCenter = absolutePoint(
            geometry.baseRomCoord - geometry.pathDirection * 0.5,
            clockLine + 2,
        );
        addPreview(
            'display-panel',
            'Display panel',
            'Media animation timing guide',
            displayCenter.x - 0.5,
            displayCenter.y - 0.5,
            1,
            1,
        );
    }

    let relayPoleCount = 0;
    const maximumPreviewRoms = MAX_BLUEPRINT_PREVIEW_ENTITIES;
    let previewRomCount = 0;
    let encounteredRomCount = 0;
    const previewRomStride = Math.max(1, Math.ceil(sparseRomCount / maximumPreviewRoms));
    for (const line of dynamicLines) {
        const lineLabel = verticalLines ? 'column' : 'row';
        addCombinatorPreview(
            'arithmetic-combinator',
            'Arithmetic combinator',
            `Persistent media memory, ${lineLabel} ${line.localLine + 1}`,
            geometry.memoryCoord,
            line.localLine + 0.5,
        );
        addCombinatorPreview(
            'decider-combinator',
            'Decider combinator',
            `Media base ROM, ${lineLabel} ${line.localLine + 1}`,
            geometry.baseRomCoord,
            line.localLine + 0.5,
        );
        (lineTransitionIndices.get(line.localLine) ?? []).forEach((frameIndex, packedIndex) => {
            const romIndex = encounteredRomCount++;
            if (romIndex % previewRomStride !== 0 || previewRomCount >= maximumPreviewRoms) return;
            previewRomCount++;
            addCombinatorPreview(
                'decider-combinator',
                'Decider combinator',
                `Media frame ${frameIndex + 1} delta ROM, ${lineLabel} ${line.localLine + 1}`,
                geometry.transitionRomCoords[packedIndex],
                line.localLine + 0.5,
            );
        });
        const circuitPath = calculateLineCircuitPath(
            line.targets,
            line.lamps,
            geometry.memoryCoord,
            geometry.pathDirection,
            localPath => {
                const point = animationPoint(controllerSide, localPath, line.localLine);
                return isSupportOccupied(point.x, point.y);
            },
        );
        for (const relayCoordinate of circuitPath.generatedRelayXs) {
            const point = absolutePoint(relayCoordinate, line.localLine);
            addPreview(
                'relay-pole',
                'Medium electric pole',
                'Generated passive media circuit relay and local power distributor',
                point.x,
                point.y,
                1,
                1,
            );
        }
        relayPoleCount += circuitPath.generatedRelayXs.length;
    }

    for (let eventIndex = 0; eventIndex < Math.min(preparedAudioEvents.length, maximumPreviewRoms - previewRomCount); eventIndex++) {
        const event = preparedAudioEvents[eventIndex];
        addCombinatorPreview(
            'decider-combinator',
            'Decider combinator',
            `Stereo note event, T = ${event.tick}`,
            geometry.transitionRomCoords[eventIndex],
            clockLine,
        );
    }
    if (preparedAudioEvents.length) {
        for (const [lineOffset, channel, instrument] of [
            [-2, 'Left', resolvedAudioInstruments.left],
            [2, 'Right', resolvedAudioInstruments.right],
        ] as const) {
            const center = absolutePoint(geometry.transitionRomCoords[0], clockLine + lineOffset);
            addPreview(
                'programmable-speaker',
                'Programmable speaker',
                `${channel} approximate ${instrument.label} channel (${instrument.range})`,
                center.x - 0.5,
                center.y - 0.5,
                1,
                1,
            );
        }
    }

    let previewMinX = minX;
    let previewMinY = minY;
    let previewMaxX = maxX + 1;
    let previewMaxY = maxY + 1;
    const includeBounds = (x: number, y: number, width: number, height: number) => {
        previewMinX = Math.min(previewMinX, x);
        previewMinY = Math.min(previewMinY, y);
        previewMaxX = Math.max(previewMaxX, x + width);
        previewMaxY = Math.max(previewMaxY, y + height);
    };
    activePoles.forEach(pole => includeBounds(pole.x, pole.y, poleSize, poleSize));
    roboports.forEach(roboport => includeBounds(roboport.x, roboport.y, ROBOPORT_SIZE, ROBOPORT_SIZE));
    entities.forEach(entity => includeBounds(entity.x, entity.y, entity.width, entity.height));

    return {
        entities,
        stats: {
            deciderCombinatorCount: 1 + dynamicLines.length + sparseRomCount + preparedAudioEvents.length,
            arithmeticCombinatorCount: dynamicLines.length,
            constantCombinatorCount: 2,
            displayPanelCount: includeHelpDisplay ? 1 : 0,
            controllerPoleCount: geometry.powerPathCoords.length * geometry.spineLineCoords.length,
            controllerRoboportCount: controllerRoboports.length,
            relayPoleCount,
            programmableSpeakerCount: preparedAudioEvents.length ? 2 : 0,
        },
        bounds: { minX: previewMinX, minY: previewMinY, maxX: previewMaxX, maxY: previewMaxY },
    };
}

export interface AnimatedBlueprintOptions {
    poleType: string;
    qualityIdx: number;
    autoPole: boolean;
    smartPlacement: boolean;
    autoRoboport: boolean;
    autoConstruction: boolean;
    delayTicks: number;
    includeHelpDisplay: boolean;
    controllerSide?: AnimationControllerSide;
    label?: string;
    backgroundTile?: BackgroundTileName;
}

/**
 * Generates a self-running two-frame display. Each animated row owns two ROM
 * deciders. A row can therefore carry all 1,024 columns without cross-talk,
 * while the same pool of base-game signals is reused on the next row.
 */
export function generateAnimatedBlueprintData(
    firstFrame: GridData,
    secondFrame: GridData,
    gridW: number,
    gridH: number,
    options: AnimatedBlueprintOptions,
): { bpString: string | null; status: string } {
    const unionGrid = createUnionGrid(firstFrame, secondFrame, gridW, gridH);
    let minX = gridW;
    let minY = gridH;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < unionGrid.cells.length; index++) {
        if (!unionGrid.cells[index]) continue;
        const x = index % gridW;
        const y = Math.floor(index / gridW);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    if (maxX === -1) return { bpString: null, status: 'Both animation frames are empty.' };

    const imageWidth = maxX - minX + 1;
    const imageHeight = maxY - minY + 1;
    const controllerSide = options.controllerSide ?? 'top';
    const verticalLines = controllerSide === 'top' || controllerSide === 'bottom';
    const pathLength = verticalLines ? imageHeight : imageWidth;
    if (pathLength > PIXEL_SIGNALS.length) {
        return {
            bpString: null,
            status: `Animation ${verticalLines ? 'height' : 'width'} exceeds ${PIXEL_SIGNALS.length} pixels.`,
        };
    }

    const delayTicks = Math.max(2, Math.round(options.delayTicks));
    const cycleTicks = delayTicks * 2;
    const poleData = POLE_DATA[options.poleType];
    const entities: BlueprintEntity[] = [];
    const wires: BlueprintWire[] = [];
    let entityId = 1;

    const addEntity = (entity: Omit<BlueprintEntity, 'entity_number'>) => {
        const complete = { ...entity, entity_number: entityId++ } as BlueprintEntity;
        entities.push(complete);
        return complete;
    };
    const addWire = (first: BlueprintEntity, firstConnector: number, second: BlueprintEntity, secondConnector: number) => {
        wires.push([first.entity_number, firstConnector, second.entity_number, secondConnector]);
    };

    let activePoles: ActivePole[] = [];
    let roboports: ActiveRoboport[] = [];
    if (options.autoPole) {
        activePoles = options.smartPlacement
            ? calculateSmartPoles(options.poleType, options.qualityIdx, minX, minY, maxX, maxY, unionGrid, gridW, gridH)
            : calculateActivePoles(options.poleType, options.qualityIdx, minX, minY, maxX, maxY, unionGrid, gridW, gridH);
        if (options.autoRoboport) {
            roboports = calculateActiveRoboports(
                activePoles,
                options.poleType,
                options.qualityIdx,
                unionGrid,
                gridW,
                gridH,
                options.autoConstruction,
            );
            const replaced = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
            activePoles = activePoles.filter((_, index) => !replaced.has(index));
        }
    }

    const occupied = new Uint8Array(gridW * gridH);
    const markOccupied = (x: number, y: number, size: number) => {
        for (let py = y; py < y + size; py++) {
            for (let px = x; px < x + size; px++) {
                if (px >= 0 && px < gridW && py >= 0 && py < gridH) occupied[py * gridW + px] = 1;
            }
        }
    };
    activePoles.forEach(pole => markOccupied(pole.x, pole.y, poleData.size));
    roboports.forEach(roboport => markOccupied(roboport.x, roboport.y, ROBOPORT_SIZE));
    const supportRects = [
        ...activePoles.map(pole => ({ x: pole.x - minX, y: pole.y - minY, size: poleData.size })),
        ...roboports.map(roboport => ({ x: roboport.x - minX, y: roboport.y - minY, size: ROBOPORT_SIZE })),
    ];
    const isSupportOccupied = (localX: number, localY: number) => supportRects.some(rect => (
        localX >= rect.x
        && localX < rect.x + rect.size
        && localY >= rect.y
        && localY < rect.y + rect.size
    ));

    const mainPoleEntities = activePoles.map((pole) => {
        const entity = addEntity({
            name: options.poleType,
            position: {
                x: pole.x - minX + poleData.size / 2,
                y: pole.y - minY + poleData.size / 2,
            },
            ...(options.qualityIdx > 0 ? { quality: QUALITY_NAMES[options.qualityIdx] } : {}),
        });
        pole.entity_number = entity.entity_number;
        return entity;
    });
    const relayPoleEntities: BlueprintEntity[] = [];
    for (const [firstIndex, secondIndex] of calculatePoleEdges(activePoles, poleData.wire[options.qualityIdx])) {
        addNeighbour(mainPoleEntities[firstIndex], mainPoleEntities[secondIndex].entity_number);
        addNeighbour(mainPoleEntities[secondIndex], mainPoleEntities[firstIndex].entity_number);
    }

    roboports.forEach((roboport) => addEntity({
        name: 'roboport',
        position: {
            x: roboport.x - minX + ROBOPORT_SIZE / 2,
            y: roboport.y - minY + ROBOPORT_SIZE / 2,
        },
    }));

    const dynamicLineMap = new Map<number, { localLine: number; lampIds: Map<number, BlueprintEntity>; targets: number[] }>();
    const artLampPathsByLine = new Map<number, Set<number>>();
    const artLampEntitiesByLine = new Map<number, Map<number, BlueprintEntity>>();
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const index = y * gridW + x;
            const first = firstFrame.cells[index];
            const second = secondFrame.cells[index];
            if ((!first && !second) || occupied[index]) continue;
            const localX = x - minX;
            const localY = y - minY;
            const localPath = verticalLines ? localY : localX;
            const localLine = verticalLines ? localX : localY;
            const artLampPaths = artLampPathsByLine.get(localLine) ?? new Set<number>();
            artLampPaths.add(localPath);
            artLampPathsByLine.set(localLine, artLampPaths);
            const artLampEntities = artLampEntitiesByLine.get(localLine) ?? new Map<number, BlueprintEntity>();
            artLampEntitiesByLine.set(localLine, artLampEntities);
            if (first === second && first) {
                const rgb = uint32ToRgb(first);
                const lamp = addEntity({
                    name: 'small-lamp',
                    position: { x: localX + 0.5, y: localY + 0.5 },
                    color: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: 1 },
                    always_on: true,
                    player_description: 'Static animation pixel: this color is identical in every frame.',
                });
                artLampEntities.set(localPath, lamp);
                continue;
            }
            const line = dynamicLineMap.get(localLine) ?? {
                localLine,
                lampIds: new Map<number, BlueprintEntity>(),
                targets: [],
            };
            dynamicLineMap.set(localLine, line);
            const signal = PIXEL_SIGNALS[localPath];
            const lamp = addEntity({
                name: 'small-lamp',
                position: { x: localX + 0.5, y: localY + 0.5 },
                control_behavior: {
                    circuit_enabled: true,
                    circuit_condition: { first_signal: signal, comparator: '≠', constant: 0 },
                    use_colors: true,
                    rgb_signal: signal,
                    color_mode: 2,
                },
            });
            line.lampIds.set(localPath, lamp);
            artLampEntities.set(localPath, lamp);
            line.targets.push(localPath);
        }
    }
    const dynamicLines = [...dynamicLineMap.values()]
        .filter(line => line.targets.length > 0)
        .sort((first, second) => first.localLine - second.localLine);

    const geometry = calculateAnimationControllerGeometry(
        supportRects,
        controllerSide,
        pathLength,
        dynamicLines.map(line => line.localLine),
    );
    const localPoint = (pathCoordinate: number, lineCoordinate: number) => (
        animationPoint(controllerSide, pathCoordinate, lineCoordinate)
    );

    // A red-wire spine carries the current frame to every row or column. Substations are
    // close enough to power the ROMs and act as long-range circuit relays.
    const spine = geometry.spineLineCoords.map((lineCoordinate) => {
        const position = localPoint(geometry.spineCoord, lineCoordinate);
        return addEntity({
            name: 'substation',
            position,
            player_description: `Animation controller power and frame-signal spine (${controllerSide}).`,
            ...(options.qualityIdx > 0 ? { quality: QUALITY_NAMES[options.qualityIdx] } : {}),
        });
    });
    for (let index = 1; index < spine.length; index++) {
        addNeighbour(spine[index - 1], spine[index].entity_number);
        addNeighbour(spine[index], spine[index - 1].entity_number);
        addWire(spine[index - 1], 1, spine[index], 1);
    }

    if (mainPoleEntities.length) {
        const controllerReach = POLE_DATA.substation.wire[options.qualityIdx];
        let best: { main: BlueprintEntity; controller: BlueprintEntity; distance: number } | undefined;
        for (const main of mainPoleEntities) {
            for (const controller of spine) {
                const dx = main.position.x - controller.position.x;
                const dy = main.position.y - controller.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= Math.min(controllerReach, poleData.wire[options.qualityIdx]) && (!best || distance < best.distance)) {
                    best = { main, controller, distance };
                }
            }
        }
        if (best) {
            addNeighbour(best.main, best.controller.entity_number);
            addNeighbour(best.controller, best.main.entity_number);
        }
    }

    const clockLine = geometry.spineLineCoords[0] - 3.5;
    const timerIncrementPosition = localPoint(
        geometry.firstRomCoord - geometry.pathDirection * 0.5,
        clockLine,
    );
    const timerPosition = localPoint(
        geometry.secondRomCoord - geometry.pathDirection,
        clockLine,
    );
    const frameDecoderPosition = localPoint(
        geometry.spineCoord - geometry.pathDirection,
        clockLine,
    );
    const combinatorDirection = animationCombinatorDirection(controllerSide);
    const timerIncrement = addEntity({
        name: 'constant-combinator',
        position: timerIncrementPosition,
        player_description: 'Animation clock increment. Keep T = 1.',
        control_behavior: {
            sections: { sections: [{
                index: 1,
                filters: [{ index: 1, type: TIMER_SIGNAL.type, name: TIMER_SIGNAL.name, quality: 'normal', comparator: '=', count: 1 }],
            }] },
        },
    });
    const timer = addEntity({
        name: 'decider-combinator',
        position: timerPosition,
        direction: combinatorDirection,
        player_description: `EDIT DELAY: set T < ${cycleTicks} (two times the frame delay).`,
        control_behavior: {
            decider_conditions: {
                conditions: [{ first_signal: TIMER_SIGNAL, comparator: '<', constant: cycleTicks }],
                outputs: [{ signal: TIMER_SIGNAL, copy_count_from_input: true }],
            },
        },
    });
    const frameDecoder = addEntity({
        name: 'decider-combinator',
        position: frameDecoderPosition,
        direction: combinatorDirection,
        player_description: `EDIT DELAY: set T > ${delayTicks} (ticks per image).`,
        control_behavior: {
            decider_conditions: {
                conditions: [{ first_signal: TIMER_SIGNAL, comparator: '>', constant: delayTicks }],
                outputs: [{ signal: IMAGE_SIGNAL, copy_count_from_input: false, constant: 1 }],
            },
        },
    });
    addWire(timerIncrement, 1, timer, 1);
    addWire(timer, 3, timer, 1);
    addWire(timer, 3, frameDecoder, 1);
    addWire(frameDecoder, 3, spine[0], 1);

    if (options.includeHelpDisplay) {
        const seconds = (delayTicks / 60).toLocaleString('en-US', { maximumFractionDigits: 3 });
        const displayPosition = localPoint(
            geometry.firstRomCoord - geometry.pathDirection * 0.5,
            clockLine + 2,
        );
        addEntity({
            name: 'display-panel',
            position: displayPosition,
            icon: { type: 'virtual', name: 'signal-info' },
            text: `ANIMATION TIMER\nEach image: ${delayTicks} ticks = ${seconds} s @ 60 UPS\nEdit the 2 deciders above:\nT < ${cycleTicks} (cycle)\nT > ${delayTicks} (switch)\nAlways keep cycle = 2 x switch.\nRows switch in parallel; logic latency is about 2 ticks.`,
        });
    }

    const nearestSpine = (lineCoordinate: number) => spine.reduce((nearest, candidate) => (
        Math.abs((verticalLines ? candidate.position.x : candidate.position.y) - lineCoordinate)
            < Math.abs((verticalLines ? nearest.position.x : nearest.position.y) - lineCoordinate)
            ? candidate
            : nearest
    ));

    for (const line of dynamicLines) {
        const firstOutputs: Record<string, unknown>[] = [];
        const secondOutputs: Record<string, unknown>[] = [];
        for (const localPath of line.lampIds.keys()) {
            const local = localPoint(localPath, line.localLine);
            const x = minX + local.x;
            const y = minY + local.y;
            const signal = PIXEL_SIGNALS[localPath];
            const index = y * gridW + x;
            if (firstFrame.cells[index]) {
                firstOutputs.push({ signal, copy_count_from_input: false, constant: packedRgb(firstFrame.cells[index]) });
            }
            if (secondFrame.cells[index]) {
                secondOutputs.push({ signal, copy_count_from_input: false, constant: packedRgb(secondFrame.cells[index]) });
            }
        }

        const firstRomPosition = localPoint(geometry.firstRomCoord, line.localLine + 0.5);
        const secondRomPosition = localPoint(geometry.secondRomCoord, line.localLine + 0.5);
        const lineLabel = verticalLines ? 'column' : 'row';
        const firstRom = addEntity({
            name: 'decider-combinator',
            position: firstRomPosition,
            direction: combinatorDirection,
            player_description: `Generated image 1 ROM, ${lineLabel} ${line.localLine + 1}.`,
            control_behavior: {
                decider_conditions: {
                    conditions: [{ first_signal: IMAGE_SIGNAL, comparator: '=', constant: 0 }],
                    outputs: firstOutputs,
                },
            },
        });
        const secondRom = addEntity({
            name: 'decider-combinator',
            position: secondRomPosition,
            direction: combinatorDirection,
            player_description: `Generated image 2 ROM, ${lineLabel} ${line.localLine + 1}.`,
            control_behavior: {
                decider_conditions: {
                    conditions: [{ first_signal: IMAGE_SIGNAL, comparator: '>', constant: 0 }],
                    outputs: secondOutputs,
                },
            },
        });
        addWire(firstRom, 4, secondRom, 4);
        const signalSpine = nearestSpine(line.localLine + 0.5);
        addWire(signalSpine, 1, firstRom, 1);
        addWire(signalSpine, 1, secondRom, 1);

        let previous = secondRom;
        let previousConnector = 4;
        const circuitPath = calculateLineCircuitPath(
            line.targets,
            artLampPathsByLine.get(line.localLine) ?? new Set(line.lampIds.keys()),
            geometry.secondRomCoord,
            geometry.pathDirection,
            localPath => {
                const point = localPoint(localPath, line.localLine);
                return isSupportOccupied(point.x, point.y);
            },
        );
        const pathEntities = new Map<number, { entity: BlueprintEntity; connector: number }>(
            [...(artLampEntitiesByLine.get(line.localLine) ?? line.lampIds)]
                .map(([coordinate, entity]) => [coordinate, { entity, connector: 2 }]),
        );
        for (const relayCoordinate of circuitPath.generatedRelayXs) {
            const relayPosition = localPoint(relayCoordinate + 0.5, line.localLine + 0.5);
            const relayPole = addEntity({
                name: 'medium-electric-pole',
                position: relayPosition,
                player_description: 'Generated passive animation circuit relay and local power distributor.',
                ...(options.qualityIdx > 0 ? { quality: QUALITY_NAMES[options.qualityIdx] } : {}),
            });
            relayPoleEntities.push(relayPole);
            pathEntities.set(relayCoordinate, { entity: relayPole, connector: 2 });
        }
        for (const pathCoordinate of circuitPath.path) {
            const next = pathEntities.get(pathCoordinate)!;
            if (previous.entity_number === next.entity.entity_number) continue;
            addWire(previous, previousConnector, next.entity, next.connector);
            previous = next.entity;
            previousConnector = next.connector;
        }
    }

    // Circuit relays used to be inactive lamps. Medium poles are passive
    // circuit connectors, have no per-tick lamp update, and distribute power
    // to nearby edge pixels. Seed the spatial lookup with the already-wired
    // image/controller networks, then attach every relay to its closest pole.
    const relayReach = POLE_DATA['medium-electric-pole'].wire[options.qualityIdx];
    const powerNodes = [
        ...mainPoleEntities.map(entity => ({ entity, reach: poleData.wire[options.qualityIdx] })),
        ...spine.map(entity => ({ entity, reach: POLE_DATA.substation.wire[options.qualityIdx] })),
    ];
    const bucketSize = relayReach;
    const powerBuckets = new Map<string, { entity: BlueprintEntity; reach: number }[]>();
    const bucketKey = (position: { x: number; y: number }) => (
        `${Math.floor(position.x / bucketSize)},${Math.floor(position.y / bucketSize)}`
    );
    const addPowerNode = (node: { entity: BlueprintEntity; reach: number }) => {
        const key = bucketKey(node.entity.position);
        const bucket = powerBuckets.get(key) ?? [];
        bucket.push(node);
        powerBuckets.set(key, bucket);
    };
    powerNodes.forEach(addPowerNode);
    for (const relay of relayPoleEntities) {
        const bucketX = Math.floor(relay.position.x / bucketSize);
        const bucketY = Math.floor(relay.position.y / bucketSize);
        let nearest: { entity: BlueprintEntity; distanceSquared: number } | undefined;
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
            for (let offsetX = -1; offsetX <= 1; offsetX++) {
                const candidates = powerBuckets.get(`${bucketX + offsetX},${bucketY + offsetY}`) ?? [];
                for (const candidate of candidates) {
                    const dx = relay.position.x - candidate.entity.position.x;
                    const dy = relay.position.y - candidate.entity.position.y;
                    const distanceSquared = dx * dx + dy * dy;
                    const maximumDistance = Math.min(relayReach, candidate.reach);
                    if (
                        distanceSquared <= maximumDistance * maximumDistance
                        && (!nearest || distanceSquared < nearest.distanceSquared)
                    ) nearest = { entity: candidate.entity, distanceSquared };
                }
            }
        }
        if (nearest) {
            addNeighbour(relay, nearest.entity.entity_number);
            addNeighbour(nearest.entity, relay.entity_number);
        }
        const node = { entity: relay, reach: relayReach };
        powerNodes.push(node);
        addPowerNode(node);
    }

    const blueprint: BlueprintJson = {
        blueprint: {
            item: 'blueprint',
            label: options.label ?? 'Two-frame Factorio Art',
            entities,
            ...(options.backgroundTile ? { tiles: createBackgroundTiles(options.backgroundTile, imageWidth, imageHeight) } : {}),
            wires,
            icons: [
                { signal: { type: 'item', name: 'small-lamp' }, index: 1 },
                { signal: { type: 'item', name: 'decider-combinator' }, index: 2 },
            ],
            version: 562949958467584,
        },
    };
    return { bpString: encodeBlueprint(blueprint), status: 'Success' };
}

export type MediaBlueprintOptions = Omit<AnimatedBlueprintOptions, 'delayTicks'> & {
    audioTrack?: DecodedAudioTrack;
    audioInstruments?: AudioInstrumentSelections;
    onProgress?: (percentage: number) => void;
};

type MediaLampInfo = {
    localLine: number;
    localPath: number;
    signal: FactorioSignalID;
};

type MediaTransitionEvent = {
    threshold: number;
    outputsByLine: Map<number, Record<string, unknown>[]>;
};

type PreparedAudioEvent = Pick<AudioNoteEvent, 'tick'> & {
    leftPitch?: number;
    rightPitch?: number;
};

type ResolvedAudioInstrument = typeof AUDIO_INSTRUMENTS[AudioInstrumentName] & {
    name: AudioInstrumentName;
};

type ResolvedAudioInstruments = {
    left: ResolvedAudioInstrument;
    right: ResolvedAudioInstrument;
};

const sourceEventMidi = (event: AudioNoteEvent, channel: 'left' | 'right') => {
    const midi = channel === 'left' ? event.leftMidi : event.rightMidi;
    if (midi !== undefined) return Math.round(midi);
    const legacyPitch = channel === 'left' ? event.leftPitch : event.rightPitch;
    return legacyPitch === undefined ? undefined : 53 + Math.round(legacyPitch) - 1;
};

const resolveAudioInstrument = (
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
            // Prefer the wider piano tessitura when two instruments cover the
            // detected notes equally well.
            if (candidate.noteCount !== best.noteCount) {
                return candidate.noteCount > best.noteCount ? candidateName : bestName;
            }
            return bestName;
        }, 'piano' as AudioInstrumentName);
    }
    return { name, ...AUDIO_INSTRUMENTS[name] };
};

const resolveAudioInstruments = (
    audioTrack: DecodedAudioTrack | undefined,
    selections: AudioInstrumentSelections | undefined,
): ResolvedAudioInstruments => ({
    left: resolveAudioInstrument(selections?.left ?? 'auto', audioTrack, 'left'),
    right: resolveAudioInstrument(selections?.right ?? 'auto', audioTrack, 'right'),
});

const prepareAudioEvents = (
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

const packedRgbOrZero = (packedColor: number) => packedColor ? packedRgb(packedColor) : 0;

const validateMediaTransition = (
    transition: MediaFrameTransition,
    cellCount: number,
) => {
    if (transition.indices.length !== transition.colors.length) {
        throw new Error('A media frame patch has mismatched index and color arrays.');
    }
    for (const index of transition.indices) {
        if (index >= cellCount) throw new Error('A media frame patch points outside the editor grid.');
    }
};

/**
 * Generates an arbitrary-length GIF/video display. The final frame is the
 * continuously powered base ROM. Each line then owns one arithmetic memory
 * and one sparse delta ROM per displayed frame. At a frame boundary only the
 * changed signals are added to the memory; all lines update in parallel.
 */
export function generateMediaAnimationBlueprintData(
    animation: GridAnimationData,
    gridW: number,
    gridH: number,
    options: MediaBlueprintOptions,
): { bpString: string | null; status: string } {
    options.onProgress?.(1);
    if (
        animation.firstFrame.width !== gridW
        || animation.firstFrame.height !== gridH
        || animation.firstFrame.cells.length !== gridW * gridH
    ) {
        return { bpString: null, status: 'The media animation grid dimensions are invalid.' };
    }
    try {
        animation.transitions.forEach(transition => validateMediaTransition(transition, gridW * gridH));
    } catch (error) {
        return { bpString: null, status: error instanceof Error ? error.message : String(error) };
    }
    options.onProgress?.(3);

    const frameCount = animation.transitions.length + 1;
    if (frameCount < 2 && !options.audioTrack) {
        return generateBlueprintData(
            animation.firstFrame,
            gridW,
            gridH,
            options.poleType,
            options.qualityIdx,
            options.autoPole,
            options.smartPlacement,
            options.autoRoboport,
            options.autoConstruction,
            options.label,
            options.backgroundTile,
        );
    }
    const cycleTicks = Math.max(2, animationDurationTicks(animation));
    if (cycleTicks > 2_000_000_000) {
        return { bpString: null, status: 'The media animation duration exceeds the Factorio circuit counter range.' };
    }

    const unionGrid = createAnimationUnionGrid(animation);
    const constantGrid = createAnimationConstantGrid(animation);
    let minX = gridW;
    let minY = gridH;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < unionGrid.cells.length; index++) {
        if (!unionGrid.cells[index]) continue;
        const x = index % gridW;
        const y = Math.floor(index / gridW);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    if (maxX === -1) {
        if (!options.audioTrack) return { bpString: null, status: 'Every decoded media frame is empty.' };
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
    }

    const imageWidth = maxX - minX + 1;
    const imageHeight = maxY - minY + 1;
    const controllerSide = options.controllerSide ?? 'top';
    const verticalLines = controllerSide === 'top' || controllerSide === 'bottom';
    const pathLength = verticalLines ? imageHeight : imageWidth;
    if (pathLength > PIXEL_SIGNALS.length) {
        return {
            bpString: null,
            status: `Media animation ${verticalLines ? 'height' : 'width'} exceeds ${PIXEL_SIGNALS.length} pixels.`,
        };
    }

    const poleData = POLE_DATA[options.poleType];
    const entities: BlueprintEntity[] = [];
    const wires: BlueprintWire[] = [];
    let entityId = 1;
    const addEntity = (entity: Omit<BlueprintEntity, 'entity_number'>) => {
        const complete = { ...entity, entity_number: entityId++ } as BlueprintEntity;
        entities.push(complete);
        return complete;
    };
    const addWire = (
        first: BlueprintEntity,
        firstConnector: number,
        second: BlueprintEntity,
        secondConnector: number,
    ) => wires.push([
        first.entity_number,
        firstConnector,
        second.entity_number,
        secondConnector,
    ] as BlueprintWire);

    let activePoles: ActivePole[] = [];
    let roboports: ActiveRoboport[] = [];
    if (options.autoPole) {
        activePoles = options.smartPlacement
            ? calculateSmartPoles(
                options.poleType,
                options.qualityIdx,
                minX,
                minY,
                maxX,
                maxY,
                unionGrid,
                gridW,
                gridH,
            )
            : calculateActivePoles(
                options.poleType,
                options.qualityIdx,
                minX,
                minY,
                maxX,
                maxY,
                unionGrid,
                gridW,
                gridH,
            );
        if (options.autoRoboport) {
            roboports = calculateActiveRoboports(
                activePoles,
                options.poleType,
                options.qualityIdx,
                unionGrid,
                gridW,
                gridH,
                options.autoConstruction,
            );
            const replaced = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
            activePoles = activePoles.filter((_, index) => !replaced.has(index));
        }
    }

    const occupied = new Uint8Array(gridW * gridH);
    const markOccupied = (x: number, y: number, size: number) => {
        for (let py = y; py < y + size; py++) {
            for (let px = x; px < x + size; px++) {
                if (px >= 0 && px < gridW && py >= 0 && py < gridH) occupied[py * gridW + px] = 1;
            }
        }
    };
    activePoles.forEach(pole => markOccupied(pole.x, pole.y, poleData.size));
    roboports.forEach(roboport => markOccupied(roboport.x, roboport.y, ROBOPORT_SIZE));
    const supportRects: AnimationSupportRect[] = [
        ...activePoles.map(pole => ({ x: pole.x - minX, y: pole.y - minY, size: poleData.size })),
        ...roboports.map(roboport => ({ x: roboport.x - minX, y: roboport.y - minY, size: ROBOPORT_SIZE })),
    ];
    const isSupportOccupied = (localX: number, localY: number) => supportRects.some(rect => (
        localX >= rect.x
        && localX < rect.x + rect.size
        && localY >= rect.y
        && localY < rect.y + rect.size
    ));

    const mainPoleEntities = activePoles.map((pole) => {
        const entity = addEntity({
            name: options.poleType,
            position: {
                x: pole.x - minX + poleData.size / 2,
                y: pole.y - minY + poleData.size / 2,
            },
            ...(options.qualityIdx > 0 ? { quality: QUALITY_NAMES[options.qualityIdx] } : {}),
        });
        pole.entity_number = entity.entity_number;
        return entity;
    });
    for (const [firstIndex, secondIndex] of calculatePoleEdges(
        activePoles,
        poleData.wire[options.qualityIdx],
    )) {
        addNeighbour(mainPoleEntities[firstIndex], mainPoleEntities[secondIndex].entity_number);
        addNeighbour(mainPoleEntities[secondIndex], mainPoleEntities[firstIndex].entity_number);
    }
    roboports.forEach(roboport => addEntity({
        name: 'roboport',
        position: {
            x: roboport.x - minX + ROBOPORT_SIZE / 2,
            y: roboport.y - minY + ROBOPORT_SIZE / 2,
        },
    }));

    const dynamicLineMap = new Map<number, {
        localLine: number;
        lampIds: Map<number, BlueprintEntity>;
        targets: number[];
    }>();
    const mediaLampPathsByLine = new Map<number, Set<number>>();
    const mediaLampEntitiesByLine = new Map<number, Map<number, BlueprintEntity>>();
    const lampInfoByIndex = new Map<number, MediaLampInfo>();
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const index = y * gridW + x;
            if (!unionGrid.cells[index] || occupied[index]) continue;
            const localX = x - minX;
            const localY = y - minY;
            const localPath = verticalLines ? localY : localX;
            const localLine = verticalLines ? localX : localY;
            const mediaLampPaths = mediaLampPathsByLine.get(localLine) ?? new Set<number>();
            mediaLampPaths.add(localPath);
            mediaLampPathsByLine.set(localLine, mediaLampPaths);
            const mediaLampEntities = mediaLampEntitiesByLine.get(localLine) ?? new Map<number, BlueprintEntity>();
            mediaLampEntitiesByLine.set(localLine, mediaLampEntities);
            const constantColor = constantGrid.cells[index];
            if (constantColor) {
                const rgb = uint32ToRgb(constantColor);
                const lamp = addEntity({
                    name: 'small-lamp',
                    position: { x: localX + 0.5, y: localY + 0.5 },
                    color: { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: 1 },
                    always_on: true,
                    player_description: 'Static animation pixel: this color never changes.',
                });
                mediaLampEntities.set(localPath, lamp);
                continue;
            }
            const line = dynamicLineMap.get(localLine) ?? {
                localLine,
                lampIds: new Map<number, BlueprintEntity>(),
                targets: [],
            };
            dynamicLineMap.set(localLine, line);
            const signal = PIXEL_SIGNALS[localPath];
            const lamp = addEntity({
                name: 'small-lamp',
                position: { x: localX + 0.5, y: localY + 0.5 },
                control_behavior: {
                    circuit_enabled: true,
                    circuit_condition: { first_signal: signal, comparator: '≠', constant: 0 },
                    use_colors: true,
                    rgb_signal: signal,
                    color_mode: 2,
                },
            });
            line.lampIds.set(localPath, lamp);
            mediaLampEntities.set(localPath, lamp);
            line.targets.push(localPath);
            lampInfoByIndex.set(index, { localLine, localPath, signal });
        }
    }
    const dynamicLines = [...dynamicLineMap.values()]
        .filter(line => line.targets.length > 0)
        .sort((first, second) => first.localLine - second.localLine);
    options.onProgress?.(15);

    const lastFrameCells = animation.firstFrame.cells.slice();
    for (const transition of animation.transitions) {
        for (let index = 0; index < transition.indices.length; index++) {
            lastFrameCells[transition.indices[index]] = transition.colors[index];
        }
    }
    const addDeltaOutput = (
        outputsByLine: Map<number, Record<string, unknown>[]>,
        gridIndex: number,
        previousColor: number,
        nextColor: number,
    ) => {
        const lampInfo = lampInfoByIndex.get(gridIndex);
        if (!lampInfo) return;
        const delta = packedRgbOrZero(nextColor) - packedRgbOrZero(previousColor);
        if (!delta) return;
        const outputs = outputsByLine.get(lampInfo.localLine) ?? [];
        outputs.push({
            signal: lampInfo.signal,
            copy_count_from_input: false,
            constant: delta,
        });
        outputsByLine.set(lampInfo.localLine, outputs);
    };

    const transitionEvents: MediaTransitionEvent[] = [];
    const loopOutputs = new Map<number, Record<string, unknown>[]>();
    for (const gridIndex of lampInfoByIndex.keys()) {
        addDeltaOutput(
            loopOutputs,
            gridIndex,
            lastFrameCells[gridIndex],
            animation.firstFrame.cells[gridIndex],
        );
    }
    transitionEvents.push({ threshold: 0, outputsByLine: loopOutputs });

    const runningCells = animation.firstFrame.cells.slice();
    let startTick = Math.max(2, Math.round(animation.firstDurationTicks));
    for (let transitionIndex = 0; transitionIndex < animation.transitions.length; transitionIndex++) {
        const transition = animation.transitions[transitionIndex];
        const outputsByLine = new Map<number, Record<string, unknown>[]>();
        for (let index = 0; index < transition.indices.length; index++) {
            const gridIndex = transition.indices[index];
            const nextColor = transition.colors[index];
            addDeltaOutput(outputsByLine, gridIndex, runningCells[gridIndex], nextColor);
            runningCells[gridIndex] = nextColor;
        }
        transitionEvents.push({ threshold: startTick, outputsByLine });
        startTick += Math.max(2, Math.round(transition.durationTicks));
        if ((transitionIndex & 63) === 0 || transitionIndex === animation.transitions.length - 1) {
            options.onProgress?.(15 + 10 * (transitionIndex + 1) / Math.max(1, animation.transitions.length));
        }
    }

    // A line only needs a ROM when at least one of its pixels changes at that
    // threshold. Packing those sparse ROMs removes the old frame x line matrix
    // without changing the animation's dimensions, colors, timing, or FPS.
    const transitionEventsByLine = new Map<number, {
        frameIndex: number;
        threshold: number;
        outputs: Record<string, unknown>[];
    }[]>();
    transitionEvents.forEach((event, frameIndex) => {
        for (const [localLine, outputs] of event.outputsByLine) {
            if (!outputs.length) continue;
            const lineEvents = transitionEventsByLine.get(localLine) ?? [];
            lineEvents.push({ frameIndex, threshold: event.threshold, outputs });
            transitionEventsByLine.set(localLine, lineEvents);
        }
    });
    const resolvedAudioInstruments = resolveAudioInstruments(options.audioTrack, options.audioInstruments);
    const preparedAudioEvents = prepareAudioEvents(
        options.audioTrack,
        cycleTicks,
        resolvedAudioInstruments,
    );
    const maximumSparseRomCount = dynamicLines.reduce((maximum, line) => (
        Math.max(maximum, transitionEventsByLine.get(line.localLine)?.length ?? 0)
    ), 0);
    const transitionBankCount = Math.max(2, maximumSparseRomCount, preparedAudioEvents.length);
    options.onProgress?.(28);

    const geometry = calculateMediaAnimationControllerGeometry(
        supportRects,
        controllerSide,
        pathLength,
        dynamicLines.map(line => line.localLine),
        transitionBankCount,
    );
    const localPoint = (pathCoordinate: number, lineCoordinate: number) => (
        animationPoint(controllerSide, pathCoordinate, lineCoordinate)
    );
    const controllerSupports = geometry.powerPathCoords.map((pathCoordinate) => (
        geometry.spineLineCoords.map((lineCoordinate) => {
            const position = localPoint(pathCoordinate, lineCoordinate);
            const entity = addEntity({
                name: 'substation',
                position,
                player_description: `Media animation power and clock network (${controllerSide}).`,
                ...(options.qualityIdx > 0 ? { quality: QUALITY_NAMES[options.qualityIdx] } : {}),
            });
            return { entity, pathCoordinate, lineCoordinate };
        })
    ));
    for (let pathIndex = 0; pathIndex < controllerSupports.length; pathIndex++) {
        for (let lineIndex = 1; lineIndex < controllerSupports[pathIndex].length; lineIndex++) {
            const first = controllerSupports[pathIndex][lineIndex - 1].entity;
            const second = controllerSupports[pathIndex][lineIndex].entity;
            addNeighbour(first, second.entity_number);
            addNeighbour(second, first.entity_number);
            addWire(first, 1, second, 1);
        }
        if (pathIndex === 0) continue;
        const first = controllerSupports[pathIndex - 1][0].entity;
        const second = controllerSupports[pathIndex][0].entity;
        addNeighbour(first, second.entity_number);
        addNeighbour(second, first.entity_number);
        addWire(first, 1, second, 1);
    }
    const flatControllerSupports = controllerSupports.flat();
    const nearestControllerSupport = (pathCoordinate: number, lineCoordinate: number) => (
        flatControllerSupports.reduce((nearest, candidate) => {
            const candidateDistance = (
                (candidate.pathCoordinate - pathCoordinate) ** 2
                + (candidate.lineCoordinate - lineCoordinate) ** 2
            );
            const nearestDistance = (
                (nearest.pathCoordinate - pathCoordinate) ** 2
                + (nearest.lineCoordinate - lineCoordinate) ** 2
            );
            return candidateDistance < nearestDistance ? candidate : nearest;
        })
    );

    if (mainPoleEntities.length && flatControllerSupports.length) {
        const controllerReach = POLE_DATA.substation.wire[options.qualityIdx];
        let best: { main: BlueprintEntity; controller: BlueprintEntity; distance: number } | undefined;
        for (const main of mainPoleEntities) {
            for (const controller of flatControllerSupports) {
                const dx = main.position.x - controller.entity.position.x;
                const dy = main.position.y - controller.entity.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (
                    distance <= Math.min(controllerReach, poleData.wire[options.qualityIdx])
                    && (!best || distance < best.distance)
                ) best = { main, controller: controller.entity, distance };
            }
        }
        if (best) {
            addNeighbour(best.main, best.controller.entity_number);
            addNeighbour(best.controller, best.main.entity_number);
        }
    }

    if (options.autoRoboport && options.autoConstruction) {
        for (const coordinate of calculateMediaControllerRoboportCoordinates(geometry)) {
            addEntity({
                name: 'roboport',
                position: localPoint(coordinate.pathCoordinate, coordinate.lineCoordinate),
                player_description: 'Media controller auto-construction roboport.',
            });
        }
    }

    const clockLine = geometry.spineLineCoords[0] - 3.5;
    const combinatorDirection = animationCombinatorDirection(controllerSide);
    const timerIncrement = addEntity({
        name: 'constant-combinator',
        position: localPoint(
            geometry.memoryCoord - geometry.pathDirection * 0.5,
            clockLine,
        ),
        player_description: 'Media animation clock increment. Keep T = 1.',
        control_behavior: {
            sections: { sections: [{
                index: 1,
                filters: [{
                    index: 1,
                    type: TIMER_SIGNAL.type,
                    name: TIMER_SIGNAL.name,
                    quality: 'normal',
                    comparator: '=',
                    count: 1,
                }],
            }] },
        },
    });
    const controllerEnable = addEntity({
        name: 'constant-combinator',
        position: localPoint(
            geometry.baseRomCoord - geometry.pathDirection * 0.5,
            clockLine,
        ),
        player_description: 'Media animation controller enable. Keep I = 1.',
        control_behavior: {
            sections: { sections: [{
                index: 1,
                filters: [{
                    index: 1,
                    type: IMAGE_SIGNAL.type,
                    name: IMAGE_SIGNAL.name,
                    quality: 'normal',
                    comparator: '=',
                    count: 1,
                }],
            }] },
        },
    });
    const timer = addEntity({
        name: 'decider-combinator',
        position: localPoint(
            geometry.spineCoord - geometry.pathDirection,
            clockLine,
        ),
        direction: combinatorDirection,
        player_description: `Media cycle timer: T < ${cycleTicks}.`,
        control_behavior: {
            decider_conditions: {
                conditions: [{ first_signal: TIMER_SIGNAL, comparator: '<', constant: cycleTicks }],
                outputs: [{ signal: TIMER_SIGNAL, copy_count_from_input: true }],
            },
        },
    });
    // Green is the private feedback loop; red broadcasts the timer output.
    // This separation is what allows T = 0 to exist and sustains 30 FPS.
    addWire(timerIncrement, 2, timer, 2);
    addWire(timer, 4, timer, 2);
    addWire(timer, 3, controllerSupports[0][0].entity, 1);
    addWire(controllerEnable, 1, controllerSupports[0][0].entity, 1);

    if (options.includeHelpDisplay) {
        const seconds = (cycleTicks / 60).toLocaleString('en-US', { maximumFractionDigits: 3 });
        const audioSummary = options.audioTrack
            ? `\nAudio: ${preparedAudioEvents.length} stereo note events, synchronized at T = 0.`
            : '';
        addEntity({
            name: 'display-panel',
            position: localPoint(
                geometry.baseRomCoord - geometry.pathDirection * 0.5,
                clockLine + 2,
            ),
            icon: { type: 'virtual', name: 'signal-info' },
            text: `MEDIA ANIMATION\n${frameCount} unique frames\n${cycleTicks} ticks = ${seconds} s @ 60 UPS\nTimer: T < ${cycleTicks}\nFrame ROMs switch on their generated T thresholds.${audioSummary}\nRegenerate from the editor to change timing safely.`,
        });
    }

    if (preparedAudioEvents.length) {
        const leftSignal: FactorioSignalID = { type: 'virtual', name: 'signal-L' };
        const rightSignal: FactorioSignalID = { type: 'virtual', name: 'signal-R' };
        const audioRoms = preparedAudioEvents.map((event, eventIndex) => {
            const outputs: Record<string, unknown>[] = [];
            if (event.leftPitch !== undefined) outputs.push({
                signal: leftSignal,
                copy_count_from_input: false,
                constant: event.leftPitch,
            });
            if (event.rightPitch !== undefined) outputs.push({
                signal: rightSignal,
                copy_count_from_input: false,
                constant: event.rightPitch,
            });
            const pathCoordinate = geometry.transitionRomCoords[eventIndex];
            const rom = addEntity({
                name: 'decider-combinator',
                position: localPoint(pathCoordinate, clockLine),
                direction: combinatorDirection,
                player_description: `Generated stereo note event, T = ${event.tick}.`,
                control_behavior: {
                    decider_conditions: {
                        conditions: [{ first_signal: TIMER_SIGNAL, comparator: '=', constant: event.tick }],
                        outputs,
                    },
                },
            });
            const support = nearestControllerSupport(pathCoordinate, clockLine);
            addWire(support.entity, 1, rom, 1);
            return rom;
        });
        for (let index = 1; index < audioRoms.length; index++) {
            addWire(audioRoms[index - 1], 4, audioRoms[index], 4);
        }

        const createSpeaker = (
            signal: FactorioSignalID,
            lineOffset: number,
            channelLabel: string,
        ) => addEntity({
            name: 'programmable-speaker',
            position: localPoint(geometry.transitionRomCoords[0], clockLine + lineOffset),
            player_description: `${channelLabel} approximate audio channel. ${signal.name === 'signal-L'
                ? resolvedAudioInstruments.left.label
                : resolvedAudioInstruments.right.label} notes are synchronized to the media timer.`,
            parameters: {
                playback_volume: 0.65,
                playback_mode: 'local',
                allow_polyphony: true,
                volume_controlled_by_signal: false,
            },
            control_behavior: {
                circuit_condition: { first_signal: signal, comparator: '>', constant: 0 },
                circuit_parameters: {
                    signal_value_is_pitch: true,
                    stop_playing_sounds: false,
                    instrument_id: signal.name === 'signal-L'
                        ? resolvedAudioInstruments.left.instrumentId
                        : resolvedAudioInstruments.right.instrumentId,
                    note_id: 0,
                },
            },
        });
        const leftSpeaker = createSpeaker(leftSignal, -2, 'Left');
        const rightSpeaker = createSpeaker(rightSignal, 2, 'Right');
        addWire(audioRoms[0], 4, leftSpeaker, 2);
        addWire(audioRoms[0], 4, rightSpeaker, 2);
    }
    options.onProgress?.(32);

    const relayPoleEntities: BlueprintEntity[] = [];
    for (let lineIndex = 0; lineIndex < dynamicLines.length; lineIndex++) {
        const line = dynamicLines[lineIndex];
        const lineCoordinate = line.localLine + 0.5;
        const lineLabel = verticalLines ? 'column' : 'row';
        const memory = addEntity({
            name: 'arithmetic-combinator',
            position: localPoint(geometry.memoryCoord, lineCoordinate),
            direction: combinatorDirection,
            player_description: `Persistent media delta memory, ${lineLabel} ${line.localLine + 1}.`,
            control_behavior: {
                arithmetic_conditions: {
                    first_signal: { type: 'virtual', name: 'signal-each' },
                    second_constant: 0,
                    operation: '+',
                    output_signal: { type: 'virtual', name: 'signal-each' },
                },
            },
        });
        const baseOutputs: Record<string, unknown>[] = [];
        for (const localPath of line.lampIds.keys()) {
            const local = localPoint(localPath, line.localLine);
            const x = minX + local.x;
            const y = minY + local.y;
            const packedColor = lastFrameCells[y * gridW + x];
            if (!packedColor) continue;
            baseOutputs.push({
                signal: PIXEL_SIGNALS[localPath],
                copy_count_from_input: false,
                constant: packedRgb(packedColor),
            });
        }
        const baseRom = addEntity({
            name: 'decider-combinator',
            position: localPoint(geometry.baseRomCoord, lineCoordinate),
            direction: combinatorDirection,
            player_description: `Generated media base ROM (last frame), ${lineLabel} ${line.localLine + 1}.`,
            control_behavior: {
                decider_conditions: {
                    conditions: [{ first_signal: IMAGE_SIGNAL, comparator: '=', constant: 1 }],
                    outputs: baseOutputs,
                },
            },
        });
        const baseSupport = nearestControllerSupport(geometry.baseRomCoord, lineCoordinate);
        addWire(baseSupport.entity, 1, baseRom, 1);
        addWire(baseRom, 3, memory, 3);
        addWire(memory, 4, memory, 2);

        const transitionRoms = (transitionEventsByLine.get(line.localLine) ?? []).map((event, eventIndex) => {
            const rom = addEntity({
                name: 'decider-combinator',
                position: localPoint(geometry.transitionRomCoords[eventIndex], lineCoordinate),
                direction: combinatorDirection,
                player_description: `Generated media frame ${event.frameIndex + 1} delta ROM, ${lineLabel} ${line.localLine + 1}, T = ${event.threshold}.`,
                control_behavior: {
                    decider_conditions: {
                        conditions: [{ first_signal: TIMER_SIGNAL, comparator: '=', constant: event.threshold }],
                        outputs: event.outputs,
                    },
                },
            });
            const support = nearestControllerSupport(
                geometry.transitionRomCoords[eventIndex],
                lineCoordinate,
            );
            addWire(support.entity, 1, rom, 1);
            return rom;
        });
        if (transitionRoms.length) {
            addWire(transitionRoms[0], 4, memory, 2);
            for (let index = 1; index < transitionRoms.length; index++) {
                addWire(transitionRoms[index - 1], 4, transitionRoms[index], 4);
            }
        }

        let previous = memory;
        let previousConnector = 3;
        const circuitPath = calculateLineCircuitPath(
            line.targets,
            mediaLampPathsByLine.get(line.localLine) ?? new Set(line.lampIds.keys()),
            geometry.memoryCoord,
            geometry.pathDirection,
            localPath => {
                const point = localPoint(localPath, line.localLine);
                return isSupportOccupied(point.x, point.y);
            },
        );
        const pathEntities = new Map<number, { entity: BlueprintEntity; connector: number }>(
            [...(mediaLampEntitiesByLine.get(line.localLine) ?? line.lampIds)]
                .map(([coordinate, entity]) => [coordinate, { entity, connector: 1 }]),
        );
        for (const relayCoordinate of circuitPath.generatedRelayXs) {
            const relayPole = addEntity({
                name: 'medium-electric-pole',
                position: localPoint(relayCoordinate + 0.5, line.localLine + 0.5),
                player_description: 'Generated passive media circuit relay and local power distributor.',
                ...(options.qualityIdx > 0 ? { quality: QUALITY_NAMES[options.qualityIdx] } : {}),
            });
            relayPoleEntities.push(relayPole);
            pathEntities.set(relayCoordinate, { entity: relayPole, connector: 1 });
        }
        for (const pathCoordinate of circuitPath.path) {
            const next = pathEntities.get(pathCoordinate)!;
            if (previous.entity_number === next.entity.entity_number) continue;
            addWire(previous, previousConnector, next.entity, next.connector);
            previous = next.entity;
            previousConnector = next.connector;
        }
        if ((lineIndex & 7) === 0 || lineIndex === dynamicLines.length - 1) {
            options.onProgress?.(32 + 48 * (lineIndex + 1) / Math.max(1, dynamicLines.length));
        }
    }
    options.onProgress?.(80);

    const relayReach = POLE_DATA['medium-electric-pole'].wire[options.qualityIdx];
    const powerNodes = [
        ...mainPoleEntities.map(entity => ({ entity, reach: poleData.wire[options.qualityIdx] })),
        ...flatControllerSupports.map(({ entity }) => ({
            entity,
            reach: POLE_DATA.substation.wire[options.qualityIdx],
        })),
    ];
    const bucketSize = relayReach;
    const powerBuckets = new Map<string, { entity: BlueprintEntity; reach: number }[]>();
    const bucketKey = (position: { x: number; y: number }) => (
        `${Math.floor(position.x / bucketSize)},${Math.floor(position.y / bucketSize)}`
    );
    const addPowerNode = (node: { entity: BlueprintEntity; reach: number }) => {
        const key = bucketKey(node.entity.position);
        const bucket = powerBuckets.get(key) ?? [];
        bucket.push(node);
        powerBuckets.set(key, bucket);
    };
    powerNodes.forEach(addPowerNode);
    for (const relay of relayPoleEntities) {
        const bucketX = Math.floor(relay.position.x / bucketSize);
        const bucketY = Math.floor(relay.position.y / bucketSize);
        let nearest: { entity: BlueprintEntity; distanceSquared: number } | undefined;
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
            for (let offsetX = -1; offsetX <= 1; offsetX++) {
                const candidates = powerBuckets.get(`${bucketX + offsetX},${bucketY + offsetY}`) ?? [];
                for (const candidate of candidates) {
                    const dx = relay.position.x - candidate.entity.position.x;
                    const dy = relay.position.y - candidate.entity.position.y;
                    const distanceSquared = dx * dx + dy * dy;
                    const maximumDistance = Math.min(relayReach, candidate.reach);
                    if (
                        distanceSquared <= maximumDistance * maximumDistance
                        && (!nearest || distanceSquared < nearest.distanceSquared)
                    ) nearest = { entity: candidate.entity, distanceSquared };
                }
            }
        }
        if (nearest) {
            addNeighbour(relay, nearest.entity.entity_number);
            addNeighbour(nearest.entity, relay.entity_number);
        }
        const node = { entity: relay, reach: relayReach };
        powerNodes.push(node);
        addPowerNode(node);
    }
    options.onProgress?.(85);

    const blueprint: BlueprintJson = {
        blueprint: {
            item: 'blueprint',
            label: options.label ?? `${frameCount}-frame Factorio Media`,
            entities,
            ...(options.backgroundTile ? { tiles: createBackgroundTiles(options.backgroundTile, imageWidth, imageHeight) } : {}),
            wires,
            icons: [
                { signal: { type: 'item', name: 'small-lamp' }, index: 1 },
                { signal: { type: 'item', name: 'arithmetic-combinator' }, index: 2 },
            ],
            version: 562949958467584,
        },
    };
    return {
        bpString: encodeBlueprint(blueprint, progress => options.onProgress?.(85 + progress * 15)),
        status: 'Success',
    };
}
