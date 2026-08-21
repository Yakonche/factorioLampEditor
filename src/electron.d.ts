interface Window {
  factorioLampEditor?: {
    copyText: (text: string) => Promise<{ length: number }>;
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
    decodeAudioNotes: (request: {
      sourceName: string;
      bytes: ArrayBuffer;
      notesPerSecond: number;
    }) => Promise<import('./utils/audio').DecodedAudioTrack>;
  };
}
