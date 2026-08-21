import React from 'react';
import type { SequenceFrameInfo } from './Toolbar';

interface SequenceFrameTrayProps {
    frames: SequenceFrameInfo[];
    activeFrame: number;
    maxDefinition: number;
    onSelect: (index: number) => void;
    onRemove: (id: string) => void;
    onDimensionChange: (id: string, axis: 'width' | 'height', value: number) => void;
    onDelayChange: (id: string, seconds: number) => void;
}

export const SequenceFrameTray: React.FC<SequenceFrameTrayProps> = ({
    frames,
    activeFrame,
    maxDefinition,
    onSelect,
    onRemove,
    onDimensionChange,
    onDelayChange,
}) => {
    if (!frames.length) return null;
    return (
        <section className="z-10 shrink-0 border-t border-fuchsia-500/30 bg-gray-900/95 px-3 py-2 shadow-2xl backdrop-blur" aria-label="Slideshow frames">
            <div className="mb-1 flex items-center justify-between gap-3">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-fuchsia-300">Multi images · {frames.length} frame{frames.length === 1 ? '' : 's'}</h3>
                <p className="text-[9px] text-gray-500">Click a thumbnail to preview · individual values override the global duration</p>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                {frames.map((frame, index) => (
                    <article
                        key={frame.id}
                        className={`flex w-72 shrink-0 gap-2 rounded-lg border p-2 ${activeFrame === index ? 'border-fuchsia-400 bg-fuchsia-950/50' : 'border-gray-700 bg-gray-950'}`}
                    >
                        <button
                            type="button"
                            onClick={() => onSelect(index)}
                            className="h-20 w-20 shrink-0 overflow-hidden rounded border border-gray-600 bg-gray-800 hover:border-fuchsia-400"
                            title={`Preview frame ${index + 1}: ${frame.sourceName}`}
                        >
                            <img src={frame.thumbnailUrl} className="h-full w-full object-contain" alt="" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1">
                                <p className="truncate text-[10px] font-bold text-fuchsia-100" title={frame.sourceName}>#{index + 1} · {frame.sourceName}</p>
                                <button type="button" onClick={() => onRemove(frame.id)} className="rounded px-1 text-gray-500 hover:bg-red-950 hover:text-red-300" title={`Remove frame ${index + 1}`}>
                                    <i className="fa-solid fa-trash" />
                                </button>
                            </div>
                            <div className="mt-1 grid grid-cols-3 gap-1 text-[8px] text-gray-500">
                                <label>
                                    W
                                    <input type="number" min="1" max={maxDefinition} value={frame.currentWidth} onChange={event => event.target.value !== '' && onDimensionChange(frame.id, 'width', Number(event.target.value))} className="mt-0.5 w-full rounded border border-gray-600 bg-gray-800 px-1 py-1 font-mono text-[9px] text-blue-300" />
                                </label>
                                <label>
                                    H
                                    <input type="number" min="1" max={maxDefinition} value={frame.currentHeight} onChange={event => event.target.value !== '' && onDimensionChange(frame.id, 'height', Number(event.target.value))} className="mt-0.5 w-full rounded border border-gray-600 bg-gray-800 px-1 py-1 font-mono text-[9px] text-blue-300" />
                                </label>
                                <label>
                                    Seconds
                                    <input type="number" min="0.1" max="86400" step="0.1" value={frame.delaySeconds} onChange={event => onDelayChange(frame.id, Number(event.target.value))} className="mt-0.5 w-full rounded border border-gray-600 bg-gray-800 px-1 py-1 font-mono text-[9px] text-yellow-300" />
                                </label>
                            </div>
                            <p className="mt-1 truncate font-mono text-[8px] text-gray-600">source {frame.originalWidth}×{frame.originalHeight}</p>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
};
