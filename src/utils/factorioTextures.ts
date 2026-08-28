export const FACTORIO_TEXTURE_IDS = [
  'small-lamp',
  'arithmetic-combinator',
  'constant-combinator',
  'decider-combinator',
  'display-panel',
  'programmable-speaker',
  'roboport',
  'small-electric-pole',
  'medium-electric-pole',
  'big-electric-pole',
  'substation',
] as const;

export type FactorioTextureId = typeof FACTORIO_TEXTURE_IDS[number];
export type FactorioTextureSet = Partial<Record<FactorioTextureId, ImageBitmap>>;
export type FactorioTextureAvailability = 'loading' | 'available' | 'unavailable' | 'error';

export interface FactorioTextureStatus {
  available: boolean;
  factorioDirectory?: string;
  textureIds: string[];
}

const isFactorioTextureId = (value: string): value is FactorioTextureId => (
  (FACTORIO_TEXTURE_IDS as readonly string[]).includes(value)
);

export async function loadFactorioTextures(status: FactorioTextureStatus): Promise<FactorioTextureSet> {
  const api = window.factorioLampEditor;
  if (!api?.readFactorioTexture) return {};
  const availableIds = status.textureIds.filter(isFactorioTextureId);
  const entries = await Promise.all(availableIds.map(async textureId => {
    try {
      const bytes = await api.readFactorioTexture(textureId);
      const ownedBytes = Uint8Array.from(bytes);
      const blob = new Blob([ownedBytes.buffer as ArrayBuffer], { type: 'image/png' });
      // Factorio inventory icons are horizontal mipmap sheets. The native
      // 64 px artwork is the first square; the remaining columns are smaller
      // mip levels used by the game UI.
      const bitmap = await createImageBitmap(blob, 0, 0, 64, 64);
      return [textureId, bitmap] as const;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(entry => entry !== null)) as FactorioTextureSet;
}

export function closeFactorioTextures(textures: FactorioTextureSet | null | undefined) {
  if (!textures) return;
  for (const texture of Object.values(textures)) texture?.close();
}
