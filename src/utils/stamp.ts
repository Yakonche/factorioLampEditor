import { emojiFontFamily } from './fonts';

export interface StampBuffer {
    w: number;
    h: number;
    data: Uint32Array;
    animationFrames?: StampAnimationFrame[];
}

export interface StampAnimationFrame {
    data: Uint32Array;
    durationTicks: number;
}

export interface TextCharacterStyle {
    fontSize: number;
    fontFamily: string;
    color: string;
}

export interface TextStampOptions {
    text: string;
    defaultStyle: TextCharacterStyle;
    characterStyles?: Record<number, Partial<TextCharacterStyle>>;
    animatedCharacters?: Record<number, string[]>;
    emojiFontFamily?: string;
    /** Total display width, including the mandatory one-cell border. */
    viewportWidth?: number;
    scroll?: boolean;
    frameDurationTicks?: number;
}

type RenderedText = {
    width: number;
    height: number;
    cells: Uint32Array;
};

const quoteFontFamily = (family: string) => `"${family.replace(/["\\]/g, '')}"`;
const DEFAULT_EMOJI_FONT_STACK = emojiFontFamily('automatic');
const EMOJI_GRAPHEME = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3)/u;
const fontDeclaration = (
    style: TextCharacterStyle,
    grapheme = '',
    selectedEmojiFontFamily = DEFAULT_EMOJI_FONT_STACK,
) => (
    EMOJI_GRAPHEME.test(grapheme)
        ? `${style.fontSize}px ${selectedEmojiFontFamily}, ${quoteFontFamily(style.fontFamily)}, sans-serif`
        : `${style.fontSize}px ${quoteFontFamily(style.fontFamily)}, ${selectedEmojiFontFamily}, sans-serif`
);

export function splitTextGraphemes(text: string): string[] {
    const normalized = text.replace(/\r\n?/g, '\n');
    if (typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return [...segmenter.segment(normalized)].map(segment => segment.segment);
    }
    return Array.from(normalized);
}

const resolveStyle = (
    options: TextStampOptions,
    graphemeIndex: number,
): TextCharacterStyle => ({
    ...options.defaultStyle,
    ...(options.characterStyles?.[graphemeIndex] ?? {}),
    fontSize: Math.max(1, Math.round(
        options.characterStyles?.[graphemeIndex]?.fontSize ?? options.defaultStyle.fontSize,
    )),
});

const renderStyledText = (
    options: TextStampOptions,
    animationIndex: number,
): RenderedText | null => {
    const graphemes = splitTextGraphemes(options.text);
    const measurementCanvas = document.createElement('canvas');
    const measurementContext = measurementCanvas.getContext('2d', { willReadFrequently: true });
    if (!measurementContext) return null;

    const lines: {
        grapheme: string;
        style: TextCharacterStyle;
        width: number;
        glyphWidth: number;
        leftBearing: number;
        ascent: number;
        descent: number;
    }[][] = [[]];
    graphemes.forEach((originalGrapheme, graphemeIndex) => {
        if (originalGrapheme === '\n') {
            lines.push([]);
            return;
        }
        const animation = options.animatedCharacters?.[graphemeIndex];
        const variants = animation?.length ? animation : [originalGrapheme];
        const grapheme = animation?.length
            ? variants[animationIndex % variants.length]
            : originalGrapheme;
        const style = resolveStyle(options, graphemeIndex);
        const variantMetrics = variants.map(variant => {
            measurementContext.font = fontDeclaration(style, variant, options.emojiFontFamily);
            const metrics = measurementContext.measureText(variant);
            const leftBearing = Math.max(0, Math.ceil(metrics.actualBoundingBoxLeft || 0));
            const rightBearing = Math.max(0, Math.ceil(metrics.actualBoundingBoxRight || 0));
            return {
                variant,
                width: Math.max(1, Math.ceil(metrics.width), leftBearing + rightBearing),
                leftBearing,
                ascent: Math.max(1, Math.ceil(metrics.actualBoundingBoxAscent || 0)),
                descent: Math.max(1, Math.ceil(metrics.actualBoundingBoxDescent || 0)),
            };
        });
        const selectedMetrics = variantMetrics.find(metrics => metrics.variant === grapheme) ?? variantMetrics[0];
        const width = Math.max(...variantMetrics.map(metrics => metrics.width));
        const ascent = Math.max(
            1,
            ...variantMetrics.map(metrics => metrics.ascent),
            Math.ceil(style.fontSize * 0.9),
        );
        const descent = Math.max(
            1,
            ...variantMetrics.map(metrics => metrics.descent),
            Math.ceil(style.fontSize * 0.25),
        );
        lines[lines.length - 1].push({
            grapheme,
            style,
            width,
            glyphWidth: selectedMetrics.width,
            leftBearing: selectedMetrics.leftBearing,
            ascent,
            descent,
        });
    });

    const lineMetrics = lines.map(line => {
        const ascent = Math.max(1, ...line.map(item => item.ascent));
        const descent = Math.max(1, ...line.map(item => item.descent));
        return { ascent, descent, height: ascent + descent + 4 };
    });
    const width = Math.max(1, ...lines.map(line => line.reduce((sum, item) => sum + item.width, 4)));
    const height = Math.max(1, lineMetrics.reduce((sum, value) => sum + value.height, 0));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, width, height);
    context.textBaseline = 'alphabetic';

    let y = 0;
    lines.forEach((line, lineIndex) => {
        let x = 2;
        const metrics = lineMetrics[lineIndex];
        const baseline = y + 2 + metrics.ascent;
        line.forEach((item) => {
            context.font = fontDeclaration(item.style, item.grapheme, options.emojiFontFamily);
            context.fillStyle = item.style.color;
            const centeredOffset = Math.max(0, (item.width - item.glyphWidth) / 2);
            context.fillText(item.grapheme, x + centeredOffset + item.leftBearing, baseline);
            x += item.width;
        });
        y += metrics.height;
    });

    const rgba = context.getImageData(0, 0, width, height).data;
    const cells = new Uint32Array(width * height);
    for (let index = 0; index < cells.length; index++) {
        const sourceOffset = index * 4;
        if (rgba[sourceOffset + 3] < 80) continue;
        cells[index] = (
            0xff000000
            | (rgba[sourceOffset + 2] << 16)
            | (rgba[sourceOffset + 1] << 8)
            | rgba[sourceOffset]
        ) >>> 0;
    }
    return { width, height, cells };
};

