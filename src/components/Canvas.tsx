import React, { useRef, useEffect, useCallback } from 'react';
import type { CameraState } from '../utils/geometry';
import { getWorldCoords } from '../utils/geometry';
import type { GridData } from '../utils/grid';
import { PIXEL_SIZE, GRID_W, GRID_H, POLE_DATA, MIN_ZOOM, MAX_ZOOM } from '../constants';
import type { StampBuffer } from '../utils/stamp';
import type { ActivePole } from '../utils/blueprint';

interface CanvasProps {
    gridData: GridData;
    camera: CameraState;
    setCamera: (c: CameraState) => void;

    // Interactions
    onInteractStart: (e: React.MouseEvent | React.TouchEvent, x: number, y: number) => void;
    onInteractMove: (e: React.MouseEvent | React.TouchEvent, x: number, y: number) => void;
    onInteractEnd: (e: React.MouseEvent | React.TouchEvent) => void;

    // Visuals
    stampMode: 'text' | 'image' | null;
    stampBuffer: StampBuffer | null;
    stampScale: number;
    onStampScale: (delta: number) => void;

    autoPole: boolean;
    activePoles?: ActivePole[];
    poleType: string;
    qualityIdx: number;

    // Coordinates display
    onHover: (x: number, y: number) => void;

    tool: string;
}

export const Canvas: React.FC<CanvasProps> = ({
    gridData, camera, setCamera,
    onInteractStart, onInteractMove, onInteractEnd,
    stampMode, stampBuffer, stampScale, onStampScale,
    autoPole, activePoles, poleType, qualityIdx,
    onHover, tool
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // const requestRef = useRef<number>();



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

        // 4. Grid Lines
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

        // 5. Active Pixels
        for (let y = minTileY; y <= maxTileY; y++) {
            for (let x = minTileX; x <= maxTileX; x++) {
                const color = gridData[y][x];
                if (color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(
                        x * PIXEL_SIZE + 0.5,
                        y * PIXEL_SIZE + 0.5,
                        PIXEL_SIZE - 1,
                        PIXEL_SIZE - 1
                    );
                }
            }
        }

        // 6. Stamp Preview
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
                        const col = stampBuffer.data[srcY][srcX];
                        if (col) {
                            const gx = startX + dx;
                            const gy = startY + dy;

                            // Culling check for render perf
                            if (gx > maxTileX || gx < minTileX || gy > maxTileY || gy < minTileY) continue;

                            ctx.fillStyle = col;
                            // Draw 1x1 grid cell
                            ctx.fillRect(gx * PIXEL_SIZE, gy * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
                        }
                    }
                }
            }
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 2 / camera.zoom;
            ctx.strokeRect(startX * PIXEL_SIZE, startY * PIXEL_SIZE, drawW * PIXEL_SIZE, drawH * PIXEL_SIZE);
        }

        // 7. Auto Poles
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

                ctx.strokeStyle = "#3b82f6";
                ctx.lineWidth = 2 / camera.zoom;
                ctx.strokeRect(x * PIXEL_SIZE + 1, y * PIXEL_SIZE + 1, size * PIXEL_SIZE - 2, size * PIXEL_SIZE - 2);

                ctx.lineWidth = 1 / camera.zoom;
                ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
                const supplyX = x + size / 2 - coverage / 2;
                const supplyY = y + size / 2 - coverage / 2;
                ctx.strokeRect(supplyX * PIXEL_SIZE, supplyY * PIXEL_SIZE, coverage * PIXEL_SIZE, coverage * PIXEL_SIZE);
                ctx.setLineDash([]);
            });
        }

        ctx.restore();

    }, [gridData, camera, stampMode, stampBuffer, stampScale, autoPole, activePoles, poleType, qualityIdx]);

    // Animation Loop
    useEffect(() => {
        let handle: number;
        const loop = () => {
            render();
            handle = requestAnimationFrame(loop);
        }
        handle = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(handle);
    }, [render]);


    // Interactivity
    const lastMousePos = useRef<{ x: number, y: number } | null>(null);

    const handleWheel = (e: React.WheelEvent) => {
        if (stampMode) {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY < 0 ? 1 : -1;
            onStampScale(delta);
            return;
        }

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

        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const world = getWorldCoords(e.clientX, e.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
            const gx = Math.floor(world.x / PIXEL_SIZE);
            const gy = Math.floor(world.y / PIXEL_SIZE);
            onHover(gx, gy);

            onInteractMove(e, gx, gy);
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const world = getWorldCoords(e.clientX, e.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
        onInteractStart(e, Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
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
            
            if (stampMode) return; // Let React handler or custom logic handle stamps? 
            // Actually, let's just use this for the PREVENT DEFAULT part.
        };

        // For Safari/Mac Gesture events (Pinch)
        const onGestureStart = (e: any) => {
            e.preventDefault();
        };

        const onGestureChange = (e: any) => {
           e.preventDefault();
           // Safari "pinch" gives e.scale
           // We map e.scale to zoom, but commonly Wheel with Ctrl is enough for trackpads in Chrome/Firefox.
           // For Safari proper native gestures we just prevent default for now to stop the browser zoom.
        };

        const onGestureEnd = (e: any) => e.preventDefault();

        // We MUST use { passive: false } to be able to call preventDefault
        canvas.addEventListener('wheel', onWheel, { passive: false });
        // Typescript might complain about gesture events, cast to any or augment types
        canvas.addEventListener('gesturestart', onGestureStart as any, { passive: false });
        canvas.addEventListener('gesturechange', onGestureChange as any, { passive: false });
        canvas.addEventListener('gestureend', onGestureEnd as any, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('gesturestart', onGestureStart as any);
            canvas.removeEventListener('gesturechange', onGestureChange as any);
            canvas.removeEventListener('gestureend', onGestureEnd as any);
        };
    }, [stampMode]);

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
                onMouseUp={onInteractEnd}
                onMouseLeave={onInteractEnd}
                onWheel={handleWheel}
                // Touch
                onTouchStart={(e) => {
                    const t = e.touches[0];
                    const rect = canvasRef.current!.getBoundingClientRect();
                    const world = getWorldCoords(t.clientX, t.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
                    onInteractStart(e, Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
                }}
                onTouchMove={(e) => {
                    const t = e.touches[0];
                    lastMousePos.current = { x: t.clientX, y: t.clientY };
                    const rect = canvasRef.current!.getBoundingClientRect();
                    const world = getWorldCoords(t.clientX, t.clientY, rect, camera, canvasRef.current!.width, canvasRef.current!.height);
                    onHover(Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
                    onInteractMove(e, Math.floor(world.x / PIXEL_SIZE), Math.floor(world.y / PIXEL_SIZE));
                }}
                onTouchEnd={onInteractEnd}
            />
        </div>
    );
};

