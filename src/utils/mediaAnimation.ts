import { createEmptyGrid, type GridData } from './grid';

export interface MediaFrameTransition {
    indices: Uint32Array;
    colors: Uint32Array;
    durationTicks: number;
}

export interface MediaFrameThumbnail {
    width: number;
    height: number;
    rgba: Uint8Array;
}

export interface DecodedMediaAnimation {
    sourceName: string;
    sourceWidth: number;
    sourceHeight: number;
    width: number;
    height: number;
    sourceFps: number;
    requestedFpsLimit: number;
    sampledFps: number;
    factorioFps: number;
    sampledFrameCount: number;
    frameCount: number;
    durationTicks: number;
    firstDurationTicks: number;
    firstFrame: Uint32Array;
    transitions: MediaFrameTransition[];
    frameThumbnails: MediaFrameThumbnail[];
    gifTimingRepaired?: boolean;
    gifEmbeddedFrameCount?: number;
    colorMode?: 'full' | 'grayscale' | 'monochrome';
    monochromeThreshold?: number;
    differenceThreshold?: number;
}

export interface GridAnimationData {
    firstFrame: GridData;
    firstDurationTicks: number;
    transitions: MediaFrameTransition[];
}

const normalizeDurationTicks = (value: number) => Math.max(2, Math.round(value));

/** Builds the sparse animation format shared by slideshows and decoded media. */
export function createGridAnimationFromFrames(
    frames: readonly GridData[],
    durationTicks: readonly number[],
): GridAnimationData {
    if (!frames.length) throw new Error('An animation requires at least one frame.');
    if (frames.length !== durationTicks.length) {
        throw new Error('Every animation frame requires its own duration.');
    }
    const { width, height } = frames[0];
    const cellCount = width * height;
    if (frames.some(frame => (
        frame.width !== width
        || frame.height !== height
        || frame.cells.length !== cellCount
    ))) {
        throw new Error('Every animation frame must use the same grid dimensions.');
    }

    const transitions: MediaFrameTransition[] = [];
    for (let frameIndex = 1; frameIndex < frames.length; frameIndex++) {
        const previous = frames[frameIndex - 1].cells;
        const current = frames[frameIndex].cells;
        const indices: number[] = [];
        const colors: number[] = [];
        for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
            if (current[cellIndex] === previous[cellIndex]) continue;
            indices.push(cellIndex);
            colors.push(current[cellIndex]);
        }
        if (!indices.length) {
            if (transitions.length) {
                transitions[transitions.length - 1].durationTicks += normalizeDurationTicks(durationTicks[frameIndex]);
            }
            continue;
        }
        transitions.push({
            indices: Uint32Array.from(indices),
            colors: Uint32Array.from(colors),
            durationTicks: normalizeDurationTicks(durationTicks[frameIndex]),
        });
    }

    return {
        firstFrame: {
            width,
            height,
            cells: frames[0].cells.slice(),
        },
        firstDurationTicks: normalizeDurationTicks(durationTicks[0]),
        transitions,
    };
}

/**
 * Keeps selected frame indices while preserving the complete loop duration.
 * Time belonging to a removed frame is added to the preceding kept frame.
 */
