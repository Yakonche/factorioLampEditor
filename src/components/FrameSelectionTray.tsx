import React from 'react';

export interface FrameSelectionItem {
    id: string;
    label: string;
    thumbnailUrl: string;
    selectedForRemoval: boolean;
    removable?: boolean;
}

interface FrameSelectionTrayProps {
    items: FrameSelectionItem[];
    maximumFrames: number;
    onToggle: (id: string) => void;
    onLetAppDecide: () => void;
    onApply: () => void;
    onCancel: () => void;
}

export const FrameSelectionTray: React.FC<FrameSelectionTrayProps> = ({
    items,
    maximumFrames,
    onToggle,
    onLetAppDecide,
    onApply,
    onCancel,
}) => {
    const removalCount = items.filter(item => item.selectedForRemoval).length;
    const keptCount = items.length - removalCount;
    const requiredRemovalCount = Math.max(0, items.length - maximumFrames);
    const canApply = keptCount >= 1 && keptCount <= maximumFrames;

    return (
        <section className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-400/30 bg-gray-950/95 p-3 shadow-2xl backdrop-blur">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-xs font-bold text-amber-200">Frame limit exceeded</h2>
                    <p className="text-[10px] text-gray-400">
                        Keep at most {maximumFrames.toLocaleString()} frames. Check frames to remove
                        ({removalCount.toLocaleString()} selected, {requiredRemovalCount.toLocaleString()} required).
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onLetAppDecide}
                        className="rounded border border-blue-400/40 bg-blue-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-blue-600"
                    >
                        Let the app decide
                    </button>
                    <button
                        type="button"
                        onClick={onApply}
                        disabled={!canApply}
                        className="rounded border border-emerald-400/40 bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Apply selection ({keptCount.toLocaleString()} kept)
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-[10px] font-bold text-gray-300 hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                </div>
            </div>
            <div className="flex max-h-28 gap-2 overflow-x-auto pb-1">
                {items.map((item, index) => (
                    <label
                        key={item.id}
                        className={`relative flex w-20 shrink-0 cursor-pointer flex-col items-center rounded border p-1 ${item.selectedForRemoval
                            ? 'border-red-400 bg-red-950/70'
                            : 'border-gray-700 bg-gray-900'
                        } ${item.removable === false ? 'cursor-not-allowed opacity-60' : ''}`}
                        title={item.label}
                    >
                        {item.thumbnailUrl ? (
                            <img
                                src={item.thumbnailUrl}
                                className="h-14 w-full rounded bg-checkerboard object-contain"
                                alt={`Frame ${index + 1}`}
                            />
                        ) : (
                            <div className="flex h-14 w-full items-center justify-center rounded bg-gray-800 text-gray-600">
                                <i className="fa-regular fa-image"></i>
                            </div>
                        )}
                        <span className="mt-1 w-full truncate text-center font-mono text-[9px] text-gray-300">
                            {index + 1}. {item.label}
                        </span>
                        <input
                            type="checkbox"
                            checked={item.selectedForRemoval}
                            disabled={item.removable === false}
                            onChange={() => onToggle(item.id)}
                            className="absolute right-1 top-1 h-4 w-4 accent-red-500"
                            aria-label={`Remove frame ${index + 1}`}
                        />
                    </label>
                ))}
            </div>
        </section>
    );
};
