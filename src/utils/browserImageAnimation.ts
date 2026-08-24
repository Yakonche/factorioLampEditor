import type {
    DecodedMediaAnimation,
    MediaFrameThumbnail,
    MediaFrameTransition,
} from './mediaAnimation';

const MAX_MEDIA_FPS = 30;
const THUMBNAIL_DIMENSION = 56;

export interface BrowserImageInspection {
    sourceWidth: number;
    sourceHeight: number;
    sourceFps: number;
    frameCount: number;
}

export interface BrowserImageDecodeOptions {
    sourceName: string;
    mimeType: string;
    fpsLimit: number;
    maxDimension: number;
    targetWidth?: number;
    targetHeight?: number;
    colorMode?: 'full' | 'grayscale' | 'monochrome';
    monochromeThreshold?: number;
    differenceThreshold?: number;
}

export const browserImageMimeType = (filename: string, declaredType = ''): string | null => {
    const extension = filename.split('.').pop()?.toLocaleLowerCase();
    if (extension === 'webp' || declaredType === 'image/webp') return 'image/webp';
    if (extension === 'apng' || extension === 'png' || declaredType === 'image/apng' || declaredType === 'image/png') return 'image/png';
    return null;
};

const createDecoder = async (bytes: ArrayBuffer, mimeType: string): Promise<ImageDecoder> => {
    if (typeof ImageDecoder === 'undefined' || !await ImageDecoder.isTypeSupported(mimeType)) {
        throw new Error(`This Chromium runtime cannot decode ${mimeType} images.`);
    }
    const decoder = new ImageDecoder({ data: new Uint8Array(bytes), type: mimeType });
    await decoder.tracks.ready;
    if (!decoder.tracks.selectedTrack) {
        decoder.close();
        throw new Error('No readable image track was found in this file.');
    }
    return decoder;
};

const frameFps = (frame: VideoFrame, animated: boolean): number => {
    if (!animated) return 1;
    const duration = frame.duration ?? 0;
    return duration > 0 ? Math.min(1000, 1_000_000 / duration) : MAX_MEDIA_FPS;
};

export const inspectBrowserImage = async (
    bytes: ArrayBuffer,
    mimeType: string,
): Promise<BrowserImageInspection> => {
    const decoder = await createDecoder(bytes, mimeType);
    try {
        const track = decoder.tracks.selectedTrack!;
        const { image } = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
        try {
            return {
                sourceWidth: image.displayWidth,
                sourceHeight: image.displayHeight,
                sourceFps: frameFps(image, track.animated),
                frameCount: track.frameCount,
            };
        } finally {
            image.close();
        }
    } finally {
        decoder.close();
    }
};

const sampleDurationTicks = (sampleIndex: number, fps: number): number => {
    const start = Math.round(sampleIndex * 60 / fps);
    const end = Math.round((sampleIndex + 1) * 60 / fps);
    return Math.max(2, end - start);
};

const createThumbnail = (rgba: Uint8ClampedArray, width: number, height: number): MediaFrameThumbnail => {
    const scale = Math.min(1, THUMBNAIL_DIMENSION / width, THUMBNAIL_DIMENSION / height);
    const thumbnailWidth = Math.max(1, Math.round(width * scale));
    const thumbnailHeight = Math.max(1, Math.round(height * scale));
    const thumbnail = new Uint8Array(thumbnailWidth * thumbnailHeight * 4);
    for (let y = 0; y < thumbnailHeight; y++) {
        const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / thumbnailHeight));
        for (let x = 0; x < thumbnailWidth; x++) {
            const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / thumbnailWidth));
            const sourceOffset = (sourceY * width + sourceX) * 4;
            thumbnail.set(rgba.subarray(sourceOffset, sourceOffset + 4), (y * thumbnailWidth + x) * 4);
        }
    }
    return { width: thumbnailWidth, height: thumbnailHeight, rgba: thumbnail };
};

