import type { AnimationItem } from 'lottie-web';
import type {
    DecodedMediaAnimation,
    MediaFrameThumbnail,
    MediaFrameTransition,
} from './mediaAnimation';
import { decodeTgsDocument } from './tgsDocument';
export { inspectTgs, type TgsInspection } from './tgsDocument';

const MAX_MEDIA_FPS = 30;
const THUMBNAIL_DIMENSION = 56;

export interface TgsDecodeOptions {
    sourceName: string;
    fpsLimit: number;
    maxDimension: number;
    targetWidth?: number;
    targetHeight?: number;
    colorMode?: 'full' | 'grayscale' | 'monochrome';
    monochromeThreshold?: number;
    differenceThreshold?: number;
}

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

const waitUntilLoaded = (animation: AnimationItem): Promise<void> => new Promise((resolve, reject) => {
    if (animation.isLoaded) {
        resolve();
        return;
    }
    const timeout = window.setTimeout(() => reject(new Error('The TGS renderer did not finish loading.')), 10_000);
    animation.addEventListener('DOMLoaded', () => {
        window.clearTimeout(timeout);
        resolve();
    });
    animation.addEventListener('data_failed', () => {
        window.clearTimeout(timeout);
        reject(new Error('The TGS animation contains unsupported or invalid Lottie data.'));
    });
});

export const decodeTgsAnimation = async (
    bytes: ArrayBuffer,
    options: TgsDecodeOptions,
): Promise<DecodedMediaAnimation> => {
    const { default: lottie } = await import('lottie-web');
    const animationData = decodeTgsDocument(bytes);
    const maxDimension = Math.max(1, Math.min(1024, Math.floor(options.maxDimension) || 512));
    const requestedWidth = Number.isFinite(options.targetWidth) ? Math.max(1, Math.min(maxDimension, Math.round(options.targetWidth!))) : null;
    const requestedHeight = Number.isFinite(options.targetHeight) ? Math.max(1, Math.min(maxDimension, Math.round(options.targetHeight!))) : null;
    const scale = requestedWidth || requestedHeight
        ? Math.min(
            maxDimension / animationData.w,
            maxDimension / animationData.h,
            requestedWidth ? requestedWidth / animationData.w : Number.POSITIVE_INFINITY,
            requestedHeight ? requestedHeight / animationData.h : Number.POSITIVE_INFINITY,
        )
        : Math.min(1, maxDimension / animationData.w, maxDimension / animationData.h);
    const width = Math.max(1, Math.round(animationData.w * scale));
    const height = Math.max(1, Math.round(animationData.h * scale));
    const sampledFps = Math.max(0.1, Math.min(MAX_MEDIA_FPS, options.fpsLimit || MAX_MEDIA_FPS, animationData.fr));
    const sourceFrameCount = Math.max(1, Math.ceil(animationData.op - animationData.ip));
    const durationSeconds = sourceFrameCount / animationData.fr;
    const sampledFrameCount = Math.max(1, Math.ceil(durationSeconds * sampledFps));
    const colorMode = options.colorMode === 'grayscale' || options.colorMode === 'monochrome' ? options.colorMode : 'full';
    const monochromeThreshold = Math.max(0, Math.min(255, Math.round(options.monochromeThreshold ?? 128)));
    const differenceThreshold = Math.max(0, Math.min(255, Math.round(options.differenceThreshold ?? 0)));

    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        opacity: '0',
    });
    document.body.appendChild(container);
    let animation: AnimationItem | null = null;
    try {
        animation = lottie.loadAnimation({
            container,
            renderer: 'canvas',
            loop: false,
            autoplay: false,
            animationData,
            rendererSettings: { clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
        });
        await waitUntilLoaded(animation);
        const outputCanvas = window.document.createElement('canvas');
        outputCanvas.width = width;
        outputCanvas.height = height;
        const context = outputCanvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas rendering is unavailable for this TGS file.');

        let firstFrame: Uint32Array | undefined;
        let firstDurationTicks = 0;
        let previousFrame: Uint32Array | undefined;
        const transitions: MediaFrameTransition[] = [];
        const frameThumbnails: MediaFrameThumbnail[] = [];
        for (let sampleIndex = 0; sampleIndex < sampledFrameCount; sampleIndex++) {
            const sourceFrame = Math.min(sourceFrameCount - 1, Math.floor(sampleIndex * animationData.fr / sampledFps));
            animation.goToAndStop(sourceFrame, true);
            const sourceCanvas = container.querySelector('canvas');
            if (!sourceCanvas) throw new Error('The TGS renderer did not produce a canvas.');
            context.clearRect(0, 0, width, height);
            context.drawImage(sourceCanvas, 0, 0, width, height);
            const rgba = context.getImageData(0, 0, width, height).data;
            const pixels = pixelsFromRgba(rgba, previousFrame, colorMode, monochromeThreshold, differenceThreshold);
            const durationTicks = sampleDurationTicks(sampleIndex, sampledFps);
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
        if (!firstFrame) throw new Error('The TGS renderer did not produce a frame.');
        const durationTicks = firstDurationTicks + transitions.reduce((sum, transition) => sum + transition.durationTicks, 0);
        return {
            sourceName: options.sourceName,
            sourceWidth: animationData.w,
            sourceHeight: animationData.h,
            width,
            height,
            sourceFps: animationData.fr,
            requestedFpsLimit: options.fpsLimit,
            sampledFps,
            factorioFps: sampledFrameCount * 60 / durationTicks,
            sampledFrameCount,
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
    } finally {
        animation?.destroy();
        container.remove();
    }
};
