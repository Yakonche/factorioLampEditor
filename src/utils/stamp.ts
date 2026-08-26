import { emojiFontFamily } from './fonts';
import type { EmojiStaticAssetProvider } from './emojiAssets';
import { cloneGrid, type GridData } from './grid';
import type { GridAnimationData, MediaFrameTransition } from './mediaAnimation';

export const DEFAULT_TEXT_VIEWPORT_WIDTH = 256;
export const DEFAULT_TEXT_VIEWPORT_HEIGHT = 64;
export const EMOJI_ANIMATION_FRAME_TICKS = 12;

export type TextScrollDirection =
    | 'right-to-left'
    | 'left-to-right'
    | 'top-to-bottom'
    | 'bottom-to-top';

export interface StampBuffer {
    w: number;
    h: number;
    data: Uint32Array;
    animation?: StampAnimation;
    sourceName?: string;
}

export interface StampAnimation {
    firstDurationTicks: number;
    sourceFrameCount: number;
    transitions: MediaFrameTransition[];
}

export interface TextCharacterStyle {
    fontSize: number;
    fontFamily: string;
    color: string;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    underline?: boolean;
}

export type TextCharacterAnimationEffect = 'sequence' | 'blink' | 'twinkle' | 'pulse';

export interface TextCharacterAnimation {
    frames: string[];
    effect?: TextCharacterAnimationEffect;
}

export type TextCharacterAnimationInput = string[] | TextCharacterAnimation;

export interface TextStampOptions {
    text: string;
    defaultStyle: TextCharacterStyle;
    characterStyles?: Record<number, Partial<TextCharacterStyle>>;
    animatedCharacters?: Record<number, TextCharacterAnimationInput>;
    /** Real raster animations attached to graphemes inserted from the animated emoji catalog. */
    animatedEmojiStamps?: Record<number, StampBuffer>;
    emojiFontFamily?: string;
    emojiArtworkStyle?: 'font' | EmojiStaticAssetProvider;
    emojiImageLoader?: (emoji: string) => Promise<HTMLImageElement | null>;
    /** Preloaded artwork used internally while rasterizing image-based emoji styles. */
    emojiImages?: ReadonlyMap<string, HTMLImageElement>;
    /** Total display width, including the mandatory one-cell border. */
    viewportWidth?: number;
    /** Total display height, including the mandatory one-cell border. */
    viewportHeight?: number;
    scroll?: boolean;
    scrollDirection?: TextScrollDirection;
    frameDurationTicks?: number;
}

export type RenderedText = {
    width: number;
    height: number;
    cells: Uint32Array;
};

type CharacterAnimationTransform = {
    opacity: number;
    scaleX: number;
    scaleY: number;
};

const IDENTITY_ANIMATION_TRANSFORM: CharacterAnimationTransform = {
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
};

const normalizeCharacterAnimation = (
    animation: TextCharacterAnimationInput | undefined,
    fallback: string,
): Required<TextCharacterAnimation> => {
    if (Array.isArray(animation)) {
        return {
            frames: animation.length ? animation : [fallback],
            effect: 'sequence',
        };
    }
    return {
        frames: animation?.frames.length ? animation.frames : [fallback],
        effect: animation?.effect ?? 'sequence',
    };
};

const animationTransform = (
    effect: TextCharacterAnimationEffect,
    frameIndex: number,
): CharacterAnimationTransform => {
    if (effect === 'blink') {
        const scaleY = [1, 0.35, 0, 0.35][frameIndex % 4];
        return { opacity: scaleY ? 1 : 0, scaleX: 1, scaleY };
    }
    if (effect === 'pulse') {
        const scale = [0.86, 1, 1.14, 1][frameIndex % 4];
        return { opacity: 1, scaleX: scale, scaleY: scale };
    }
    if (effect === 'twinkle') {
        const scale = [0.9, 1.08, 1, 1.14][frameIndex % 4];
        const opacity = [0.72, 1, 0.82, 1][frameIndex % 4];
        return { opacity, scaleX: scale, scaleY: scale };
    }
    return IDENTITY_ANIMATION_TRANSFORM;
};