const pixelsFromRgba = (
    rgba: Uint8ClampedArray,
    previous: Uint32Array | undefined,
    colorMode: 'full' | 'grayscale' | 'monochrome',
    monochromeThreshold: number,
    differenceThreshold: number,
): Uint32Array => {
    const pixels = new Uint32Array(rgba.length / 4);
    for (let index = 0; index < pixels.length; index++) {
        const offset = index * 4;
        if (rgba[offset + 3] <= 128) continue;
        const red = rgba[offset];
        const green = rgba[offset + 1];
        const blue = rgba[offset + 2];
        if (colorMode === 'monochrome') {
            const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
            pixels[index] = luminance >= monochromeThreshold ? 0xffffffff : 0;
        } else if (colorMode === 'grayscale') {
            const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
            pixels[index] = (0xff000000 | (luminance << 16) | (luminance << 8) | luminance) >>> 0;
        } else {
            pixels[index] = (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0;
        }
    }
    if (previous && differenceThreshold > 0 && colorMode !== 'monochrome') {
        for (let index = 0; index < pixels.length; index++) {
            const current = pixels[index];
            const prior = previous[index];
            if (!current || !prior) continue;
            const difference = Math.max(
                Math.abs((current & 0xff) - (prior & 0xff)),
                Math.abs(((current >>> 8) & 0xff) - ((prior >>> 8) & 0xff)),
                Math.abs(((current >>> 16) & 0xff) - ((prior >>> 16) & 0xff)),
            );
            if (difference <= differenceThreshold) pixels[index] = prior;
        }
    }
    return pixels;
};

export const decodeBrowserImageAnimation = async (
    bytes: ArrayBuffer,
    options: BrowserImageDecodeOptions,
): Promise<DecodedMediaAnimation> => {
    const inspection = await inspectBrowserImage(bytes, options.mimeType);
    const maxDimension = Math.max(1, Math.min(1024, Math.floor(options.maxDimension) || 512));
    const requestedWidth = Number.isFinite(options.targetWidth) ? Math.max(1, Math.min(maxDimension, Math.round(options.targetWidth!))) : null;
    const requestedHeight = Number.isFinite(options.targetHeight) ? Math.max(1, Math.min(maxDimension, Math.round(options.targetHeight!))) : null;
    const scale = requestedWidth || requestedHeight
        ? Math.min(
            maxDimension / inspection.sourceWidth,
            maxDimension / inspection.sourceHeight,
            requestedWidth ? requestedWidth / inspection.sourceWidth : Number.POSITIVE_INFINITY,
            requestedHeight ? requestedHeight / inspection.sourceHeight : Number.POSITIVE_INFINITY,
        )
        : Math.min(1, maxDimension / inspection.sourceWidth, maxDimension / inspection.sourceHeight);
    const width = Math.max(1, Math.round(inspection.sourceWidth * scale));
    const height = Math.max(1, Math.round(inspection.sourceHeight * scale));
    const sampledFps = Math.max(0.1, Math.min(MAX_MEDIA_FPS, options.fpsLimit || MAX_MEDIA_FPS, inspection.sourceFps));
    const colorMode = options.colorMode === 'grayscale' || options.colorMode === 'monochrome' ? options.colorMode : 'full';
    const monochromeThreshold = Math.max(0, Math.min(255, Math.round(options.monochromeThreshold ?? 128)));
    const differenceThreshold = Math.max(0, Math.min(255, Math.round(options.differenceThreshold ?? 0)));
    const decoder = await createDecoder(bytes, options.mimeType);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        decoder.close();
        throw new Error('Canvas rendering is unavailable for this image.');
    }

    let firstFrame: Uint32Array | undefined;
    let firstDurationTicks = 0;
    let previousFrame: Uint32Array | undefined;
    const transitions: MediaFrameTransition[] = [];
    const frameThumbnails: MediaFrameThumbnail[] = [];
    let sourceTimelineMicroseconds = 0;
    let nextSampleMicroseconds = 0;
    let sampleIndex = 0;
    try {
        for (let frameIndex = 0; frameIndex < inspection.frameCount; frameIndex++) {
            const { image } = await decoder.decode({ frameIndex, completeFramesOnly: true });
            try {
                const frameDuration = image.duration && image.duration > 0
                    ? image.duration
                    : 1_000_000 / inspection.sourceFps;
                const frameEnd = sourceTimelineMicroseconds + frameDuration;
                if (nextSampleMicroseconds + 0.5 < frameEnd || frameIndex === 0) {
                    context.clearRect(0, 0, width, height);
                    context.drawImage(image, 0, 0, width, height);
                    const rgba = context.getImageData(0, 0, width, height).data;
                    while (nextSampleMicroseconds + 0.5 < frameEnd || (frameIndex === 0 && sampleIndex === 0)) {
                        const pixels = pixelsFromRgba(rgba, previousFrame, colorMode, monochromeThreshold, differenceThreshold);
                        const durationTicks = sampleDurationTicks(sampleIndex, sampledFps);
                        sampleIndex++;
                        nextSampleMicroseconds = sampleIndex * 1_000_000 / sampledFps;
                        if (!previousFrame) {
                            firstFrame = pixels;
                            previousFrame = pixels;
                            firstDurationTicks = durationTicks;
                            frameThumbnails.push(createThumbnail(rgba, width, height));
                            continue;
                        }
                        const indices: number[] = [];
                        const colors: number[] = [];
                        pixels.forEach((color, index) => {
                            if (color === previousFrame![index]) return;
                            indices.push(index);
                            colors.push(color);
                        });
                        if (!indices.length) {
                            if (transitions.length) transitions[transitions.length - 1].durationTicks += durationTicks;
                            else firstDurationTicks += durationTicks;
                            continue;
                        }
                        transitions.push({ indices: Uint32Array.from(indices), colors: Uint32Array.from(colors), durationTicks });
                        frameThumbnails.push(createThumbnail(rgba, width, height));
                        previousFrame = pixels;
                    }
                }
                sourceTimelineMicroseconds = frameEnd;
            } finally {
                image.close();
            }
        }
    } finally {
        decoder.close();
    }
    if (!firstFrame) throw new Error('The browser image decoder did not produce a frame.');
    const durationTicks = firstDurationTicks + transitions.reduce((sum, transition) => sum + transition.durationTicks, 0);
    return {
        sourceName: options.sourceName,
        sourceWidth: inspection.sourceWidth,
        sourceHeight: inspection.sourceHeight,
        width,
        height,
        sourceFps: inspection.sourceFps,
        requestedFpsLimit: options.fpsLimit,
        sampledFps,
        factorioFps: sampleIndex * 60 / durationTicks,
        sampledFrameCount: sampleIndex,
        frameCount: transitions.length + 1,
        durationTicks,
        firstDurationTicks,
        firstFrame,
        transitions,
        frameThumbnails,
        colorMode,
        monochromeThreshold,
        differenceThreshold,
    };
};
