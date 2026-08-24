import assert from 'node:assert/strict';
import { gzip } from 'pako';
import { decodeTgsDocument, inspectTgs } from '../src/utils/tgsDocument';

const animation = {
    v: '5.7.4',
    w: 512,
    h: 512,
    fr: 60,
    ip: 0,
    op: 180,
    layers: [],
};
const json = JSON.stringify(animation);
const zipped = gzip(json);
const zippedBuffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
assert.deepEqual(inspectTgs(zippedBuffer), { sourceWidth: 512, sourceHeight: 512, sourceFps: 60 });

const raw = new TextEncoder().encode(json);
const rawBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
assert.equal(decodeTgsDocument(rawBuffer).op, 180);
assert.throws(() => decodeTgsDocument(new TextEncoder().encode('{"w":0}').buffer), /invalid/i);

console.log(JSON.stringify({ tgs: true, gzip: true, rawJsonFallback: true }));
