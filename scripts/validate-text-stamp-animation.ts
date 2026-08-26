import assert from 'node:assert/strict';
import { createEmptyGrid } from '../src/utils/grid';
import {
    composeGridAnimations,
    getGridAnimationTracks,
    renderGridAnimationAtTick,
    type GridAnimationData,
} from '../src/utils/mediaAnimation';
import { keyboardPanDirection } from '../src/utils/keyboardNavigation';
import {
    DEFAULT_TEXT_VIEWPORT_WIDTH,
    EMOJI_ANIMATION_FRAME_TICKS,
    animationFrameIndexForTimelineStep,
    createSparseViewportAnimation,
    insertAtTextSelection,
    placeSparseStampAnimation,
    reconcileTextGraphemeAttachments,
    renderStampAnimationAtTick,
    stampAnimationDurationTicks,
    stampAnimationSampleCount,
    type RenderedText,
    type StampBuffer,
} from '../src/utils/stamp';

assert.equal(DEFAULT_TEXT_VIEWPORT_WIDTH, 256);
assert.equal(EMOJI_ANIMATION_FRAME_TICKS, 12);

const animatedAttachment = { emoji: '🔥', id: 'fire-animation' };
assert.deepEqual(
    insertAtTextSelection('AB', 1, 1, '🔥'),
    { text: 'A🔥B', graphemeIndex: 1, caret: 3 },
    'animated emoji should be inserted at the textarea cursor',
);
assert.deepEqual(
    reconcileTextGraphemeAttachments('A🔥B', 'prefix A🔥B', { 1: animatedAttachment }),
    { 8: animatedAttachment },
    'typing before an animated emoji should keep its raster animation attached',
);
assert.deepEqual(
    reconcileTextGraphemeAttachments('A🔥B', 'AB', { 1: animatedAttachment }),
    {},
    'deleting an animated emoji should remove its raster animation attachment',
);
assert.equal(keyboardPanDirection('KeyW', 'w'), 'up');
assert.equal(keyboardPanDirection('KeyW', 'z'), 'up');
assert.equal(keyboardPanDirection('KeyA', 'q'), 'left');
assert.equal(keyboardPanDirection('', 'ArrowRight'), 'right');

const rasterEmoji: StampBuffer = {
    w: 2,
    h: 1,
    data: Uint32Array.of(10, 0),
    animation: {
        firstDurationTicks: 6,
        sourceFrameCount: 3,
        transitions: [{
            indices: Uint32Array.of(0, 1),
            colors: Uint32Array.of(20, 30),
            durationTicks: 12,
        }, {
            indices: Uint32Array.of(0),
            colors: Uint32Array.of(40),
            durationTicks: 6,
        }],
    },
};
assert.equal(stampAnimationDurationTicks(rasterEmoji), 24);
assert.equal(stampAnimationSampleCount(rasterEmoji), 2);
assert.deepEqual([...renderStampAnimationAtTick(rasterEmoji, 0)], [10, 0]);
assert.deepEqual([...renderStampAnimationAtTick(rasterEmoji, 6)], [20, 30]);
assert.deepEqual([...renderStampAnimationAtTick(rasterEmoji, 18)], [40, 30]);
assert.deepEqual([...renderStampAnimationAtTick(rasterEmoji, 24)], [10, 0]);

const renderedWidth = 512;
const rendered: RenderedText = {
    width: renderedWidth,
    height: 1,
    cells: Uint32Array.from(
        { length: renderedWidth },
        (_, index) => index % 2 === 0 ? 0xffeeddcc : 0,
    ),
};
const viewportWidth = 64;
const viewportHeight = 5;
const scrollFrameCount = renderedWidth - (viewportWidth - 2) + 1;
const durationTicks = 3;
const sparse = await createSparseViewportAnimation(
    [rendered],
    viewportWidth,
    viewportHeight,
    scrollFrameCount,
    scrollFrameCount,
    durationTicks,
);

