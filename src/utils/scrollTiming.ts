export const FACTORIO_TICKS_PER_SECOND = 60;
export const MIN_SCROLL_STEP_TICKS = 2;
export const MAX_SCROLL_STEP_TICKS = 60 * 60;
export const DEFAULT_SCROLL_STEP_TICKS = 6;

export const clampScrollStepTicks = (ticks: number): number => {
    if (!Number.isFinite(ticks)) return DEFAULT_SCROLL_STEP_TICKS;
    return Math.max(
        MIN_SCROLL_STEP_TICKS,
        Math.min(MAX_SCROLL_STEP_TICKS, Math.round(ticks)),
    );
};

export const scrollSecondsToTicks = (seconds: number): number => (
    clampScrollStepTicks(seconds * FACTORIO_TICKS_PER_SECOND)
);

export const scrollCellsPerSecondToTicks = (cellsPerSecond: number): number => {
    if (!Number.isFinite(cellsPerSecond) || cellsPerSecond <= 0) {
        return MAX_SCROLL_STEP_TICKS;
    }
    return clampScrollStepTicks(FACTORIO_TICKS_PER_SECOND / cellsPerSecond);
};

export const scrollTicksToSeconds = (ticks: number): number => (
    clampScrollStepTicks(ticks) / FACTORIO_TICKS_PER_SECOND
);

export const scrollTicksToCellsPerSecond = (ticks: number): number => (
    FACTORIO_TICKS_PER_SECOND / clampScrollStepTicks(ticks)
);

export const formatScrollTimingValue = (value: number): string => {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
};
