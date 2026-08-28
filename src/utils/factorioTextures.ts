export const FACTORIO_TEXTURE_IDS = [
  'small-lamp',
  'small-lamp-on',
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
  'terrain-nauvis',
  'terrain-laboratory',
] as const;

export type FactorioTextureId = typeof FACTORIO_TEXTURE_IDS[number];
export type GameTerrainTexture = 'default' | 'nauvis' | 'laboratory';
export type FactorioTextureAvailability = 'loading' | 'available' | 'unavailable' | 'error';

interface FactorioTextureDefinition {
  frameWidth: number;
  frameHeight: number;
  scale: number;
  shiftX: number;
  shiftY: number;
  cropOnLoad?: boolean;
}

export interface FactorioTextureSprite extends FactorioTextureDefinition {
  bitmap: ImageBitmap;
}

export type FactorioTextureSet = Partial<Record<FactorioTextureId, FactorioTextureSprite>>;

export interface FactorioTextureStatus {
  available: boolean;
  factorioDirectory?: string;
  textureIds: string[];
}

// Values mirror Factorio 2.x base prototypes. Sprite dimensions are source
// pixels; scale and shift use Factorio's 32-pixel tile coordinate system.
const FACTORIO_TEXTURE_DEFINITIONS: Record<FactorioTextureId, FactorioTextureDefinition> = {
  'small-lamp': { frameWidth: 83, frameHeight: 70, scale: 0.5, shiftX: 0.25, shiftY: 3 },
  'small-lamp-on': { frameWidth: 90, frameHeight: 78, scale: 0.5, shiftX: 0, shiftY: -7 },
  'arithmetic-combinator': { frameWidth: 144, frameHeight: 124, scale: 0.5, shiftX: 0.5, shiftY: 7.5 },
  'constant-combinator': { frameWidth: 114, frameHeight: 102, scale: 0.5, shiftX: 0, shiftY: 5 },
  'decider-combinator': { frameWidth: 156, frameHeight: 132, scale: 0.5, shiftX: 0.5, shiftY: 7.5 },
  'display-panel': { frameWidth: 128, frameHeight: 128, scale: 0.5, shiftX: 0, shiftY: 0 },
  'programmable-speaker': { frameWidth: 59, frameHeight: 178, scale: 0.5, shiftX: -2.25, shiftY: -39.5 },
  roboport: { frameWidth: 228, frameHeight: 277, scale: 0.5, shiftX: 2, shiftY: -2.25 },
  'small-electric-pole': { frameWidth: 72, frameHeight: 220, scale: 0.5, shiftX: 1.5, shiftY: -42.5 },
  'medium-electric-pole': { frameWidth: 84, frameHeight: 252, scale: 0.5, shiftX: 3.5, shiftY: -44 },
  'big-electric-pole': { frameWidth: 148, frameHeight: 312, scale: 0.5, shiftX: 0, shiftY: -51 },
  substation: { frameWidth: 138, frameHeight: 270, scale: 0.5, shiftX: 0, shiftY: -31 },
  'terrain-nauvis': { frameWidth: 32, frameHeight: 32, scale: 1, shiftX: 0, shiftY: 0, cropOnLoad: true },
  'terrain-laboratory': { frameWidth: 32, frameHeight: 32, scale: 1, shiftX: 0, shiftY: 0, cropOnLoad: true },
};

const isFactorioTextureId = (value: string): value is FactorioTextureId => (
  (FACTORIO_TEXTURE_IDS as readonly string[]).includes(value)
);

export async function loadFactorioTextures(status: FactorioTextureStatus): Promise<FactorioTextureSet> {
  const api = window.factorioLampEditor;
  if (!api?.readFactorioTexture) return {};
  const availableIds = status.textureIds.filter(isFactorioTextureId);
  const entries = await Promise.all(availableIds.map(async textureId => {
    try {
      const definition = FACTORIO_TEXTURE_DEFINITIONS[textureId];
      const bytes = await api.readFactorioTexture(textureId);
      const ownedBytes = Uint8Array.from(bytes);
      const blob = new Blob([ownedBytes.buffer as ArrayBuffer], { type: 'image/png' });
      const bitmap = definition.cropOnLoad
        ? await createImageBitmap(blob, 0, 0, definition.frameWidth, definition.frameHeight)
        : await createImageBitmap(blob);
      return [textureId, { bitmap, ...definition }] as const;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(entry => entry !== null)) as FactorioTextureSet;
}

export function closeFactorioTextures(textures: FactorioTextureSet | null | undefined) {
  if (!textures) return;
  for (const texture of Object.values(textures)) texture?.bitmap.close();
}