assert.equal(sparse.data.length, viewportWidth * viewportHeight);
assert.ok(sparse.data.some(Boolean));
assert.ok(sparse.animation);
assert.equal(sparse.animation.sourceFrameCount, scrollFrameCount);
assert.equal(sparse.animation.transitions.length, scrollFrameCount - 1);
assert.equal(
    sparse.animation.firstDurationTicks
        + sparse.animation.transitions.reduce((total, transition) => total + transition.durationTicks, 0),
    scrollFrameCount * durationTicks,
);

const sparseCellCount = sparse.animation.transitions.reduce(
    (total, transition) => total + transition.indices.length,
    0,
);
assert.ok(sparseCellCount < viewportWidth * viewportHeight * scrollFrameCount);

const grid = createEmptyGrid(128, 16);
const startX = 32;
const startY = 4;
for (let localIndex = 0; localIndex < sparse.data.length; localIndex++) {
    const color = sparse.data[localIndex];
    if (!color) continue;
    const localX = localIndex % viewportWidth;
    const localY = Math.floor(localIndex / viewportWidth);
    grid.cells[(startY + localY) * grid.width + startX + localX] = color;
}

const placed = await placeSparseStampAnimation({
    w: viewportWidth,
    h: viewportHeight,
    animation: sparse.animation,
}, grid, startX, startY, 1);

assert.equal(placed.animation.transitions.length, scrollFrameCount - 1);
assert.ok(placed.animation.transitions.every(transition => (
    transition.indices.every(index => index < grid.width * grid.height)
)));
assert.ok(placed.unionGrid.cells.some(Boolean));
assert.equal(
    placed.animation.firstDurationTicks
        + placed.animation.transitions.reduce((total, transition) => total + transition.durationTicks, 0),
    scrollFrameCount * durationTicks,
);

const horizontalSource: RenderedText = {
    width: 4,
    height: 1,
    cells: Uint32Array.from([1, 2, 3, 4]),
};
const leftToRight = await createSparseViewportAnimation(
    [horizontalSource],
    4,
    3,
    3,
    3,
    6,
    'left-to-right',
);
assert.deepEqual(
    [...leftToRight.data.slice(5, 7)],
    [3, 4],
    'Left-to-right starts at the far edge and moves toward the source origin.',
);

const verticalSource: RenderedText = {
    width: 1,
    height: 4,
    cells: Uint32Array.from([1, 2, 3, 4]),
};
const topToBottom = await createSparseViewportAnimation(
    [verticalSource],
    3,
    4,
    3,
    3,
    6,
    'top-to-bottom',
);
const bottomToTop = await createSparseViewportAnimation(
    [verticalSource],
    3,
    4,
    3,
    3,
    6,
    'bottom-to-top',
);
assert.deepEqual([topToBottom.data[4], topToBottom.data[7]], [3, 4]);
assert.deepEqual([bottomToTop.data[4], bottomToTop.data[7]], [1, 2]);

const animatedFrames: RenderedText[] = [1, 2, 3, 4].map(color => ({
    width: 1,
    height: 1,
    cells: Uint32Array.of(color),
}));
const independentlyTimedEmoji = await createSparseViewportAnimation(
    animatedFrames,
    3,
    3,
    1,
    32,
    3,
    'right-to-left',
    EMOJI_ANIMATION_FRAME_TICKS,
);
assert.ok(independentlyTimedEmoji.animation);
assert.equal(independentlyTimedEmoji.animation.firstDurationTicks, EMOJI_ANIMATION_FRAME_TICKS);
assert.equal(independentlyTimedEmoji.animation.transitions.length, 7);
assert.equal(independentlyTimedEmoji.animation.transitions[0].colors[0], 2);
assert.equal(independentlyTimedEmoji.animation.transitions[0].durationTicks, EMOJI_ANIMATION_FRAME_TICKS);
assert.deepEqual(
    independentlyTimedEmoji.animation.transitions.map(transition => transition.colors[0]),
    [2, 3, 4, 1, 2, 3, 4],
);
assert.equal(
    animationFrameIndexForTimelineStep(
        32,
        32,
        animatedFrames.length,
        3,
        EMOJI_ANIMATION_FRAME_TICKS,
    ),
    0,
    'The emoji clock must return to frame zero at the scrolling loop boundary.',
);

