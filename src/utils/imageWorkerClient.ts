import type { StampBuffer } from './stamp';

let requestId = 0;

export async function generateImageBufferInWorker(
    image: HTMLImageElement,
    width: number,
    height: number,
    signal?: AbortSignal,
): Promise<StampBuffer> {
    const bitmap = await createImageBitmap(image);
    if (signal?.aborted) {
        bitmap.close();
        throw new DOMException('Image conversion cancelled.', 'AbortError');
    }

    const worker = new Worker(new URL('../workers/image.worker.ts', import.meta.url), { type: 'module' });
    const id = ++requestId;
    return new Promise<StampBuffer>((resolve, reject) => {
        const abort = () => {
            worker.terminate();
            bitmap.close();
            reject(new DOMException('Image conversion cancelled.', 'AbortError'));
        };
        signal?.addEventListener('abort', abort, { once: true });

        worker.onmessage = (event: MessageEvent<{
            id: number;
            width?: number;
            height?: number;
            data?: ArrayBuffer;
            error?: string;
        }>) => {
            if (event.data.id !== id) return;
            signal?.removeEventListener('abort', abort);
            worker.terminate();
            if (event.data.error || !event.data.data) {
                reject(new Error(event.data.error || 'Image conversion failed.'));
                return;
            }
            resolve({
                w: event.data.width ?? width,
                h: event.data.height ?? height,
                data: new Uint32Array(event.data.data),
            });
        };
        worker.onerror = (event) => {
            signal?.removeEventListener('abort', abort);
            worker.terminate();
            reject(new Error(event.message || 'Image conversion worker failed.'));
        };
        worker.postMessage({ id, image: bitmap, width, height }, [bitmap]);
    });
}
