import { ungzip } from 'pako';

export interface TgsDocument {
    w: number;
    h: number;
    fr: number;
    ip: number;
    op: number;
    [key: string]: unknown;
}

export interface TgsInspection {
    sourceWidth: number;
    sourceHeight: number;
    sourceFps: number;
}

export const decodeTgsDocument = (bytes: ArrayBuffer): TgsDocument => {
    const input = new Uint8Array(bytes);
    let json: string;
    try {
        json = ungzip(input, { to: 'string' });
    } catch {
        json = new TextDecoder().decode(input);
    }
    const document = JSON.parse(json) as Partial<TgsDocument>;
    const values = [document.w, document.h, document.fr, document.ip, document.op];
    if (values.some(value => !Number.isFinite(value))) throw new TypeError('This TGS file has invalid Lottie metadata.');
    if ((document.w ?? 0) <= 0 || (document.h ?? 0) <= 0 || (document.fr ?? 0) <= 0 || (document.op ?? 0) <= (document.ip ?? 0)) {
        throw new TypeError('This TGS file has invalid dimensions or timing.');
    }
    return document as TgsDocument;
};

export const inspectTgs = (bytes: ArrayBuffer): TgsInspection => {
    const animationData = decodeTgsDocument(bytes);
    return { sourceWidth: animationData.w, sourceHeight: animationData.h, sourceFps: animationData.fr };
};
