/// <reference lib="webworker" />

type ImageRequest = {
    id: number;
    image: ImageBitmap;
    width: number;
    height: number;
};

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

context.onmessage = (event: MessageEvent<ImageRequest>) => {
    const { id, image, width, height } = event.data;
    try {
        const canvas = new OffscreenCanvas(width, height);
        const canvasContext = canvas.getContext('2d', { willReadFrequently: true });
        if (!canvasContext) throw new Error('Unable to create image conversion context.');
        canvasContext.imageSmoothingEnabled = true;
        canvasContext.imageSmoothingQuality = 'high';
        canvasContext.drawImage(image, 0, 0, width, height);
        image.close();

        const rgba = canvasContext.getImageData(0, 0, width, height).data;
        const packed = new Uint32Array(width * height);
        for (let index = 0; index < packed.length; index++) {
            const offset = index * 4;
            if (rgba[offset + 3] > 128) {
                packed[index] = (
                    0xff000000
                    | (rgba[offset + 2] << 16)
                    | (rgba[offset + 1] << 8)
                    | rgba[offset]
                ) >>> 0;
            }
        }
        context.postMessage({ id, width, height, data: packed.buffer }, [packed.buffer]);
    } catch (error) {
        image.close();
        context.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};

export {};
