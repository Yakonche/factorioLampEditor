import assert from 'node:assert/strict';
import { createEmptyGrid } from '../src/utils/grid';
import {
    DEFAULT_TEXT_VIEWPORT_WIDTH,
    EMOJI_ANIMATION_FRAME_TICKS,
    animationFrameIndexForTimelineStep,
    createSparseViewportAnimation,
    placeSparseStampAnimation,
    type RenderedText,
} from '../src/utils/stamp';

assert.equal(DEFAULT_TEXT_VIEWPORT_WIDTH, 512);
assert.equal(EMOJI_ANIMATION_FRAME_TICKS, 12);

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

console.log(JSON.stringify({
    defaultViewportWidth: DEFAULT_TEXT_VIEWPORT_WIDTH,
    sourceFrames: scrollFrameCount,
    transitions: placed.animation.transitions.length,
    sparseCellCount,
    fullFrameCellCount: viewportWidth * viewportHeight * scrollFrameCount,
    emojiFrameTicks: EMOJI_ANIMATION_FRAME_TICKS,
}));