export function selectAnimationFrames(
    animation: GridAnimationData,
    keptFrameIndices: readonly number[],
): GridAnimationData {
    const frameCount = animation.transitions.length + 1;
    const kept = [...new Set(keptFrameIndices)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < frameCount)
        .sort((first, second) => first - second);
    if (!kept.length) throw new Error('At least one animation frame must be kept.');
    if (kept.length === frameCount) return animation;

    const keptSet = new Set(kept);
    const frames: GridData[] = [];
    const durations: number[] = [];
    const runningCells = animation.firstFrame.cells.slice();
    let leadingRemovedDuration = 0;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const duration = frameIndex === 0
            ? normalizeDurationTicks(animation.firstDurationTicks)
            : normalizeDurationTicks(animation.transitions[frameIndex - 1].durationTicks);
        if (keptSet.has(frameIndex)) {
            frames.push({
                width: animation.firstFrame.width,
                height: animation.firstFrame.height,
                cells: runningCells.slice(),
            });
            durations.push(duration);
        } else if (durations.length) {
            durations[durations.length - 1] += duration;
        } else {
            leadingRemovedDuration += duration;
        }

        const nextTransition = animation.transitions[frameIndex];
        if (!nextTransition) continue;
        for (let patchIndex = 0; patchIndex < nextTransition.indices.length; patchIndex++) {
            runningCells[nextTransition.indices[patchIndex]] = nextTransition.colors[patchIndex];
        }
    }
    if (leadingRemovedDuration) durations[durations.length - 1] += leadingRemovedDuration;
    return createGridAnimationFromFrames(frames, durations);
}

export function evenlySpacedFrameIndices(frameCount: number, maximumFrames: number): number[] {
    const normalizedCount = Math.max(1, Math.floor(frameCount));
    const normalizedMaximum = Math.max(1, Math.floor(maximumFrames));
    if (normalizedCount <= normalizedMaximum) {
        return Array.from({ length: normalizedCount }, (_, index) => index);
    }
    if (normalizedMaximum === 1) return [0];
    const indices = new Set<number>();
    for (let index = 0; index < normalizedMaximum; index++) {
        indices.add(Math.round(index * (normalizedCount - 1) / (normalizedMaximum - 1)));
    }
    return [...indices].sort((first, second) => first - second);
}

export function selectDecodedMediaFrames(
    decoded: DecodedMediaAnimation,
    keptFrameIndices: readonly number[],
): DecodedMediaAnimation {
    const selected = selectAnimationFrames({
        firstFrame: {
            width: decoded.width,
            height: decoded.height,
            cells: decoded.firstFrame,
        },
        firstDurationTicks: decoded.firstDurationTicks,
        transitions: decoded.transitions,
    }, keptFrameIndices);
    const kept = [...new Set(keptFrameIndices)]
        .filter(index => index >= 0 && index < decoded.frameCount)
        .sort((first, second) => first - second);
    const keptSet = new Set(kept);
    const thumbnailIndices: number[] = [];
    const runningCells = decoded.firstFrame.slice();
    let previousKeptCells: Uint32Array | undefined;
    for (let frameIndex = 0; frameIndex < decoded.frameCount; frameIndex++) {
        if (keptSet.has(frameIndex)) {
            let changed = !previousKeptCells;
            if (previousKeptCells) {
                for (let cellIndex = 0; cellIndex < runningCells.length; cellIndex++) {
                    if (runningCells[cellIndex] === previousKeptCells[cellIndex]) continue;
                    changed = true;
                    break;
                }
            }
            if (changed) {
                thumbnailIndices.push(frameIndex);
                previousKeptCells = runningCells.slice();
            }
        }
        const nextTransition = decoded.transitions[frameIndex];
        if (!nextTransition) continue;
        for (let patchIndex = 0; patchIndex < nextTransition.indices.length; patchIndex++) {
            runningCells[nextTransition.indices[patchIndex]] = nextTransition.colors[patchIndex];
        }
    }
    const durationTicks = animationDurationTicks(selected);
    return {
        ...decoded,
        firstFrame: selected.firstFrame.cells,
        firstDurationTicks: selected.firstDurationTicks,
        transitions: selected.transitions,
        frameCount: selected.transitions.length + 1,
        durationTicks,
        factorioFps: durationTicks > 0 ? (selected.transitions.length + 1) * 60 / durationTicks : 0,
        frameThumbnails: thumbnailIndices.map(index => decoded.frameThumbnails[index]).filter(Boolean),
    };
}

/**
 * Places a compact FFmpeg animation at a fixed position in the editor's
 * 1,024 x 1,024 canvas. Only the keyframe is expanded; subsequent images stay
 * as sparse index/color patches so long clips do not allocate one full canvas
 * per frame.
 */
