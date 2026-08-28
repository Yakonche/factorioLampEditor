import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { CameraState } from '../utils/geometry';
import { getWorldCoords } from '../utils/geometry';
import { uint32ToCss, uint32ToRgb, type GridData } from '../utils/grid';
import {
    PIXEL_SIZE,
    GRID_W,
    GRID_H,
    POLE_DATA,
    MIN_ZOOM,
    MAX_ZOOM,
    ROBOPORT_CONSTRUCTION_RADIUS,
    ROBOPORT_SIZE,
} from '../constants';
import type { StampBuffer } from '../utils/stamp';
import type { ActivePole, ActiveRoboport, BlueprintPreviewEntity, BlueprintPreviewKind } from '../utils/blueprint';
import { buildPreviewSpatialIndex, previewEntitiesInBounds } from '../utils/previewSpatialIndex';
import type {
    FactorioTextureId,
    FactorioTextureSet,
    FactorioTextureSprite,
    GameTerrainTexture,
} from '../utils/factorioTextures';

const PREVIEW_ENTITY_STYLE: Record<BlueprintPreviewKind, { fill: string; stroke: string; text: string }> = {
    'decider-combinator': { fill: 'rgba(6, 182, 212, 0.48)', stroke: '#67e8f9', text: 'D' },
    'arithmetic-combinator': { fill: 'rgba(236, 72, 153, 0.48)', stroke: '#f9a8d4', text: 'A' },
    'constant-combinator': { fill: 'rgba(249, 115, 22, 0.5)', stroke: '#fdba74', text: 'C' },
    'display-panel': { fill: 'rgba(168, 85, 247, 0.5)', stroke: '#d8b4fe', text: 'i' },
    'controller-substation': { fill: 'rgba(99, 102, 241, 0.35)', stroke: '#a5b4fc', text: 'S' },
    'controller-roboport': { fill: 'rgba(16, 185, 129, 0.3)', stroke: '#6ee7b7', text: 'R' },
    'relay-pole': { fill: 'rgba(20, 184, 166, 0.44)', stroke: '#5eead4', text: 'P' },
    'programmable-speaker': { fill: 'rgba(34, 211, 238, 0.42)', stroke: '#a5f3fc', text: '♪' },
};

const PREVIEW_ENTITY_TEXTURE: Record<BlueprintPreviewKind, FactorioTextureId> = {
    'decider-combinator': 'decider-combinator',
    'arithmetic-combinator': 'arithmetic-combinator',
    'constant-combinator': 'constant-combinator',
    'display-panel': 'display-panel',
    'controller-substation': 'substation',
    'controller-roboport': 'roboport',
    'relay-pole': 'medium-electric-pole',
    'programmable-speaker': 'programmable-speaker',
};

const GAME_LAMP_TEXTURE_TILE_SIZE = 64;
const GAME_LAMP_TEXTURE_DENSITY = 2;
const MAX_INDIVIDUAL_GAME_LAMPS_PER_VIEW = 40_000;
const FACTORIO_SOURCE_TILE_SIZE = 32;

const drawPlacedTexture = (
    context: CanvasRenderingContext2D,
    texture: FactorioTextureSprite,
    anchorX: number,
    anchorY: number,
    frame = 0,
) => {
    const worldPixelsPerSourcePixel = PIXEL_SIZE / FACTORIO_SOURCE_TILE_SIZE;
    const renderedWidth = texture.frameWidth * texture.scale * worldPixelsPerSourcePixel;
    const renderedHeight = texture.frameHeight * texture.scale * worldPixelsPerSourcePixel;
    const shiftedX = anchorX + texture.shiftX * worldPixelsPerSourcePixel;
    const shiftedY = anchorY + texture.shiftY * worldPixelsPerSourcePixel;
    const framesPerRow = Math.max(1, Math.floor(texture.bitmap.width / texture.frameWidth));
    const normalizedFrame = Math.max(0, frame % framesPerRow);
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
        texture.bitmap,
        normalizedFrame * texture.frameWidth,
        0,
        texture.frameWidth,
        texture.frameHeight,
        shiftedX - renderedWidth / 2,
        shiftedY - renderedHeight / 2,
        renderedWidth,
        renderedHeight,
    );
    context.restore();
};

const quantizedLampColor = (color: number) => {
    if (!color) return 0;
    const { r, g, b } = uint32ToRgb(color);
    const quantize = (channel: number) => Math.round(channel / 17) * 17;
    return 0x1000000 | (quantize(r) << 16) | (quantize(g) << 8) | quantize(b);
};

