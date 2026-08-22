import type { BlueprintPreviewEntity } from './blueprint';

export const PREVIEW_SPATIAL_BUCKET_SIZE = 32;

export interface PreviewSpatialIndex {
    byTile: Map<string, BlueprintPreviewEntity>;
    byBucket: Map<string, BlueprintPreviewEntity[]>;
    bucketSize: number;
}

const bucketKey = (x: number, y: number) => `${x},${y}`;

export function buildPreviewSpatialIndex(
    entities: readonly BlueprintPreviewEntity[],
    bucketSize = PREVIEW_SPATIAL_BUCKET_SIZE,
): PreviewSpatialIndex {
    const normalizedBucketSize = Math.max(1, Math.round(bucketSize));
    const byTile = new Map<string, BlueprintPreviewEntity>();
    const byBucket = new Map<string, BlueprintPreviewEntity[]>();

    for (const entity of entities) {
        const startX = Math.floor(entity.x);
        const startY = Math.floor(entity.y);
        const endX = Math.ceil(entity.x + entity.width);
        const endY = Math.ceil(entity.y + entity.height);
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) byTile.set(`${x},${y}`, entity);
        }

        const firstBucketX = Math.floor(startX / normalizedBucketSize);
        const firstBucketY = Math.floor(startY / normalizedBucketSize);
        const lastBucketX = Math.floor((endX - 1) / normalizedBucketSize);
        const lastBucketY = Math.floor((endY - 1) / normalizedBucketSize);
        for (let bucketY = firstBucketY; bucketY <= lastBucketY; bucketY++) {
            for (let bucketX = firstBucketX; bucketX <= lastBucketX; bucketX++) {
                const key = bucketKey(bucketX, bucketY);
                const bucket = byBucket.get(key);
                if (bucket) bucket.push(entity);
                else byBucket.set(key, [entity]);
            }
        }
    }

    return { byTile, byBucket, bucketSize: normalizedBucketSize };
}

export function previewEntitiesInBounds(
    index: PreviewSpatialIndex,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
): BlueprintPreviewEntity[] {
    const firstBucketX = Math.floor(minX / index.bucketSize);
    const firstBucketY = Math.floor(minY / index.bucketSize);
    const lastBucketX = Math.floor(maxX / index.bucketSize);
    const lastBucketY = Math.floor(maxY / index.bucketSize);
    const visible = new Set<BlueprintPreviewEntity>();
    for (let bucketY = firstBucketY; bucketY <= lastBucketY; bucketY++) {
        for (let bucketX = firstBucketX; bucketX <= lastBucketX; bucketX++) {
            const bucket = index.byBucket.get(bucketKey(bucketX, bucketY));
            if (bucket) bucket.forEach(entity => visible.add(entity));
        }
    }
    return [...visible];
}
