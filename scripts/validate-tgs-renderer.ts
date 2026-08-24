import { decodeTgsAnimation } from '../src/utils/tgsAnimation';

declare global {
    interface Window {
        runTgsRendererTest?: (base64: string) => Promise<Record<string, number | boolean>>;
    }
}

window.runTgsRendererTest = async base64 => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const decoded = await decodeTgsAnimation(buffer, {
        sourceName: 'test.tgs',
        fpsLimit: 30,
        maxDimension: 8,
        colorMode: 'full',
    });
    return {
        sourceWidth: decoded.sourceWidth,
        sourceHeight: decoded.sourceHeight,
        sampledFrameCount: decoded.sampledFrameCount,
        decodedFrameCount: decoded.frameCount,
        hasVisiblePixels: decoded.firstFrame.some(pixel => pixel !== 0),
    };
};