export function placeDecodedAnimation(
    decoded: DecodedMediaAnimation,
    gridWidth: number,
    gridHeight: number,
    startX: number,
    startY: number,
): GridAnimationData {
    const firstFrame = createEmptyGrid(gridWidth, gridHeight);
    for (let localIndex = 0; localIndex < decoded.firstFrame.length; localIndex++) {
        const localX = localIndex % decoded.width;
        const localY = Math.floor(localIndex / decoded.width);
        const gridX = startX + localX;
        const gridY = startY + localY;
        if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) continue;
        firstFrame.cells[gridY * gridWidth + gridX] = decoded.firstFrame[localIndex];
    }

    const transitions = decoded.transitions.map((transition) => {
        const indices = new Uint32Array(transition.indices.length);
        const colors = new Uint32Array(transition.colors.length);
        let outputIndex = 0;
        for (let index = 0; index < transition.indices.length; index++) {
            const localIndex = transition.indices[index];
            const localX = localIndex % decoded.width;
            const localY = Math.floor(localIndex / decoded.width);
            const gridX = startX + localX;
            const gridY = startY + localY;
            if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) continue;
            indices[outputIndex] = gridY * gridWidth + gridX;
            colors[outputIndex] = transition.colors[index];
            outputIndex++;
        }
        return {
            indices: outputIndex === indices.length ? indices : indices.slice(0, outputIndex),
            colors: outputIndex === colors.length ? colors : colors.slice(0, outputIndex),
            durationTicks: normalizeDurationTicks(transition.durationTicks),
        };
    });

    return {
        firstFrame,
        firstDurationTicks: normalizeDurationTicks(decoded.firstDurationTicks),
        transitions,
    };
}

export function renderAnimationFrame(
    animation: GridAnimationData,
    frameIndex: number,
): GridData {
    const cells = animation.firstFrame.cells.slice();
    const lastTransition = Math.min(
        animation.transitions.length,
        Math.max(0, Math.round(frameIndex)),
    );
    for (let transitionIndex = 0; transitionIndex < lastTransition; transitionIndex++) {
        const transition = animation.transitions[transitionIndex];
        for (let index = 0; index < transition.indices.length; index++) {
            cells[transition.indices[index]] = transition.colors[index];
        }
    }
    return {
        width: animation.firstFrame.width,
        height: animation.firstFrame.height,
        cells,
    };
}

export function createAnimationUnionGrid(
    animation: GridAnimationData,
): GridData {
    const cells = new Uint32Array(animation.firstFrame.cells.length);
    for (let index = 0; index < cells.length; index++) {
        if (animation.firstFrame.cells[index]) cells[index] = animation.firstFrame.cells[index];
    }
    for (const transition of animation.transitions) {
        for (let index = 0; index < transition.indices.length; index++) {
            const cellIndex = transition.indices[index];
            if (transition.colors[index]) cells[cellIndex] = transition.colors[index];
        }
    }
    return {
        width: animation.firstFrame.width,
        height: animation.firstFrame.height,
        cells,
    };
}

/** Returns pixels that are visible and never change anywhere in the loop. */
export function createAnimationConstantGrid(animation: GridAnimationData): GridData {
    const changed = new Uint8Array(animation.firstFrame.cells.length);
    for (const transition of animation.transitions) {
        for (const cellIndex of transition.indices) changed[cellIndex] = 1;
    }
    const cells = new Uint32Array(animation.firstFrame.cells.length);
    for (let index = 0; index < cells.length; index++) {
        if (!changed[index] && animation.firstFrame.cells[index]) {
            cells[index] = animation.firstFrame.cells[index];
        }
    }
    return {
        width: animation.firstFrame.width,
        height: animation.firstFrame.height,
        cells,
    };
}

export function animationDurationTicks(animation: GridAnimationData): number {
    return animation.firstDurationTicks + animation.transitions.reduce(
        (total, transition) => total + transition.durationTicks,
        0,
    );
}