const maximumAnimationScale = (effect: TextCharacterAnimationEffect) => (
    effect === 'pulse' || effect === 'twinkle' ? 1.14 : 1
);

const normalizeStampDurationTicks = (value: number) => Math.max(2, Math.round(value));

export const stampAnimationDurationTicks = (stamp: StampBuffer): number => {
    if (!stamp.animation) return EMOJI_ANIMATION_FRAME_TICKS;
    return normalizeStampDurationTicks(stamp.animation.firstDurationTicks)
        + stamp.animation.transitions.reduce(
            (total, transition) => total + normalizeStampDurationTicks(transition.durationTicks),
            0,
        );
};

export const stampAnimationSampleCount = (
    stamp: StampBuffer,
    sampleDurationTicks = EMOJI_ANIMATION_FRAME_TICKS,
): number => (
    stamp.animation
        ? Math.max(1, Math.ceil(
            stampAnimationDurationTicks(stamp) / normalizeStampDurationTicks(sampleDurationTicks),
        ))
        : 1
);

export const renderStampAnimationAtTick = (stamp: StampBuffer, tick: number): Uint32Array => {
    const cells = stamp.data.slice();
    if (!stamp.animation) return cells;
    const durationTicks = stampAnimationDurationTicks(stamp);
    const normalizedTick = ((Math.floor(tick) % durationTicks) + durationTicks) % durationTicks;
    let frameEndTick = normalizeStampDurationTicks(stamp.animation.firstDurationTicks);
    if (normalizedTick < frameEndTick) return cells;
    for (const transition of stamp.animation.transitions) {
        for (let patchIndex = 0; patchIndex < transition.indices.length; patchIndex++) {
            cells[transition.indices[patchIndex]] = transition.colors[patchIndex];
        }
        frameEndTick += normalizeStampDurationTicks(transition.durationTicks);
        if (normalizedTick < frameEndTick) break;
    }
    return cells;
};

const renderStampAnimationImage = (stamp: StampBuffer, tick: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = stamp.w;
    canvas.height = stamp.h;
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const cells = renderStampAnimationAtTick(stamp, tick);
    const bytes = new Uint8ClampedArray(
        cells.buffer as ArrayBuffer,
        cells.byteOffset,
        cells.byteLength,
    );
    context.putImageData(new ImageData(bytes, stamp.w, stamp.h), 0, 0);
    return canvas;
};

export const animationFrameIndexForTimelineStep = (
    frameIndex: number,
    frameCount: number,
    animationLength: number,
    durationTicks: number,
    animationFrameDurationTicks: number,
) => {
    if (animationLength <= 1 || frameCount <= 1) return 0;
    const normalizedFrameCount = Math.max(1, Math.round(frameCount));
    const totalDurationTicks = normalizedFrameCount * Math.max(2, Math.round(durationTicks));
    const animationCycleTicks = animationLength * Math.max(2, Math.round(animationFrameDurationTicks));
    const completeCycles = Math.max(1, Math.round(totalDurationTicks / animationCycleTicks));
    return Math.floor(
        Math.max(0, Math.round(frameIndex)) * animationLength * completeCycles / normalizedFrameCount,
    ) % animationLength;
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
        ? `${style.fontStyle ?? 'normal'} ${style.fontWeight ?? 'normal'} ${style.fontSize}px ${selectedEmojiFontFamily}, ${quoteFontFamily(style.fontFamily)}, sans-serif`
        : `${style.fontStyle ?? 'normal'} ${style.fontWeight ?? 'normal'} ${style.fontSize}px ${quoteFontFamily(style.fontFamily)}, ${selectedEmojiFontFamily}, sans-serif`
);

export function splitTextGraphemes(text: string): string[] {
    const normalized = text.replace(/\r\n?/g, '\n');
    if (typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return [...segmenter.segment(normalized)].map(segment => segment.segment);
    }
    return Array.from(normalized);
}

export interface TextGraphemeAttachment {
    emoji: string;
}