const createViewportFrame = (
    rendered: RenderedText,
    width: number,
    height: number,
    horizontalOffset: number,
) => {
    const cells = new Uint32Array(width * height);
    const innerWidth = Math.max(1, width - 2);
    const innerHeight = Math.max(1, height - 2);
    for (let y = 0; y < Math.min(innerHeight, rendered.height); y++) {
        for (let x = 0; x < innerWidth; x++) {
            const sourceX = horizontalOffset + x;
            if (sourceX < 0 || sourceX >= rendered.width) continue;
            cells[(y + 1) * width + x + 1] = rendered.cells[y * rendered.width + sourceX];
        }
    }
    return cells;
};

export async function createTextStamp(options: TextStampOptions): Promise<StampBuffer | null> {
    if (!options.text) return null;
    const graphemes = splitTextGraphemes(options.text);
    const fontLoads = new Map<string, Promise<FontFace[]>>();
    graphemes.forEach((grapheme, graphemeIndex) => {
        if (grapheme === '\n') return;
        const style = resolveStyle(options, graphemeIndex);
        const variants = options.animatedCharacters?.[graphemeIndex] ?? [grapheme];
        variants.forEach(variant => {
            const descriptor = fontDeclaration(style, variant, options.emojiFontFamily);
            const loadKey = `${descriptor}\n${variant}`;
            if (!fontLoads.has(loadKey)) {
                fontLoads.set(loadKey, document.fonts.load(descriptor, variant));
            }
        });
    });
    await Promise.all(fontLoads.values());

    const animationLength = Math.max(
        1,
        ...Object.values(options.animatedCharacters ?? {}).map(frames => Math.max(1, frames.length)),
    );
    const renderedFrames = Array.from({ length: animationLength }, (_, animationIndex) => (
        renderStyledText(options, animationIndex)
    )).filter((frame): frame is RenderedText => Boolean(frame));
    if (!renderedFrames.length) return null;

    const maximumContentWidth = Math.max(...renderedFrames.map(frame => frame.width));
    const maximumContentHeight = Math.max(...renderedFrames.map(frame => frame.height));
    const width = Math.min(1024, Math.max(3, Math.round(options.viewportWidth ?? maximumContentWidth + 2)));
    const height = Math.min(1024, maximumContentHeight + 2);
    const maximumOffset = Math.max(0, maximumContentWidth - Math.max(1, width - 2));
    const scrollFrameCount = options.scroll && maximumOffset > 0 ? maximumOffset + 1 : 1;
    const frameCount = Math.max(animationLength, scrollFrameCount);
    const durationTicks = Math.max(2, Math.round(options.frameDurationTicks ?? 6));
    const animationFrames: StampAnimationFrame[] = [];

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const rendered = renderedFrames[frameIndex % renderedFrames.length];
        const offset = scrollFrameCount > 1 ? frameIndex % scrollFrameCount : 0;
        animationFrames.push({
            data: createViewportFrame(rendered, width, height, offset),
            durationTicks,
        });
    }
    const hasVisiblePixel = animationFrames.some(frame => frame.data.some(Boolean));
    if (!hasVisiblePixel) return null;
    return {
        w: width,
        h: height,
        data: animationFrames[0].data,
        ...(animationFrames.length > 1 ? { animationFrames } : {}),
    };
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            if (typeof event.target?.result === 'string') image.src = event.target.result;
            else reject(new Error('Failed to read file'));
        };
        reader.readAsDataURL(file);
    });
}

export function generateImageBuffer(img: HTMLImageElement, targetW: number, targetH: number): StampBuffer {
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Context failed");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(img, 0, 0, targetW, targetH);
    const pixels = context.getImageData(0, 0, targetW, targetH).data;
    const buffer = new Uint32Array(targetW * targetH);
    for (let index = 0; index < buffer.length; index++) {
        const offset = index * 4;
        if (pixels[offset + 3] > 128) {
            buffer[index] = (0xff000000 | (pixels[offset + 2] << 16) | (pixels[offset + 1] << 8) | pixels[offset]) >>> 0;
        }
    }
    return { w: targetW, h: targetH, data: buffer };
}
