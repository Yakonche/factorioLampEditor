export interface GridData {
    width: number;
    height: number;
    /** 0 = empty, otherwise 0xAABBGGRR (little-endian RGBA in memory). */
    cells: Uint32Array;
}

export interface GridPatch {
    indices: Uint32Array;
    before: Uint32Array;
    after: Uint32Array;
}

export function colorToUint32(color: string | null): number {
    if (!color) return 0;
    const value = Number.parseInt(color.startsWith('#') ? color.slice(1) : color, 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

export function uint32ToRgb(color: number) {
    return { r: color & 0xff, g: (color >>> 8) & 0xff, b: (color >>> 16) & 0xff };
}

export function uint32ToCss(color: number): string {
    const { r, g, b } = uint32ToRgb(color);
    return `rgb(${r} ${g} ${b})`;
}

export function createEmptyGrid(width: number, height: number): GridData {
    return { width, height, cells: new Uint32Array(width * height) };
}

export function cloneGrid(grid: GridData): GridData {
    return { width: grid.width, height: grid.height, cells: grid.cells.slice() };
}

export function createGridPatch(beforeGrid: GridData, afterGrid: GridData): GridPatch | null {
    const beforeCells = beforeGrid.cells;
    const afterCells = afterGrid.cells;
    if (beforeCells.length !== afterCells.length) throw new Error('Grid dimensions do not match.');

    const changed: number[] = [];
    for (let index = 0; index < beforeCells.length; index++) {
        if (beforeCells[index] !== afterCells[index]) changed.push(index);
    }
    if (changed.length === 0) return null;

    const indices = Uint32Array.from(changed);
    const before = new Uint32Array(indices.length);
    const after = new Uint32Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        before[i] = beforeCells[index];
        after[i] = afterCells[index];
    }
    return { indices, before, after };
}

export function applyGridPatch(grid: GridData, patch: GridPatch, direction: 'undo' | 'redo') {
    const values = direction === 'undo' ? patch.before : patch.after;
    for (let i = 0; i < patch.indices.length; i++) grid.cells[patch.indices[i]] = values[i];
}

/** Iterative flood fill to avoid stack overflow on large grids. */
export function floodFill(grid: GridData, sx: number, sy: number, fillColor: number): GridData {
    if (sx < 0 || sx >= grid.width || sy < 0 || sy >= grid.height) return grid;
    const startIndex = sy * grid.width + sx;
    const targetColor = grid.cells[startIndex];
    if (targetColor === fillColor) return grid;

    const next = cloneGrid(grid);
    const stack: number[] = [startIndex];
    while (stack.length > 0) {
        const index = stack.pop();
        if (index === undefined || next.cells[index] !== targetColor) continue;
        next.cells[index] = fillColor;
        const x = index % next.width;
        const y = Math.floor(index / next.width);
        if (x > 0) stack.push(index - 1);
        if (x + 1 < next.width) stack.push(index + 1);
        if (y > 0) stack.push(index - next.width);
        if (y + 1 < next.height) stack.push(index + next.width);
    }
    return next;
}

export function countLamps(grid: GridData): number {
    let count = 0;
    for (let index = 0; index < grid.cells.length; index++) {
        if (grid.cells[index] !== 0) count++;
    }
    return count;
}