export interface TextSelectionInsertion {
    text: string;
    graphemeIndex: number;
    caret: number;
}

/**
 * Replace the current textarea selection while returning both the UTF-16 caret
 * offset expected by the DOM and the grapheme index used by text stamps.
 */
export function insertAtTextSelection(
    text: string,
    selectionStart: number,
    selectionEnd: number,
    insertion: string,
): TextSelectionInsertion {
    const start = Math.max(0, Math.min(text.length, Math.min(selectionStart, selectionEnd)));
    const end = Math.max(start, Math.min(text.length, Math.max(selectionStart, selectionEnd)));
    const before = text.slice(0, start);
    return {
        text: `${before}${insertion}${text.slice(end)}`,
        graphemeIndex: splitTextGraphemes(before).length,
        caret: before.length + insertion.length,
    };
}

/**
 * Keep raster animations attached to the same logical emoji when ordinary
 * text is inserted or removed before them. Attachments inside the edited span
 * are discarded because a plain textarea cannot preserve their identity.
 */
export function reconcileTextGraphemeAttachments<T extends TextGraphemeAttachment>(
    previousText: string,
    nextText: string,
    attachments: Record<number, T>,
): Record<number, T> {
    const previous = splitTextGraphemes(previousText);
    const next = splitTextGraphemes(nextText);
    let commonPrefix = 0;
    while (
        commonPrefix < previous.length
        && commonPrefix < next.length
        && previous[commonPrefix] === next[commonPrefix]
    ) commonPrefix++;

    let commonSuffix = 0;
    while (
        commonSuffix < previous.length - commonPrefix
        && commonSuffix < next.length - commonPrefix
        && previous[previous.length - 1 - commonSuffix] === next[next.length - 1 - commonSuffix]
    ) commonSuffix++;

    const previousSuffixStart = previous.length - commonSuffix;
    const indexDelta = next.length - previous.length;
    const reconciled: Record<number, T> = {};
    Object.entries(attachments).forEach(([rawIndex, attachment]) => {
        const previousIndex = Number(rawIndex);
        const nextIndex = previousIndex < commonPrefix
            ? previousIndex
            : previousIndex >= previousSuffixStart
                ? previousIndex + indexDelta
                : -1;
        if (nextIndex >= 0 && next[nextIndex] === attachment.emoji) {
            reconciled[nextIndex] = attachment;
        }
    });
    return reconciled;
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
        glyphAscent: number;
        glyphDescent: number;
        glyphHeight: number;
        image?: CanvasImageSource;
        transform: CharacterAnimationTransform;
    }[][] = [[]];
    graphemes.forEach((originalGrapheme, graphemeIndex) => {
        if (originalGrapheme === '\n') {
            lines.push([]);
            return;
        }
        const animation = normalizeCharacterAnimation(
            options.animatedCharacters?.[graphemeIndex],
            originalGrapheme,
        );
        const animatedEmojiStamp = options.animatedEmojiStamps?.[graphemeIndex];
        const animatedEmojiImage = animatedEmojiStamp
            ? renderStampAnimationImage(
                animatedEmojiStamp,
                animationIndex * EMOJI_ANIMATION_FRAME_TICKS,
            )
            : undefined;
        const variants = animatedEmojiStamp ? [originalGrapheme] : animation.frames;
        const grapheme = animatedEmojiStamp
            ? originalGrapheme
            : variants[animationIndex % variants.length];
        const transform = animatedEmojiStamp
            ? IDENTITY_ANIMATION_TRANSFORM
            : animationTransform(animation.effect, animationIndex);
        const maximumScale = animatedEmojiStamp ? 1 : maximumAnimationScale(animation.effect);
        const style = resolveStyle(options, graphemeIndex);
        const variantMetrics = variants.map(variant => {
            const image = animatedEmojiImage ?? (
                options.emojiArtworkStyle !== 'font' && EMOJI_GRAPHEME.test(variant)
                    ? options.emojiImages?.get(variant)
                    : undefined
            );
            if (image) {
                const size = Math.max(1, Math.round(style.fontSize));
                return {
                    variant,
                    width: size,
                    leftBearing: 0,
                    ascent: size,
                    descent: 0,
                    image,
                };
            }
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
                image: undefined,
            };
        });
        const selectedMetrics = variantMetrics.find(metrics => metrics.variant === grapheme) ?? variantMetrics[0];
        const width = Math.ceil(Math.max(...variantMetrics.map(metrics => metrics.width)) * maximumScale);
        const imageOnly = variantMetrics.every(metrics => Boolean(metrics.image));
        const ascent = Math.max(
            1,
            ...variantMetrics.map(metrics => Math.ceil(metrics.ascent * maximumScale)),
            ...(imageOnly ? [] : [Math.ceil(style.fontSize * 0.9)]),
        );
        const descent = Math.max(
            0,
            ...variantMetrics.map(metrics => Math.ceil(metrics.descent * maximumScale)),
            ...(imageOnly ? [] : [1, Math.ceil(style.fontSize * 0.25)]),
        );
        lines[lines.length - 1].push({
            grapheme,
            style,
            width,
            glyphWidth: selectedMetrics.width,
            leftBearing: selectedMetrics.leftBearing,
            ascent,
            descent,
            glyphAscent: selectedMetrics.ascent,
            glyphDescent: selectedMetrics.descent,
            glyphHeight: selectedMetrics.ascent + selectedMetrics.descent,
            image: selectedMetrics.image,
            transform,
        });
    });

    const lineMetrics = lines.map(line => {
        const ascent = Math.max(1, ...line.map(item => item.ascent));
        const descent = Math.max(0, ...line.map(item => item.descent));
        return { ascent, descent, height: ascent + descent };
    });
    const width = Math.max(1, ...lines.map(line => line.reduce((sum, item) => sum + item.width, 0)));
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
        let x = 0;
        const metrics = lineMetrics[lineIndex];
        const baseline = y + metrics.ascent;
        line.forEach((item) => {
            context.font = fontDeclaration(item.style, item.grapheme, options.emojiFontFamily);
            context.fillStyle = item.style.color;
            const centeredOffset = Math.max(0, (item.width - item.glyphWidth) / 2);
            const glyphX = x + centeredOffset + item.leftBearing;
            if (item.transform.opacity > 0 && item.transform.scaleX > 0 && item.transform.scaleY > 0) {
                const glyphCenterX = glyphX + item.glyphWidth / 2;
                const glyphCenterY = baseline - (item.glyphAscent - item.glyphDescent) / 2;
                context.save();
                context.globalAlpha = item.transform.opacity;
                context.translate(glyphCenterX, glyphCenterY);
                context.scale(item.transform.scaleX, item.transform.scaleY);
                context.translate(-glyphCenterX, -glyphCenterY);
                if (item.image) {
                    context.drawImage(
                        item.image,
                        glyphX,
                        baseline - item.glyphAscent,
                        item.glyphWidth,
                        item.glyphHeight,
                    );
                } else {
                    context.fillText(item.grapheme, glyphX, baseline);
                }
                context.restore();
            }
            if (item.style.underline) {
                const underlineY = Math.min(
                    height - 1,
                    baseline + Math.max(1, Math.round(item.style.fontSize * 0.08)),
                );
                const underlineHeight = Math.max(1, Math.round(item.style.fontSize / 14));
                context.fillRect(
                    x + centeredOffset,
                    underlineY,
                    Math.max(1, item.glyphWidth),
                    underlineHeight,
                );
            }
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
    verticalOffset: number,
) => {
    const cells = new Uint32Array(width * height);
    const innerWidth = Math.max(1, width - 2);
    const innerHeight = Math.max(1, height - 2);
    for (let y = 0; y < Math.min(innerHeight, rendered.height); y++) {
        for (let x = 0; x < innerWidth; x++) {
            const sourceX = horizontalOffset + x;
            if (sourceX < 0 || sourceX >= rendered.width) continue;
            const sourceY = verticalOffset + y;
            if (sourceY < 0 || sourceY >= rendered.height) continue;
            cells[(y + 1) * width + x + 1] = rendered.cells[sourceY * rendered.width + sourceX];
        }
    }
    return cells;
};

const viewportCell = (
    rendered: RenderedText,
    viewportWidth: number,
    viewportHeight: number,
    horizontalOffset: number,
    verticalOffset: number,
    x: number,
    y: number,
) => {
    if (x === 0 || y === 0 || x >= viewportWidth - 1 || y >= viewportHeight - 1) return 0;
    const sourceX = horizontalOffset + x - 1;
    const sourceY = verticalOffset + y - 1;
    if (sourceX < 0 || sourceX >= rendered.width || sourceY < 0 || sourceY >= rendered.height) return 0;
    return rendered.cells[sourceY * rendered.width + sourceX];
};

const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const scrollOffsets = (
    direction: TextScrollDirection,
    frameIndex: number,
    scrollFrameCount: number,
) => {
    if (scrollFrameCount <= 1) return { horizontal: 0, vertical: 0 };
    const forwardOffset = frameIndex % scrollFrameCount;
    const reverseOffset = scrollFrameCount - 1 - forwardOffset;
    if (direction === 'left-to-right') return { horizontal: reverseOffset, vertical: 0 };
    if (direction === 'top-to-bottom') return { horizontal: 0, vertical: reverseOffset };
    if (direction === 'bottom-to-top') return { horizontal: 0, vertical: forwardOffset };
    return { horizontal: forwardOffset, vertical: 0 };
};

/**
 * Builds viewport animation differences without retaining every complete frame.
 * This keeps long scrolling text bounded by the actual pixel changes instead of
 * viewport area × frame count.
 */
export async function createSparseViewportAnimation(
    renderedFrames: readonly RenderedText[],
    width: number,
    height: number,
    scrollFrameCount: number,
    frameCount: number,
    durationTicks: number,
    direction: TextScrollDirection = 'right-to-left',
    animationFrameDurationTicks = durationTicks,
): Promise<{ data: Uint32Array; animation?: StampAnimation }> {
    if (!renderedFrames.length || frameCount < 1) {
        return { data: new Uint32Array(Math.max(0, width * height)) };
    }

    const normalizedDuration = Math.max(2, Math.round(durationTicks));
    const normalizedAnimationDuration = Math.max(2, Math.round(animationFrameDurationTicks));
    const firstRendered = renderedFrames[0];
    const firstOffset = scrollOffsets(direction, 0, scrollFrameCount);
    const data = createViewportFrame(
        firstRendered,
        width,
        height,
        firstOffset.horizontal,
        firstOffset.vertical,
    );
    if (frameCount === 1) return { data };

    const transitions: MediaFrameTransition[] = [];
    let firstDurationTicks = normalizedDuration;
    let previousRendered = firstRendered;
    let previousOffset = firstOffset;

    for (let frameIndex = 1; frameIndex < frameCount; frameIndex++) {
        const animationIndex = animationFrameIndexForTimelineStep(
            frameIndex,
            frameCount,
            renderedFrames.length,
            normalizedDuration,
            normalizedAnimationDuration,
        );
        const rendered = renderedFrames[animationIndex % renderedFrames.length];
        const offset = scrollOffsets(direction, frameIndex, scrollFrameCount);
        const indices: number[] = [];
        const colors: number[] = [];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const previousColor = viewportCell(
                    previousRendered,
                    width,
                    height,
                    previousOffset.horizontal,
                    previousOffset.vertical,
                    x,
                    y,
                );
                const color = viewportCell(
                    rendered,
                    width,
                    height,
                    offset.horizontal,
                    offset.vertical,
                    x,
                    y,
                );
                if (color === previousColor) continue;
                indices.push(y * width + x);
                colors.push(color);
            }
        }

        if (indices.length) {
            transitions.push({
                indices: Uint32Array.from(indices),
                colors: Uint32Array.from(colors),
                durationTicks: normalizedDuration,
            });
        } else if (transitions.length) {
            transitions[transitions.length - 1].durationTicks += normalizedDuration;
        } else {
            firstDurationTicks += normalizedDuration;
        }

        previousRendered = rendered;
        previousOffset = offset;
        if ((frameIndex & 127) === 0) await yieldToEventLoop();
    }

    return {
        data,
        ...(transitions.length ? {
            animation: {
                firstDurationTicks,
                sourceFrameCount: frameCount,
                transitions,
            },
        } : {}),
    };
}

