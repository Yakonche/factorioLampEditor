import assert from 'node:assert/strict';
import {
    DEFAULT_SCROLL_STEP_TICKS,
    FACTORIO_TICKS_PER_SECOND,
    MAX_SCROLL_STEP_TICKS,
    MIN_SCROLL_STEP_TICKS,
    clampScrollStepTicks,
    formatScrollTimingValue,
    scrollCellsPerSecondToTicks,
    scrollSecondsToTicks,
    scrollTicksToCellsPerSecond,
    scrollTicksToSeconds,
} from '../src/utils/scrollTiming';

assert.equal(FACTORIO_TICKS_PER_SECOND, 60);
assert.equal(DEFAULT_SCROLL_STEP_TICKS, 6);
assert.equal(scrollSecondsToTicks(0.1), 6);
assert.equal(scrollTicksToSeconds(6), 0.1);
assert.equal(scrollCellsPerSecondToTicks(10), 6);
assert.equal(scrollTicksToCellsPerSecond(6), 10);

assert.equal(clampScrollStepTicks(1), MIN_SCROLL_STEP_TICKS);
assert.equal(clampScrollStepTicks(Number.POSITIVE_INFINITY), DEFAULT_SCROLL_STEP_TICKS);
assert.equal(scrollSecondsToTicks(0.001), MIN_SCROLL_STEP_TICKS);
assert.equal(scrollSecondsToTicks(999), MAX_SCROLL_STEP_TICKS);
assert.equal(scrollCellsPerSecondToTicks(999), MIN_SCROLL_STEP_TICKS);
assert.equal(scrollCellsPerSecondToTicks(0), MAX_SCROLL_STEP_TICKS);
assert.equal(scrollCellsPerSecondToTicks(0.001), MAX_SCROLL_STEP_TICKS);

assert.equal(scrollSecondsToTicks(0.11), 7);
assert.equal(scrollCellsPerSecondToTicks(9), 7);
assert.equal(formatScrollTimingValue(scrollTicksToSeconds(2)), '0.033333');
assert.equal(formatScrollTimingValue(scrollTicksToCellsPerSecond(7)), '8.571429');

for (let ticks = MIN_SCROLL_STEP_TICKS; ticks <= MAX_SCROLL_STEP_TICKS; ticks += 1) {
    assert.equal(scrollSecondsToTicks(scrollTicksToSeconds(ticks)), ticks);
    assert.equal(scrollCellsPerSecondToTicks(scrollTicksToCellsPerSecond(ticks)), ticks);
}

console.log(JSON.stringify({
    minimumTicks: MIN_SCROLL_STEP_TICKS,
    maximumTicks: MAX_SCROLL_STEP_TICKS,
    defaultTicks: DEFAULT_SCROLL_STEP_TICKS,
    defaultSeconds: scrollTicksToSeconds(DEFAULT_SCROLL_STEP_TICKS),
    defaultCellsPerSecond: scrollTicksToCellsPerSecond(DEFAULT_SCROLL_STEP_TICKS),
}));
