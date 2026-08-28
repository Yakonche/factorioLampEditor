interface Window {
  factorioLampEditor?: {
    copyText: (text: string) => Promise<{ length: number; verified?: boolean }>;
    readText: () => Promise<string>;
    saveBlueprint: (text: string, suggestedName: string) => Promise<{
      canceled: boolean;
      filePath?: string;
      length?: number;
    }>;
    decodeMedia: (request: {
      sourceName: string;
      bytes: ArrayBuffer;
      fpsLimit: number;
      maxDimension: number;
      targetWidth?: number;
      targetHeight?: number;
      colorMode?: 'full' | 'grayscale' | 'monochrome';
      monochromeThreshold?: number;
      differenceThreshold?: number;
    }) => Promise<import('./utils/mediaAnimation').DecodedMediaAnimation>;
    inspectMedia: (request: {
      sourceName: string;
      bytes: ArrayBuffer;
    }) => Promise<{
      sourceName: string;
      sourceWidth: number;
      sourceHeight: number;
      sourceFps: number;
    }>;
    decodeAudioNotes: (request: {
      sourceName: string;
      bytes: ArrayBuffer;
      notesPerSecond: number;
      voicesPerChannel: number;
    }) => Promise<import('./utils/audio').DecodedAudioTrack>;
    getFactorioSpeakerSoundStatus: () => Promise<{
      available: boolean;
      soundDirectory?: string;
    }>;
    selectFactorioSpeakerSounds: () => Promise<{
      canceled: boolean;
      available?: boolean;
      soundDirectory?: string;
    }>;
    readFactorioSpeakerSound: (
      instrument: import('./utils/audio').AudioInstrumentName,
      pitch: number,
    ) => Promise<Uint8Array>;
    getFactorioTextureStatus: () => Promise<{
      available: boolean;
      factorioDirectory?: string;
      textureIds: string[];
    }>;
    selectFactorioTextures: () => Promise<{
      canceled: boolean;
      available?: boolean;
      factorioDirectory?: string;
      textureIds?: string[];
    }>;
    readFactorioTexture: (textureId: string) => Promise<Uint8Array>;
    listSystemFonts: () => Promise<string[]>;
    getEmojiAsset: (
      provider: import('./utils/emojiAssets').EmojiAssetProvider,
      codepoint: string,
    ) => Promise<{
      bytes: Uint8Array;
      mimeType: string;
      source: 'cache' | 'network';
    }>;
  };
}