/**
 * Converts stamp-local sparse transitions to grid indices. The local transition
 * indices are intentionally reused in place for an unclipped 1× stamp to avoid
 * temporarily doubling the memory needed by very long scrolling text.
 */
export async function placeSparseStampAnimation(
    stamp: Pick<StampBuffer, 'w' | 'h' | 'animation'>,
    firstFrame: GridData,
    startX: number,
    startY: number,
    scale: number,
): Promise<{ animation: GridAnimationData; unionGrid: GridData }> {
    if (!stamp.animation) throw new Error('The stamp does not contain an animation.');
    const stampAnimation: StampAnimation = stamp.animation;
    const stampWidth: number = stamp.w;
    const integerScale = Math.max(1, Math.round(scale));
    const destWidth = stampWidth * integerScale;
    const destHeight = stamp.h * integerScale;
    const fullyVisible = startX >= 0
        && startY >= 0
        && startX + destWidth <= firstFrame.width
        && startY + destHeight <= firstFrame.height;
    const unionGrid = cloneGrid(firstFrame);
    const transitions: MediaFrameTransition[] = [];

    for (let transitionIndex = 0; transitionIndex < stampAnimation.transitions.length; transitionIndex++) {
        const sourceTransition: MediaFrameTransition = stampAnimation.transitions[transitionIndex];
        if (integerScale === 1 && fullyVisible) {
            for (let patchIndex = 0; patchIndex < sourceTransition.indices.length; patchIndex++) {
                const localIndex: number = sourceTransition.indices[patchIndex];
                const localX: number = localIndex % stampWidth;
                const localY: number = Math.floor(localIndex / stampWidth);
                const gridIndex = (startY + localY) * firstFrame.width + startX + localX;
                sourceTransition.indices[patchIndex] = gridIndex;
                if (sourceTransition.colors[patchIndex]) {
                    unionGrid.cells[gridIndex] = sourceTransition.colors[patchIndex];
                }
            }
            transitions.push(sourceTransition);
        } else {
            const indices: number[] = [];
            const colors: number[] = [];
            for (let patchIndex = 0; patchIndex < sourceTransition.indices.length; patchIndex++) {
                const localIndex: number = sourceTransition.indices[patchIndex];
                const localX: number = localIndex % stampWidth;
                const localY: number = Math.floor(localIndex / stampWidth);
                const color = sourceTransition.colors[patchIndex];
                for (let offsetY = 0; offsetY < integerScale; offsetY++) {
                    const gridY = startY + localY * integerScale + offsetY;
                    if (gridY < 0 || gridY >= firstFrame.height) continue;
                    for (let offsetX = 0; offsetX < integerScale; offsetX++) {
                        const gridX: number = startX + localX * integerScale + offsetX;
                        if (gridX < 0 || gridX >= firstFrame.width) continue;
                        const gridIndex = gridY * firstFrame.width + gridX;
                        indices.push(gridIndex);
                        colors.push(color);
                        if (color) unionGrid.cells[gridIndex] = color;
                    }
                }
            }
            transitions.push({
                indices: Uint32Array.from(indices),
                colors: Uint32Array.from(colors),
                durationTicks: sourceTransition.durationTicks,
            });
        }

        if ((transitionIndex & 63) === 63) await yieldToEventLoop();
    }

    return {
        animation: {
            firstFrame,
            firstDurationTicks: stampAnimation.firstDurationTicks,
            transitions,
        },
        unionGrid,
    };
}