const createGameLampTile = (textures: FactorioTextureSet, color: number) => {
    const tile = document.createElement('canvas');
    tile.width = GAME_LAMP_TEXTURE_TILE_SIZE * GAME_LAMP_TEXTURE_DENSITY;
    tile.height = GAME_LAMP_TEXTURE_TILE_SIZE * GAME_LAMP_TEXTURE_DENSITY;
    const context = tile.getContext('2d');
    if (!context) return tile;
    context.scale(GAME_LAMP_TEXTURE_DENSITY, GAME_LAMP_TEXTURE_DENSITY);
    const normalizedColor = quantizedLampColor(color);
    const lit = normalizedColor !== 0;
    const r = (normalizedColor >>> 16) & 0xff;
    const g = (normalizedColor >>> 8) & 0xff;
    const b = normalizedColor & 0xff;
    const anchor = GAME_LAMP_TEXTURE_TILE_SIZE / 2;

    if (lit) {
        const glow = context.createRadialGradient(anchor, anchor, 1, anchor, anchor, 28);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.7)`);
        glow.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.35)`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        context.fillStyle = glow;
        context.fillRect(0, 0, GAME_LAMP_TEXTURE_TILE_SIZE, GAME_LAMP_TEXTURE_TILE_SIZE);
    }

    const base = textures['small-lamp'];
    if (base) drawPlacedTexture(context, base, anchor, anchor);
    const light = textures['small-lamp-on'];
    if (lit && light) {
        const coloredLight = document.createElement('canvas');
        coloredLight.width = tile.width;
        coloredLight.height = tile.height;
        const lightContext = coloredLight.getContext('2d');
        if (lightContext) {
            lightContext.scale(GAME_LAMP_TEXTURE_DENSITY, GAME_LAMP_TEXTURE_DENSITY);
            drawPlacedTexture(lightContext, light, anchor, anchor);
            lightContext.globalCompositeOperation = 'source-in';
            lightContext.fillStyle = `rgb(${r} ${g} ${b})`;
            lightContext.fillRect(0, 0, GAME_LAMP_TEXTURE_TILE_SIZE, GAME_LAMP_TEXTURE_TILE_SIZE);
            context.globalCompositeOperation = 'screen';
            context.drawImage(
                coloredLight,
                0,
                0,
                coloredLight.width,
                coloredLight.height,
                0,
                0,
                GAME_LAMP_TEXTURE_TILE_SIZE,
                GAME_LAMP_TEXTURE_TILE_SIZE,
            );
            context.globalCompositeOperation = 'source-over';
        }
    }
    return tile;
};

type HoverTooltip = {
    title: string;
    description: string;
    color: string;
    tileX: number;
    tileY: number;
    screenX: number;
    screenY: number;
};

interface CanvasProps {
    gridData: GridData;
    gridVersion: number;
    camera: CameraState;
    setCamera: (c: CameraState) => void;

    // Interactions
    onInteractStart: (e: React.MouseEvent | React.TouchEvent, x: number, y: number) => void;
    onInteractMove: (e: React.MouseEvent | React.TouchEvent, x: number, y: number) => void;
    onInteractEnd: (e: React.MouseEvent | React.TouchEvent) => void;
    onLampClick?: (x: number, y: number) => void;

    // Visuals
    stampMode: 'text' | 'image' | 'audio' | null;
    stampBuffer: StampBuffer | null;
    stampScale: number;

    // Viewport controls
    fitView?: {
        centerX: number;
        centerY: number;
        width: number;
        height: number;
    };

    autoPole: boolean;
    activePoles?: ActivePole[];
    poleType: string;
    qualityIdx: number;
    autoRoboport: boolean;
    activeRoboports?: ActiveRoboport[];
    previewEntities?: BlueprintPreviewEntity[];
    hasAlternateFrameLamp?: (x: number, y: number) => boolean;
    /** Union of every animation frame, used to draw currently transparent lamps as black. */
    lampPresenceGrid?: GridData;
    /** Official artwork read in place from the user's local Factorio installation. */
    gameTextures?: FactorioTextureSet | null;
    terrainTexture?: GameTerrainTexture;

    // Coordinates display
    onHover: (x: number, y: number) => void;

    tool: string;
}

