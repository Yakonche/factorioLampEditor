import {
    decodeBrowserImageAnimation,
    inspectBrowserImage,
} from '../src/utils/browserImageAnimation';

declare global {
    interface Window {
        runBrowserImageCodecTest?: (
            base64: string,
            mimeType: string,
            sourceName: string,
        ) => Promise<Record<string, number | boolean>>;
    }
}

window.runBrowserImageCodecTest = async (base64, mimeType, sourceName) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const inspection = await inspectBrowserImage(buffer, mimeType);
    const decoded = await decodeBrowserImageAnimation(buffer, {
        sourceName,
        mimeType,
        fpsLimit: 30,
        maxDimension: 8,
        colorMode: 'full',
    });
    return {
        sourceWidth: inspection.sourceWidth,
        sourceHeight: inspection.sourceHeight,
        sourceFrameCount: inspection.frameCount,
        decodedFrameCount: decoded.frameCount,
        sampledFrameCount: decoded.sampledFrameCount,
        hasVisiblePixels: decoded.firstFrame.some(pixel => pixel !== 0),
    };
};