export async function createTextStamp(options: TextStampOptions): Promise<StampBuffer | null> {
    if (!options.text) return null;
    const graphemes = splitTextGraphemes(options.text);
    const fontLoads = new Map<string, Promise<FontFace[]>>();
    const emojiLoads = new Map<string, Promise<HTMLImageElement | null>>();
    graphemes.forEach((grapheme, graphemeIndex) => {
        if (grapheme === '\n') return;
        if (options.animatedEmojiStamps?.[graphemeIndex]) return;
        const style = resolveStyle(options, graphemeIndex);
        const animation = normalizeCharacterAnimation(options.animatedCharacters?.[graphemeIndex], grapheme);
        animation.frames.forEach(variant => {
            const descriptor = fontDeclaration(style, variant, options.emojiFontFamily);
            const loadKey = `${descriptor}\n${variant}`;
            if (!fontLoads.has(loadKey)) {
                fontLoads.set(loadKey, document.fonts.load(descriptor, variant));
            }
            if (
                options.emojiArtworkStyle !== 'font'
                && options.emojiImageLoader
                && EMOJI_GRAPHEME.test(variant)
                && !emojiLoads.has(variant)
            ) {
                emojiLoads.set(variant, options.emojiImageLoader(variant));
            }
        });
    });
    await Promise.all(fontLoads.values());
    const emojiImages = new Map<string, HTMLImageElement>();
    await Promise.all([...emojiLoads].map(async ([emoji, loader]) => {
        const image = await loader;
        if (image) emojiImages.set(emoji, image);
    }));
    const renderingOptions = emojiImages.size ? { ...options, emojiImages } : options;

    const animationLength = Math.max(
        1,
        ...Object.values(options.animatedCharacters ?? {}).map(animation => (
            Math.max(1, Array.isArray(animation) ? animation.length : animation.frames.length)
        )),
        ...Object.values(options.animatedEmojiStamps ?? {}).map(stamp => (
            stampAnimationSampleCount(stamp)
        )),
    );
    const renderedFrames = Array.from({ length: animationLength }, (_, animationIndex) => (
        renderStyledText(renderingOptions, animationIndex)
    )).filter((frame): frame is RenderedText => Boolean(frame));
    if (!renderedFrames.length) return null;

    const maximumContentWidth = Math.max(...renderedFrames.map(frame => frame.width));
    const maximumContentHeight = Math.max(...renderedFrames.map(frame => frame.height));
    const direction = options.scrollDirection ?? 'right-to-left';
    const verticalScroll = direction === 'top-to-bottom' || direction === 'bottom-to-top';
    const width = Math.min(1024, Math.max(3, Math.round(
        verticalScroll ? maximumContentWidth + 2 : options.viewportWidth ?? maximumContentWidth + 2,
    )));
    const height = Math.min(1024, Math.max(3, Math.round(
        verticalScroll ? options.viewportHeight ?? maximumContentHeight + 2 : maximumContentHeight + 2,
    )));
    const maximumOffset = verticalScroll
        ? Math.max(0, maximumContentHeight - Math.max(1, height - 2))
        : Math.max(0, maximumContentWidth - Math.max(1, width - 2));
    const scrollFrameCount = options.scroll && maximumOffset > 0 ? maximumOffset + 1 : 1;
    const scrolling = scrollFrameCount > 1;
    const frameCount = scrolling ? scrollFrameCount : animationLength;
    const durationTicks = scrolling
        ? Math.max(2, Math.round(options.frameDurationTicks ?? 6))
        : EMOJI_ANIMATION_FRAME_TICKS;
    const viewportAnimation = await createSparseViewportAnimation(
        renderedFrames,
        width,
        height,
        scrollFrameCount,
        frameCount,
        durationTicks,
        direction,
        EMOJI_ANIMATION_FRAME_TICKS,
    );
    const hasVisiblePixel = viewportAnimation.data.some(Boolean)
        || viewportAnimation.animation?.transitions.some(transition => transition.colors.some(Boolean));
    if (!hasVisiblePixel) return null;
    return {
        w: width,
        h: height,
        data: viewportAnimation.data,
        ...(viewportAnimation.animation ? { animation: viewportAnimation.animation } : {}),
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