export const Canvas: React.FC<CanvasProps> = ({
    gridData, gridVersion, camera, setCamera,
    onInteractStart, onInteractMove, onInteractEnd, onLampClick,
    stampMode, stampBuffer, stampScale, fitView,
    autoPole, activePoles, poleType, qualityIdx, autoRoboport, activeRoboports,
    previewEntities = [], hasAlternateFrameLamp, lampPresenceGrid, gameTextures, terrainTexture = 'default',
    onHover, tool
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lampPresenceCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const gameLampTileCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const frameRef = useRef<number | null>(null);
    const renderCallbackRef = useRef<() => void>(() => undefined);
    const lastMousePos = useRef<{ x: number, y: number } | null>(null);
    const clickStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
    const previewSpatialIndex = useMemo(
        () => buildPreviewSpatialIndex(previewEntities),
        [previewEntities],
    );

    const rebuildGridCache = useCallback(() => {
        let cache = gridCanvasRef.current;
        if (!cache) {
            cache = document.createElement('canvas');
            gridCanvasRef.current = cache;
        }
        if (cache.width !== gridData.width || cache.height !== gridData.height) {
            cache.width = gridData.width;
            cache.height = gridData.height;
        }
        const context = cache.getContext('2d');
        if (!context) return;
        const bytes = new Uint8ClampedArray(
            gridData.cells.buffer as ArrayBuffer,
            gridData.cells.byteOffset,
            gridData.cells.byteLength,
        );
        context.putImageData(new ImageData(bytes, gridData.width, gridData.height), 0, 0);

    }, [gridData]);

    const rebuildLampPresenceCache = useCallback(() => {
        if (!lampPresenceGrid) {
            lampPresenceCanvasRef.current = null;
            return;
        }
        let cache = lampPresenceCanvasRef.current;
        if (!cache) {
            cache = document.createElement('canvas');
            lampPresenceCanvasRef.current = cache;
        }
        if (cache.width !== lampPresenceGrid.width || cache.height !== lampPresenceGrid.height) {
            cache.width = lampPresenceGrid.width;
            cache.height = lampPresenceGrid.height;
        }
        const context = cache.getContext('2d');
        if (!context) return;
        const bytes = new Uint8ClampedArray(lampPresenceGrid.cells.length * 4);
        for (let index = 0; index < lampPresenceGrid.cells.length; index++) {
            if (lampPresenceGrid.cells[index]) bytes[index * 4 + 3] = 0xff;
        }
        context.putImageData(
            new ImageData(bytes, lampPresenceGrid.width, lampPresenceGrid.height),
            0,
            0,
        );
    }, [lampPresenceGrid]);

    useEffect(() => {
        gameLampTileCacheRef.current.clear();
    }, [gameTextures]);

    const gameLampTileForColor = useCallback((color: number) => {
        if (!gameTextures?.['small-lamp']) return null;
        const cacheKey = quantizedLampColor(color);
        const cached = gameLampTileCacheRef.current.get(cacheKey);
        if (cached) return cached;
        const tile = createGameLampTile(gameTextures, color);
        gameLampTileCacheRef.current.set(cacheKey, tile);
        return tile;
    }, [gameTextures]);

    // Render Logic
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !ctx || !containerRef.current) return;

        const vw = containerRef.current.clientWidth;
        const vh = containerRef.current.clientHeight;

        if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw;
            canvas.height = vh;
        }

        const w = canvas.width;
        const h = canvas.height;

        // 1. Background
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, w, h);

        ctx.save();

        // 2. Camera
        ctx.translate(w / 2, h / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // 3. Culling Bounds
        // Screen Rect: (0,0) to (w,h)
        // World = (Screen - Center) / Zoom + Camera
        const worldL = (0 - w / 2) / camera.zoom + camera.x;
        const worldR = (w - w / 2) / camera.zoom + camera.x;
        const worldT = (0 - h / 2) / camera.zoom + camera.y;
        const worldB = (h - h / 2) / camera.zoom + camera.y;

        const minTileX = Math.max(0, Math.floor(worldL / PIXEL_SIZE));
        const maxTileX = Math.min(GRID_W - 1, Math.floor(worldR / PIXEL_SIZE) + 1);
        const minTileY = Math.max(0, Math.floor(worldT / PIXEL_SIZE));
        const maxTileY = Math.min(GRID_H - 1, Math.floor(worldB / PIXEL_SIZE) + 1);

        const gameTextureMode = Boolean(gameTextures?.['small-lamp']);
        const terrainId = terrainTexture === 'nauvis'
            ? 'terrain-nauvis'
            : terrainTexture === 'laboratory'
                ? 'terrain-laboratory'
                : null;
        const terrain = terrainId ? gameTextures?.[terrainId] : null;
        if (terrain) {
            const pattern = ctx.createPattern(terrain.bitmap, 'repeat');
            if (pattern) {
                pattern.setTransform(new DOMMatrix().scale(PIXEL_SIZE / terrain.frameWidth));
                ctx.fillStyle = pattern;
                ctx.fillRect(worldL, worldT, worldR - worldL, worldB - worldT);
            }
        }

        // 4. Animation lamp presence. A currently transparent/off lamp is
        // rendered black so it stays distinguishable from a genuinely empty tile.
        const cachedLampPresence = lampPresenceCanvasRef.current;
        if (!gameTextureMode && cachedLampPresence && maxTileX >= minTileX && maxTileY >= minTileY) {
            const sourceWidth = maxTileX - minTileX + 1;
            const sourceHeight = maxTileY - minTileY + 1;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                cachedLampPresence,
                minTileX,
                minTileY,
                sourceWidth,
                sourceHeight,
                minTileX * PIXEL_SIZE,
                minTileY * PIXEL_SIZE,
                sourceWidth * PIXEL_SIZE,
                sourceHeight * PIXEL_SIZE,
            );
        }

        // 5. Cached pixels. One bitmap pixel represents one Factorio lamp.
        const cachedGrid = gridCanvasRef.current;
        if (!gameTextureMode && cachedGrid && maxTileX >= minTileX && maxTileY >= minTileY) {
            const sourceWidth = maxTileX - minTileX + 1;
            const sourceHeight = maxTileY - minTileY + 1;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                cachedGrid,
                minTileX,
                minTileY,
                sourceWidth,
                sourceHeight,
                minTileX * PIXEL_SIZE,
                minTileY * PIXEL_SIZE,
                sourceWidth * PIXEL_SIZE,
                sourceHeight * PIXEL_SIZE,
            );
        }

        // Count actual lamps rather than the rectangular viewport. Sparse
        // blueprints can therefore keep their real sprites much farther out.
        let visibleLampCount = 0;
        if (gameTextureMode) {
            countVisibleLamps: for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
                const rowOffset = tileY * gridData.width;
                for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                    const index = rowOffset + tileX;
                    if (gridData.cells[index] || lampPresenceGrid?.cells[index]) visibleLampCount++;
                    if (visibleLampCount > MAX_INDIVIDUAL_GAME_LAMPS_PER_VIEW) break countVisibleLamps;
                }
            }
        }
        const canRenderTexturedLamps = gameTextureMode
            && visibleLampCount <= MAX_INDIVIDUAL_GAME_LAMPS_PER_VIEW;
        if (canRenderTexturedLamps) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
                const rowOffset = tileY * gridData.width;
                for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                    const index = rowOffset + tileX;
                    const color = gridData.cells[index] ?? 0;
                    const isPresent = Boolean(color || lampPresenceGrid?.cells[index]);
                    if (!isPresent) continue;
                    const lampTile = gameLampTileForColor(color);
                    if (!lampTile) continue;
                    ctx.drawImage(
                        lampTile,
                        tileX * PIXEL_SIZE + PIXEL_SIZE / 2 - GAME_LAMP_TEXTURE_TILE_SIZE / 2,
                        tileY * PIXEL_SIZE + PIXEL_SIZE / 2 - GAME_LAMP_TEXTURE_TILE_SIZE / 2,
                        GAME_LAMP_TEXTURE_TILE_SIZE,
                        GAME_LAMP_TEXTURE_TILE_SIZE,
                    );
                }
            }
        } else if (gameTextureMode && maxTileX >= minTileX && maxTileY >= minTileY) {
            // Drawing tens of thousands of individual sprites per animation
            // frame is too costly. Preserve the actual image/colors as a
            // compact aggregate preview instead of replacing it with grey.
            const sourceWidth = maxTileX - minTileX + 1;
            const sourceHeight = maxTileY - minTileY + 1;
            ctx.imageSmoothingEnabled = false;
            if (cachedLampPresence) {
                ctx.drawImage(
                    cachedLampPresence,
                    minTileX,
                    minTileY,
                    sourceWidth,
                    sourceHeight,
                    minTileX * PIXEL_SIZE,
                    minTileY * PIXEL_SIZE,
                    sourceWidth * PIXEL_SIZE,
                    sourceHeight * PIXEL_SIZE,
                );
            }
            if (cachedGrid) {
                ctx.drawImage(
                    cachedGrid,
                    minTileX,
                    minTileY,
                    sourceWidth,
                    sourceHeight,
                    minTileX * PIXEL_SIZE,
                    minTileY * PIXEL_SIZE,
                    sourceWidth * PIXEL_SIZE,
                    sourceHeight * PIXEL_SIZE,
                );
            }
        }

        // 6. Grid Lines
        ctx.lineWidth = 1;

        // Chunk Lines (32)
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        const startChunkX = Math.floor(minTileX / 32) * 32;
        for (let x = startChunkX; x <= maxTileX; x += 32) {
            ctx.moveTo(x * PIXEL_SIZE, minTileY * PIXEL_SIZE);
            ctx.lineTo(x * PIXEL_SIZE, (maxTileY + 1) * PIXEL_SIZE);
        }
        const startChunkY = Math.floor(minTileY / 32) * 32;
        for (let y = startChunkY; y <= maxTileY; y += 32) {
            ctx.moveTo(minTileX * PIXEL_SIZE, y * PIXEL_SIZE);
            ctx.lineTo((maxTileX + 1) * PIXEL_SIZE, y * PIXEL_SIZE);
        }
        ctx.stroke();

        // Detailed Grid
        if (camera.zoom > 0.3) {
            ctx.strokeStyle = "#1f2937";
            ctx.lineWidth = 1 / camera.zoom;
            ctx.beginPath();
            for (let x = minTileX; x <= maxTileX; x++) {
                if (x % 32 === 0) continue;
                ctx.moveTo(x * PIXEL_SIZE, minTileY * PIXEL_SIZE);
                ctx.lineTo(x * PIXEL_SIZE, (maxTileY + 1) * PIXEL_SIZE);
            }
            for (let y = minTileY; y <= maxTileY; y++) {
                if (y % 32 === 0) continue;
                ctx.moveTo(minTileX * PIXEL_SIZE, y * PIXEL_SIZE);
                ctx.lineTo((maxTileX + 1) * PIXEL_SIZE, y * PIXEL_SIZE);
            }
            ctx.stroke();
        }

        // 7. Stamp Preview
        if (stampMode && stampBuffer && lastMousePos.current) {
            const worldPos = getWorldCoords(lastMousePos.current.x, lastMousePos.current.y, canvas.getBoundingClientRect(), camera, w, h);
            const cx = Math.floor(worldPos.x / PIXEL_SIZE);
            const cy = Math.floor(worldPos.y / PIXEL_SIZE);

            // Determine render scale: Text uses dynamic scaling during render,
            // while Images are pre-scaled in the buffer (so render 1:1).
            const renderScale = stampMode === 'text' ? stampScale : 1;

            const destW = Math.floor(stampBuffer.w * renderScale);
            const destH = Math.floor(stampBuffer.h * renderScale);

            const drawW = destW;
            const drawH = destH;

            const startX = cx - Math.floor(destW / 2);
            const startY = cy - Math.floor(destH / 2);

            ctx.globalAlpha = 0.5;

            // Iterate dest pixels to match commit logic
            for (let dy = 0; dy < destH; dy++) {
                for (let dx = 0; dx < destW; dx++) {
                    const srcX = Math.floor(dx / renderScale);
                    const srcY = Math.floor(dy / renderScale);

                    if (srcX >= 0 && srcX < stampBuffer.w && srcY >= 0 && srcY < stampBuffer.h) {
                        const col = stampBuffer.data[srcY * stampBuffer.w + srcX];
                        if (col) {
                            const gx = startX + dx;
                            const gy = startY + dy;

                            // Culling check for render perf
                            if (gx > maxTileX || gx < minTileX || gy > maxTileY || gy < minTileY) continue;

                            const gameLampTile = gameLampTileForColor(col);
                            if (gameLampTile) {
                                ctx.drawImage(
                                    gameLampTile,
                                    gx * PIXEL_SIZE + PIXEL_SIZE / 2 - GAME_LAMP_TEXTURE_TILE_SIZE / 2,
                                    gy * PIXEL_SIZE + PIXEL_SIZE / 2 - GAME_LAMP_TEXTURE_TILE_SIZE / 2,
                                    GAME_LAMP_TEXTURE_TILE_SIZE,
                                    GAME_LAMP_TEXTURE_TILE_SIZE,
                                );
                            } else {
                                ctx.fillStyle = uint32ToCss(col);
                                // Draw 1x1 grid cell
                                ctx.fillRect(gx * PIXEL_SIZE, gy * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
                            }
                        }
                    }
                }
            }
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 2 / camera.zoom;
            ctx.strokeRect(startX * PIXEL_SIZE, startY * PIXEL_SIZE, drawW * PIXEL_SIZE, drawH * PIXEL_SIZE);
        }

        // 8. Auto Poles
        if (autoPole && activePoles) {
            const data = POLE_DATA[poleType];
            const size = data.size;
            const coverage = data.supply[qualityIdx];

            activePoles.forEach(p => {
                // Optimization: Cull poles not in view?
                // For now just render.
                const x = p.x;
                const y = p.y;

                // Culling
                if (x + size < minTileX || x > maxTileX || y + size < minTileY || y > maxTileY) {
                    // Mostly out of view, check supply area for dashed line?
                    // Just simple culling.
                }

                const poleTexture = gameTextures?.[poleType as FactorioTextureId];
                if (poleTexture) {
                    drawPlacedTexture(
                        ctx,
                        poleTexture,
                        (x + size / 2) * PIXEL_SIZE,
                        (y + size / 2) * PIXEL_SIZE,
                    );
                } else {
                    ctx.strokeStyle = "#3b82f6";
                    ctx.lineWidth = 2 / camera.zoom;
                    ctx.strokeRect(x * PIXEL_SIZE + 1, y * PIXEL_SIZE + 1, size * PIXEL_SIZE - 2, size * PIXEL_SIZE - 2);
                }

                ctx.lineWidth = 1 / camera.zoom;
                ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
                const supplyX = x + size / 2 - coverage / 2;
                const supplyY = y + size / 2 - coverage / 2;
                ctx.strokeRect(supplyX * PIXEL_SIZE, supplyY * PIXEL_SIZE, coverage * PIXEL_SIZE, coverage * PIXEL_SIZE);
                ctx.setLineDash([]);
            });
        }

        // 8. Auto Roboports
        if (autoRoboport && activeRoboports) {
            activeRoboports.forEach((roboport) => {
                const centerX = roboport.x + ROBOPORT_SIZE / 2;
                const centerY = roboport.y + ROBOPORT_SIZE / 2;
                const constructionX = centerX - ROBOPORT_CONSTRUCTION_RADIUS;
                const constructionY = centerY - ROBOPORT_CONSTRUCTION_RADIUS;

                if (
                    roboport.x + ROBOPORT_SIZE < minTileX
                    || roboport.x > maxTileX
                    || roboport.y + ROBOPORT_SIZE < minTileY
                    || roboport.y > maxTileY
                ) return;

                if (camera.zoom > 0.08) {
                    ctx.strokeStyle = '#10b981';
                    ctx.lineWidth = 1 / camera.zoom;
                    ctx.setLineDash([6 / camera.zoom, 5 / camera.zoom]);
                    ctx.strokeRect(
                        constructionX * PIXEL_SIZE,
                        constructionY * PIXEL_SIZE,
                        ROBOPORT_CONSTRUCTION_RADIUS * 2 * PIXEL_SIZE,
                        ROBOPORT_CONSTRUCTION_RADIUS * 2 * PIXEL_SIZE,
                    );
                    ctx.setLineDash([]);
                }

                const roboportTexture = gameTextures?.roboport;
                if (roboportTexture) {
                    drawPlacedTexture(
                        ctx,
                        roboportTexture,
                        centerX * PIXEL_SIZE,
                        centerY * PIXEL_SIZE,
                    );
                } else {
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
                    ctx.fillRect(
                        roboport.x * PIXEL_SIZE + 1,
                        roboport.y * PIXEL_SIZE + 1,
                        ROBOPORT_SIZE * PIXEL_SIZE - 2,
                        ROBOPORT_SIZE * PIXEL_SIZE - 2,
                    );
                    ctx.strokeStyle = '#34d399';
                    ctx.lineWidth = 2 / camera.zoom;
                    ctx.strokeRect(
                        roboport.x * PIXEL_SIZE + 1,
                        roboport.y * PIXEL_SIZE + 1,
                        ROBOPORT_SIZE * PIXEL_SIZE - 2,
                        ROBOPORT_SIZE * PIXEL_SIZE - 2,
                    );
                }
            });
        }

        // 9. Blueprint-only animation infrastructure. Coordinates and
        // footprints come from the same layout maths as the exported blueprint.
        const visiblePreviewEntities = previewEntitiesInBounds(
            previewSpatialIndex,
            Math.floor(worldL / PIXEL_SIZE) - 1,
            Math.floor(worldT / PIXEL_SIZE) - 1,
            Math.ceil(worldR / PIXEL_SIZE) + 1,
            Math.ceil(worldB / PIXEL_SIZE) + 1,
        );
        visiblePreviewEntities.forEach((entity) => {
            const left = entity.x * PIXEL_SIZE;
            const top = entity.y * PIXEL_SIZE;
            const width = entity.width * PIXEL_SIZE;
            const height = entity.height * PIXEL_SIZE;
            if (left + width < worldL || left > worldR || top + height < worldT || top > worldB) return;

            const style = PREVIEW_ENTITY_STYLE[entity.kind];
            const entityTexture = gameTextures?.[PREVIEW_ENTITY_TEXTURE[entity.kind]];
            if (entityTexture) {
                drawPlacedTexture(
                    ctx,
                    entityTexture,
                    left + width / 2,
                    top + height / 2,
                    width > height ? 1 : 0,
                );
            } else {
                ctx.fillStyle = style.fill;
                ctx.fillRect(left + 1, top + 1, width - 2, height - 2);
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = 2 / camera.zoom;
                ctx.strokeRect(left + 1, top + 1, width - 2, height - 2);

                if (camera.zoom >= 0.45) {
                    ctx.fillStyle = style.stroke;
                    ctx.font = `bold ${Math.max(9, Math.min(15, 11 / camera.zoom)) / camera.zoom}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(style.text, left + width / 2, top + height / 2);
                }
            }
        });

        ctx.restore();

    }, [camera, stampMode, stampBuffer, stampScale, autoPole, activePoles, poleType, qualityIdx, autoRoboport, activeRoboports, previewSpatialIndex, gameTextures, gameLampTileForColor, gridData, lampPresenceGrid, terrainTexture]);
    useEffect(() => {
        renderCallbackRef.current = render;
    }, [render]);

    const requestRender = useCallback(() => {
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            renderCallbackRef.current();
        });
    }, []);

    useEffect(() => {
        rebuildGridCache();
        requestRender();
    }, [gridVersion, rebuildGridCache, requestRender]);

    useEffect(() => {
        rebuildLampPresenceCache();
        requestRender();
    }, [rebuildLampPresenceCache, requestRender]);

    useEffect(() => {
        requestRender();
    }, [render, requestRender]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(requestRender);
        observer.observe(container);
        return () => observer.disconnect();
    }, [requestRender]);

    useEffect(() => () => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!fitView || !container) return;

        const horizontalPadding = 64;
        const verticalPadding = 64;
        const availableWidth = Math.max(1, container.clientWidth - horizontalPadding);
        const availableHeight = Math.max(1, container.clientHeight - verticalPadding);
        const zoom = Math.min(
            availableWidth / fitView.width,
            availableHeight / fitView.height,
        );

        setCamera({
            x: fitView.centerX,
            y: fitView.centerY,
            zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
        });
    }, [fitView, setCamera]);


    // Interactivity

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Zoom logic
        const delta = e.deltaY < 0 ? 1 : -1;
        const zoomIntensity = 0.1;
        const newZoom = Math.min(Math.max(MIN_ZOOM, camera.zoom + (delta * zoomIntensity * camera.zoom)), MAX_ZOOM);

        if (newZoom !== camera.zoom) {
            const rect = canvasRef.current!.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const w = canvasRef.current!.width;
            const h = canvasRef.current!.height;

            // World before zoom
            const worldBeforeX = (mouseX - w / 2) / camera.zoom + camera.x;
            const worldBeforeY = (mouseY - h / 2) / camera.zoom + camera.y;

            const newX = worldBeforeX - (mouseX - w / 2) / newZoom;
            const newY = worldBeforeY - (mouseY - h / 2) / newZoom;

            setCamera({ x: newX, y: newY, zoom: newZoom });
        }
    };

    // Mouse Event Wrappers


    const onMouseMove = (e: React.MouseEvent) => {
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        const clickStart = clickStartRef.current;
        if (clickStart && Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) > 4) {
            clickStart.moved = true;
        }

        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const world = getWorldCoords(e.clientX, e.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
            const gx = Math.floor(world.x / PIXEL_SIZE);
            const gy = Math.floor(world.y / PIXEL_SIZE);
            onHover(gx, gy);

            const previewEntity = previewSpatialIndex.byTile.get(`${gx},${gy}`);
            const roboport = !previewEntity && autoRoboport
                ? activeRoboports?.find(candidate => (
                    gx >= candidate.x && gx < candidate.x + ROBOPORT_SIZE
                    && gy >= candidate.y && gy < candidate.y + ROBOPORT_SIZE
                ))
                : undefined;
            const poleSize = POLE_DATA[poleType]?.size ?? 1;
            const pole = !previewEntity && !roboport && autoPole
                ? activePoles?.find(candidate => (
                    gx >= candidate.x && gx < candidate.x + poleSize
                    && gy >= candidate.y && gy < candidate.y + poleSize
                ))
                : undefined;
            const gridIndex = gy * gridData.width + gx;
            const isGridTile = gx >= 0 && gx < gridData.width && gy >= 0 && gy < gridData.height;
            const lamp = !previewEntity && !roboport && !pole && isGridTile && Boolean(
                gridData.cells[gridIndex] || hasAlternateFrameLamp?.(gx, gy),
            );

            if (previewEntity) {
                const style = PREVIEW_ENTITY_STYLE[previewEntity.kind];
                setHoverTooltip({
                    title: previewEntity.name,
                    description: previewEntity.description,
                    color: style.stroke,
                    tileX: gx,
                    tileY: gy,
                    screenX: Math.min(e.clientX - rect.left + 14, Math.max(8, rect.width - 264)),
                    screenY: e.clientY - rect.top,
                });
            } else if (roboport) {
                setHoverTooltip({
                    title: 'Roboport',
                    description: '4×4 support structure; replaces any image lamps below it.',
                    color: '#34d399',
                    tileX: gx,
                    tileY: gy,
                    screenX: Math.min(e.clientX - rect.left + 14, Math.max(8, rect.width - 264)),
                    screenY: e.clientY - rect.top,
                });
            } else if (pole) {
                setHoverTooltip({
                    title: poleType.split('-').map(part => part[0]?.toUpperCase() + part.slice(1)).join(' '),
                    description: `${poleSize}×${poleSize} electric pole; replaces any image lamps below it.`,
                    color: '#60a5fa',
                    tileX: gx,
                    tileY: gy,
                    screenX: Math.min(e.clientX - rect.left + 14, Math.max(8, rect.width - 264)),
                    screenY: e.clientY - rect.top,
                });
            } else if (lamp) {
                setHoverTooltip({
                    title: 'Small lamp',
                    description: 'Image pixel rendered as a Factorio lamp.',
                    color: '#facc15',
                    tileX: gx,
                    tileY: gy,
                    screenX: Math.min(e.clientX - rect.left + 14, Math.max(8, rect.width - 264)),
                    screenY: e.clientY - rect.top,
                });
            } else {
                setHoverTooltip(null);
            }

            onInteractMove(e, gx, gy);
            if (e.buttons === 1 && (tool === 'brush' || tool === 'erase')) rebuildGridCache();
            requestRender();
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        clickStartRef.current = e.button === 0
            ? { x: e.clientX, y: e.clientY, moved: false }
            : null;
        const rect = canvasRef.current!.getBoundingClientRect();
        const world = getWorldCoords(e.clientX, e.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
        onInteractStart(e, Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
        if (tool === 'brush' || tool === 'erase' || tool === 'fill') rebuildGridCache();
        requestRender();
    };

    const handleInteractEnd = (e: React.MouseEvent | React.TouchEvent, inspectClick = true) => {
        onInteractEnd(e);
        const clickStart = clickStartRef.current;
        clickStartRef.current = null;
        if (inspectClick && clickStart && !clickStart.moved && onLampClick && canvasRef.current) {
            const point = 'changedTouches' in e ? e.changedTouches[0] : e;
            if (point) {
                const rect = canvasRef.current.getBoundingClientRect();
                const world = getWorldCoords(
                    point.clientX,
                    point.clientY,
                    rect,
                    camera,
                    canvasRef.current.width,
                    canvasRef.current.height,
                );
                const gridX = Math.floor(world.x / PIXEL_SIZE);
                const gridY = Math.floor(world.y / PIXEL_SIZE);
                const isGridTile = gridX >= 0 && gridX < gridData.width
                    && gridY >= 0 && gridY < gridData.height;
                const gridIndex = gridY * gridData.width + gridX;
                const previewEntity = previewSpatialIndex.byTile.get(`${gridX},${gridY}`);
                const roboport = !previewEntity && autoRoboport
                    ? activeRoboports?.some(candidate => (
                        gridX >= candidate.x && gridX < candidate.x + ROBOPORT_SIZE
                        && gridY >= candidate.y && gridY < candidate.y + ROBOPORT_SIZE
                    ))
                    : false;
                const poleSize = POLE_DATA[poleType]?.size ?? 1;
                const pole = !previewEntity && !roboport && autoPole
                    ? activePoles?.some(candidate => (
                        gridX >= candidate.x && gridX < candidate.x + poleSize
                        && gridY >= candidate.y && gridY < candidate.y + poleSize
                    ))
                    : false;
                const lamp = !previewEntity && !roboport && !pole && isGridTile && Boolean(
                    gridData.cells[gridIndex] || hasAlternateFrameLamp?.(gridX, gridY),
                );
                if (lamp) onLampClick(gridX, gridY);
            }
        }
        rebuildGridCache();
        requestRender();
    };

    const getCursor = () => {
        if (stampMode) return 'cursor-none'; // We render a custom ghost
        if (tool === 'pan') return 'cursor-grab'; // Or move
        if (tool === 'eye') return 'cursor-pointer'; // Eye dropper
        if (tool === 'fill') return 'cursor-cell'; // Bucket? crosshair is fine too
        return 'cursor-crosshair';
    };

    // Native Event Listeners for accurate Zoom control (prevent browser pinch-zoom)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            // If Ctrl is pressed (trackpad pinch usually), prevent default browser zoom
            if (e.ctrlKey) {
                e.preventDefault();
                // We don't stop propagation because we might want other handlers to know
                // But generally for pinch-zoom, we want to hijack it for our own zoom.
            }

            // We can also route this directly to our handler logic if needed, 
            // but React's onWheel handles the logic fine. 
            // The KEY is e.preventDefault() which React's synthetic event might be too late for
            // or passive by default.
            
            // To ensure our app zooms, we manually call the logic if it's a Ctrl+Wheel
            // OR we just rely on the React handler if we ONLY want to prevent default.
            // HOWEVER, duplicate handling is bad. 
            // Let's rely on this native handler for ALL zooming if possible, 
            // or just use it to prevent default and let React handle the rest?
            // Actually, React's onWheel is passive: false by default in recent versions? 
            // No, often 'wheel' is passive.
            // Safe bet: handle zoom here and prevent default.
            
        };

        // Safari gesture events are not part of lib.dom's named event map,
        // but they still use the ordinary Event contract for preventDefault.
        const preventGestureZoom: EventListener = event => event.preventDefault();

        // We MUST use { passive: false } to be able to call preventDefault
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('gesturestart', preventGestureZoom, { passive: false });
        canvas.addEventListener('gesturechange', preventGestureZoom, { passive: false });
        canvas.addEventListener('gestureend', preventGestureZoom, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('gesturestart', preventGestureZoom);
            canvas.removeEventListener('gesturechange', preventGestureZoom);
            canvas.removeEventListener('gestureend', preventGestureZoom);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`relative flex-1 bg-[#0d0e12] touch-none w-full h-full overflow-hidden ${getCursor()}`}
        >
            <canvas
                ref={canvasRef}
                className="block w-full h-full outline-none"
                onContextMenu={(e) => e.preventDefault()}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={handleInteractEnd}
                onMouseLeave={(event) => {
                    setHoverTooltip(null);
                    handleInteractEnd(event, false);
                }}
                onWheel={handleWheel}
                // Touch
                onTouchStart={(e) => {
                    const t = e.touches[0];
                    clickStartRef.current = { x: t.clientX, y: t.clientY, moved: false };
                    const rect = canvasRef.current!.getBoundingClientRect();
                    const world = getWorldCoords(t.clientX, t.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
                    onInteractStart(e, Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
                    rebuildGridCache();
                    requestRender();
                }}
                onTouchMove={(e) => {
                    const t = e.touches[0];
                    const clickStart = clickStartRef.current;
                    if (clickStart && Math.hypot(t.clientX - clickStart.x, t.clientY - clickStart.y) > 4) {
                        clickStart.moved = true;
                    }
                    lastMousePos.current = { x: t.clientX, y: t.clientY };
                    const rect = canvasRef.current!.getBoundingClientRect();
                    const world = getWorldCoords(t.clientX, t.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
                    onHover(Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
                    onInteractMove(e, Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
                    rebuildGridCache();
                    requestRender();
                }}
                onTouchEnd={handleInteractEnd}
            />
            {hoverTooltip && (
                <div
                    className="pointer-events-none absolute z-20 max-w-64 rounded-md border border-gray-600 bg-gray-950/95 px-3 py-2 text-left shadow-xl backdrop-blur-sm"
                    style={{
                        left: hoverTooltip.screenX,
                        top: Math.max(8, hoverTooltip.screenY - 76),
                    }}
                >
                    <div className="text-xs font-bold" style={{ color: hoverTooltip.color }}>
                        {hoverTooltip.title}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-gray-300">{hoverTooltip.description}</div>
                    <div className="mt-1 font-mono text-[9px] text-gray-500">
                        Tile X: {hoverTooltip.tileX} · Y: {hoverTooltip.tileY}
                    </div>
                </div>
            )}
        </div>
    );
};