const shortScrollFrames: RenderedText[] = [1, 2, 3, 4].map(color => ({
    width: 4,
    height: 1,
    cells: Uint32Array.from({ length: 4 }, () => color),
}));
const shortScrollEmoji = await createSparseViewportAnimation(
    shortScrollFrames,
    3,
    3,
    4,
    4,
    2,
    'right-to-left',
    EMOJI_ANIMATION_FRAME_TICKS,
);
assert.ok(shortScrollEmoji.animation);
assert.deepEqual(
    shortScrollEmoji.animation.transitions.map(transition => transition.colors[0]),
    [2, 3, 4],
    'Even a short overflow must animate every generic emoji frame instead of staying static.',
);

const baseFirstFrame = createEmptyGrid(8, 2);
baseFirstFrame.cells[1] = 10;
baseFirstFrame.cells[3] = 90;
const baseAnimation: GridAnimationData = {
    firstFrame: baseFirstFrame,
    firstDurationTicks: 4,
    transitions: [{
        indices: Uint32Array.of(1, 3),
        colors: Uint32Array.of(11, 91),
        durationTicks: 4,
    }],
};
const overlayFirstFrame = {
    ...baseFirstFrame,
    cells: baseFirstFrame.cells.slice(),
};
overlayFirstFrame.cells[3] = 20;
const overlayAnimation: GridAnimationData = {
    firstFrame: overlayFirstFrame,
    firstDurationTicks: 6,
    transitions: [{
        indices: Uint32Array.of(3),
        colors: Uint32Array.of(21),
        durationTicks: 6,
    }],
};
const composed = composeGridAnimations(
    baseAnimation,
    overlayAnimation,
    { x: 3, y: 0, width: 1, height: 1 },
    64,
);
const composedTracks = getGridAnimationTracks(composed);
assert.equal(composedTracks.length, 2, 'Separately placed animated stamps must keep two independent clocks.');
assert.deepEqual(
    composedTracks.map(track => track.firstDurationTicks + track.transitions.reduce(
        (total, transition) => total + transition.durationTicks,
        0,
    )),
    [8, 12],
    'Independent loop durations must remain unchanged instead of expanding to their least common multiple.',
);
const cellsAtTick = (tick: number) => renderGridAnimationAtTick(composed, tick).cells;
assert.deepEqual([cellsAtTick(0)[1], cellsAtTick(0)[3]], [10, 20]);
assert.deepEqual([cellsAtTick(4)[1], cellsAtTick(4)[3]], [11, 20]);
assert.deepEqual([cellsAtTick(6)[1], cellsAtTick(6)[3]], [11, 21]);
assert.deepEqual([cellsAtTick(8)[1], cellsAtTick(8)[3]], [10, 21]);
assert.deepEqual([cellsAtTick(12)[1], cellsAtTick(12)[3]], [11, 20]);
assert.deepEqual([cellsAtTick(23)[1], cellsAtTick(23)[3]], [11, 21]);
assert.equal(
    composedTracks.some(track => track.transitions.some(transition => (
        transition.indices.some((index, patchIndex) => index === 3 && transition.colors[patchIndex] === 91)
    ))),
    false,
    'The newer stamp rectangle must suppress every older animation patch below it.',
);

console.log(JSON.stringify({
    defaultViewportWidth: DEFAULT_TEXT_VIEWPORT_WIDTH,
    sourceFrames: scrollFrameCount,
    transitions: placed.animation.transitions.length,
    sparseCellCount,
    fullFrameCellCount: viewportWidth * viewportHeight * scrollFrameCount,
    emojiFrameTicks: EMOJI_ANIMATION_FRAME_TICKS,
    independentTrackFrames: composedTracks.map(track => track.transitions.length + 1),
    independentTrackDurations: [8, 12],
}));
