import React from 'react';

interface ImportSizeModalProps {
    image: {
        originalW: number;
        originalH: number;
    } | null;
    maxWidth: number;
    maxHeight: number;
    onReduce: () => void;
    onCancel: () => void;
}

export const ImportSizeModal: React.FC<ImportSizeModalProps> = ({
    image,
    maxWidth,
    maxHeight,
    onReduce,
    onCancel,
}) => {
    if (!image) return null;

    const scale = Math.min(maxWidth / image.originalW, maxHeight / image.originalH);
    const targetWidth = Math.max(1, Math.floor(image.originalW * scale));
    const targetHeight = Math.max(1, Math.floor(image.originalH * scale));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="image-size-modal-title"
                className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 text-gray-200 shadow-2xl"
            >
                <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                    </span>
                    <h2 id="image-size-modal-title" className="text-lg font-bold text-white">Image exceeds canvas limit</h2>
                </div>

                <p className="text-sm leading-6 text-gray-300">
                    This image is {image.originalW} × {image.originalH} px. The maximum supported canvas size is {maxWidth} × {maxHeight} px.
                </p>
                <p className="mt-3 text-sm leading-6 text-gray-400">
                    You can reduce it to {targetWidth} × {targetHeight} px while preserving its original aspect ratio. No cropping will be applied.
                </p>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        onClick={onCancel}
                        className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-bold text-gray-200 transition-colors hover:bg-gray-700"
                    >
                        Cancel import
                    </button>
                    <button
                        onClick={onReduce}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                    >
                        Reduce to {targetWidth} × {targetHeight}
                    </button>
                </div>
            </div>
        </div>
    );
};
