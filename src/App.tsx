import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import {
  Toolbar,
  type MediaColorMode,
  type MediaAnimationInfo,
  type SequenceFrameInfo,
  type ToolType,
} from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { HelpModal } from './components/HelpModal';
import { ImportSizeModal } from './components/ImportSizeModal';
import { FrameSelectionTray, type FrameSelectionItem } from './components/FrameSelectionTray';
import { SequenceFrameTray } from './components/SequenceFrameTray';
import { LampInspector } from './components/LampInspector';
import {
  DEFAULT_MAX_DEFINITION,
  DEFAULT_MAX_FRAME_COUNT,
  GRID_W,
  GRID_H,
  MAX_DEFINITION_LIMIT,
  PIXEL_SIZE,
  POLE_DATA,
  QUALITY_NAMES,
  ROBOPORT_SIZE,
  TEXT_SCALE_MIN,
  type BackgroundTileName,
} from './constants';
import {
  applyGridPatch,
  cloneGrid,
  colorToUint32,
  countLamps,
  createEmptyGrid,
  createGridPatch,
  floodFill,
  type GridData,
  type GridPatch,
} from './utils/grid';
import type { CameraState } from './utils/geometry';
import {
  createTextStamp,
  generateImageBuffer,
  loadImage,
  placeSparseStampAnimation,
  type StampBuffer,
  type TextStampOptions,
} from './utils/stamp';
import { generateImageBufferInWorker } from './utils/imageWorkerClient';
import {
  animationDurationTicks,
  animationFrameAtTick,
  animationMaximumFrameCount,
  animationTrackCount,
  composeGridAnimations,
  createAnimationPreviewTimeline,
  createAnimationTimeline,
  createAnimationTrackTimeline,
  createAnimationUnionGrid,
  createGridAnimationFromFrames,
  evenlySpacedFrameIndices,
  getGridAnimationTracks,
  placeDecodedAnimation,
  renderGridAnimationAtTick,
  selectDecodedMediaFrames,
  updateGridAnimationCellAtTick,
  type DecodedMediaAnimation,
  type GridAnimationData,
  type MediaFrameThumbnail,
} from './utils/mediaAnimation';
import {
  MAX_BLUEPRINT_PREVIEW_ENTITIES,
  type ActivePole,
  type ActiveRoboport,
  type AnimationEntityStats,
  type AnimationControllerSide,
  type BlueprintPreviewBounds,
  type BlueprintPreviewEntity,
} from './utils/blueprint';
import type {
  AudioInstrumentSelection,
  DecodedAudioTrack,
} from './utils/audio';
import {
  type NotoAnimatedEmojiEntry,
} from './utils/notoAnimatedEmoji';
import { loadEmojiAsset, loadEmojiImage } from './utils/emojiAssets';
import { decodeTgsAnimation, inspectTgs } from './utils/tgsAnimation';
import {
  browserImageMimeType,
  decodeBrowserImageAnimation,
  inspectBrowserImage,
} from './utils/browserImageAnimation';
import { useI18n } from './i18n';
import {
  isEditableKeyboardTarget,
  keyboardPanDirection,
  keyboardPanToken,
} from './utils/keyboardNavigation';
import {
  closeFactorioTextures,
  loadFactorioTextures,
  type FactorioTextureAvailability,
  type FactorioTextureSet,
  type FactorioTextureStatus,
} from './utils/factorioTextures';

type CalculationWorkerResponse = {
  id: number;
  kind: 'layout' | 'blueprint';
  poles?: ActivePole[];
  roboports?: ActiveRoboport[];
  previewEntities?: BlueprintPreviewEntity[];
  animationStats?: AnimationEntityStats;
  previewBounds?: BlueprintPreviewBounds | null;
  bpString?: string | null;
  status?: string;
  error?: string;
  progress?: number;
};

const EMPTY_ANIMATION_STATS: AnimationEntityStats = {
  deciderCombinatorCount: 0,
  arithmeticCombinatorCount: 0,
  constantCombinatorCount: 0,
  displayPanelCount: 0,
  controllerPoleCount: 0,
  controllerRoboportCount: 0,
  relayPoleCount: 0,
  programmableSpeakerCount: 0,
};

const KEYBOARD_PAN_SPEED = 640;

const fileExtension = (file: File): string => file.name.split('.').pop()?.toLocaleLowerCase() ?? '';
const isTgsFile = (file: File): boolean => fileExtension(file) === 'tgs'
  || file.type === 'application/x-tgsticker';

const containsApngAnimationChunk = async (file: File): Promise<boolean> => {
  if (file.type !== 'image/png' && fileExtension(file) !== 'png' && fileExtension(file) !== 'apng') return false;
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
  for (let index = 8; index + 8 <= bytes.length;) {
    const length = (bytes[index] * 0x1000000) + (bytes[index + 1] << 16) + (bytes[index + 2] << 8) + bytes[index + 3];
    const type = String.fromCharCode(bytes[index + 4], bytes[index + 5], bytes[index + 6], bytes[index + 7]);
    if (type === 'acTL') return true;
    if (!Number.isFinite(length) || length < 0) break;
    index += 12 + length;
  }
  return false;
};

const isMediaImportFile = async (file: File): Promise<boolean> => {
  const extension = fileExtension(file);
  if (['gif', 'apng', 'webp', 'webm', 'mp4', 'mov', 'mkv', 'avi', 'm4v', 'tgs'].includes(extension)) return true;
  if (file.type.startsWith('video/') || file.type === 'image/gif' || file.type === 'image/webp') return true;
  return containsApngAnimationChunk(file);
};

type ImportedFrame = {
  image: HTMLImageElement;
  originalW: number;
  originalH: number;
  sourceName: string;
  baseW: number;
  baseH: number;
  currentW: number;
  currentH: number;
  centerX: number;
  centerY: number;
};

type PendingImage = {
  image: HTMLImageElement;
  originalW: number;
  originalH: number;
  sourceName: string;
};

type SequenceFrame = ImportedFrame & {
  id: string;
  grid: GridData;
  delaySeconds: number;
  thumbnailUrl: string;
};

type PendingMediaSelection = {
  decoded: DecodedMediaAnimation;
  sourceFile: File;
  thumbnailUrls: string[];
  removals: Set<number>;
};

type MediaTargetSize = { width: number; height: number };

const mediaThumbnailToDataUrl = (thumbnail: MediaFrameThumbnail) => {
  const canvas = document.createElement('canvas');
  canvas.width = thumbnail.width;
  canvas.height = thumbnail.height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const imageData = new ImageData(thumbnail.width, thumbnail.height);
  imageData.data.set(thumbnail.rgba);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

const formatBlueprintLabel = (filename: string, width: number, height: number) => {
  const imageName = filename.replace(/\.[^/.]+$/, '').trim() || 'Imported Image';
  return `${imageName} (${width}x${height})`;
};

const POLE_TYPE_STORAGE_KEY = 'factorio-lamp-editor.pole-type';
const POLE_QUALITY_STORAGE_KEY = 'factorio-lamp-editor.pole-quality';
const GAME_TEXTURES_STORAGE_KEY = 'factorio-lamp-editor.game-textures';
const DEFAULT_POLE_TYPE = 'medium-electric-pole';

const storedPoleType = () => {
  if (typeof window === 'undefined') return DEFAULT_POLE_TYPE;
  const stored = window.localStorage.getItem(POLE_TYPE_STORAGE_KEY);
  return stored && Object.prototype.hasOwnProperty.call(POLE_DATA, stored)
    ? stored
    : DEFAULT_POLE_TYPE;
};

const storedPoleQuality = () => {
  if (typeof window === 'undefined') return 0;
  const stored = Number(window.localStorage.getItem(POLE_QUALITY_STORAGE_KEY));
  return Number.isInteger(stored) && stored >= 0 && stored < QUALITY_NAMES.length ? stored : 0;
};

const storedGameTexturesEnabled = () => (
  typeof window !== 'undefined'
  && window.localStorage.getItem(GAME_TEXTURES_STORAGE_KEY) === 'true'
);

function App() {
  const { t } = useI18n();

  // --- State ---
  // const [gridData] = useState<GridData>(() => createEmptyGrid(GRID_W, GRID_H));
  // We use a mutable ref for the grid to avoid React renders on every pixel change,
  // but we pass the *same* array instance to Canvas. Canvas RAF loop sees changes.
  // Undo/Redo needs to replace the array content or update the ref.
  // Actually, if we replace the array, we need to signal Canvas.
  // Let's use a Ref for the "active" grid, and only useState for things that change UI.
  // But wait, Canvas takes `gridData` as prop. If I change the content of the array, it works.
  // If I load a new array (Undo), I need to update the prop.
  // So:
  const gridRef = useRef<GridData>(createEmptyGrid(GRID_W, GRID_H));
  const mediaAnimationRef = useRef<GridAnimationData | null>(null);
  const decodedMediaRef = useRef<DecodedMediaAnimation | null>(null);
  const mediaUnionGridRef = useRef<GridData>(createEmptyGrid(GRID_W, GRID_H));
  const mediaPreviewGridRef = useRef<GridData>(createEmptyGrid(GRID_W, GRID_H));
  const mediaPreviewFrameRef = useRef(0);
  const mediaPreviewTickRef = useRef(0);
  const mediaSourceFileRef = useRef<File | null>(null);
  const mediaDecodeRequestRef = useRef(0);
  const audioTrackRef = useRef<DecodedAudioTrack | null>(null);
  const audioSourceFileRef = useRef<File | null>(null);
  const audioDecodeRequestRef = useRef(0);
  const lastDecodedNotesPerSecondRef = useRef<number | null>(null);
  const lastDecodedVoicesPerChannelRef = useRef<number | null>(null);
  const lastDecodedFpsLimitRef = useRef<number | null>(null);
  const lastDecodedMaxDefinitionRef = useRef<number | null>(null);
  const lastDecodedTargetSizeRef = useRef<string | null>(null);
  const lastDecodedColorModeRef = useRef<MediaColorMode | null>(null);
  const lastDecodedMonochromeThresholdRef = useRef<number | null>(null);
  const lastDecodedDifferenceThresholdRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0); // Force render
  const [mediaFrameTick, setMediaFrameTick] = useState(0);

  const [camera, setCamera] = useState<CameraState>(() => ({
    x: (GRID_W * PIXEL_SIZE) / 2,
    y: (GRID_H * PIXEL_SIZE) / 2,
    zoom: 0.8
  }));

  const [tool, setTool] = useState<ToolType>('pan');
  const [color, setColor] = useState('#ffffff');
  const [statusMsg, setStatusMsg] = useState("");
  const [gameTexturesEnabled, setGameTexturesEnabled] = useState(storedGameTexturesEnabled);
  const [gameTexturesStatus, setGameTexturesStatus] = useState<FactorioTextureAvailability>('loading');
  const [gameTextures, setGameTextures] = useState<FactorioTextureSet | null>(null);
  const gameTexturesRef = useRef<FactorioTextureSet | null>(null);
  const initiallyRequestedGameTexturesRef = useRef(gameTexturesEnabled);
  const lastGeneratedBlueprintRef = useRef<string | null>(null);
  const lastGeneratedBlueprintLabelRef = useRef('Factorio Art');
  const [hasGeneratedBlueprint, setHasGeneratedBlueprint] = useState(false);

  // History
  const historyRef = useRef<GridPatch[]>([]);
  const committedGridRef = useRef<GridData>(cloneGrid(gridRef.current));
  const [historyIndex, setHistoryIndex] = useState(-1);

  const replaceGameTextures = useCallback((nextTextures: FactorioTextureSet | null) => {
    if (gameTexturesRef.current !== nextTextures) closeFactorioTextures(gameTexturesRef.current);
    gameTexturesRef.current = nextTextures;
    setGameTextures(nextTextures);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const detectTextures = async () => {
      const api = window.factorioLampEditor;
      if (!api?.getFactorioTextureStatus) {
        if (!cancelled) {
          setGameTexturesStatus('unavailable');
          setGameTexturesEnabled(false);
        }
        return;
      }
      try {
        const status = await api.getFactorioTextureStatus();
        if (cancelled) return;
        if (!status.available) {
          setGameTexturesStatus('unavailable');
          setGameTexturesEnabled(false);
          window.localStorage.setItem(GAME_TEXTURES_STORAGE_KEY, 'false');
          return;
        }
        setGameTexturesStatus('available');
        if (!initiallyRequestedGameTexturesRef.current) return;
        const textures = await loadFactorioTextures(status);
        if (cancelled) {
          closeFactorioTextures(textures);
          return;
        }
        if (!textures['small-lamp']) throw new Error('The Factorio small-lamp texture is unavailable.');
        replaceGameTextures(textures);
        setGameTexturesEnabled(true);
      } catch {
        if (!cancelled) {
          setGameTexturesStatus('error');
          setGameTexturesEnabled(false);
          window.localStorage.setItem(GAME_TEXTURES_STORAGE_KEY, 'false');
        }
      }
    };
    void detectTextures();
    return () => {
      cancelled = true;
    };
  }, [replaceGameTextures]);

  useEffect(() => () => {
    closeFactorioTextures(gameTexturesRef.current);
    gameTexturesRef.current = null;
  }, []);

  const handleGameTexturesChange = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      replaceGameTextures(null);
      setGameTexturesEnabled(false);
      window.localStorage.setItem(GAME_TEXTURES_STORAGE_KEY, 'false');
      setStatusMsg(t('Factorio game textures disabled.'));
      return;
    }

    const api = window.factorioLampEditor;
    if (!api?.getFactorioTextureStatus || !api.readFactorioTexture) {
      setGameTexturesStatus('unavailable');
      setStatusMsg(t('Unable to load Factorio game textures.'));
      return;
    }

    setGameTexturesStatus('loading');
    try {
      let status: FactorioTextureStatus = await api.getFactorioTextureStatus();
      if (!status.available) {
        const selected = await api.selectFactorioTextures();
        if (selected.canceled) {
          setGameTexturesEnabled(false);
          setGameTexturesStatus('unavailable');
          return;
        }
        status = {
          available: Boolean(selected.available),
          factorioDirectory: selected.factorioDirectory,
          textureIds: selected.textureIds ?? [],
        };
      }
      if (!status.available) throw new Error('Factorio was not detected.');
      const textures = await loadFactorioTextures(status);
      if (!textures['small-lamp']) {
        closeFactorioTextures(textures);
        throw new Error('The Factorio small-lamp texture is unavailable.');
      }
      replaceGameTextures(textures);
      setGameTexturesEnabled(true);
      setGameTexturesStatus('available');
      window.localStorage.setItem(GAME_TEXTURES_STORAGE_KEY, 'true');
      setStatusMsg(t('Factorio game textures enabled.'));
    } catch {
      replaceGameTextures(null);
      setGameTexturesEnabled(false);
      setGameTexturesStatus('error');
      window.localStorage.setItem(GAME_TEXTURES_STORAGE_KEY, 'false');
      setStatusMsg(t('Unable to load Factorio game textures.'));
    }
  }, [replaceGameTextures, t]);

  const saveHistory = useCallback(() => {
    const patch = createGridPatch(committedGridRef.current, gridRef.current);
    if (!patch) return;
    const newHistory = historyRef.current.slice(0, historyIndex + 1);
    newHistory.push(patch);
    if (newHistory.length > 20) newHistory.shift();
    historyRef.current = newHistory;
    committedGridRef.current = cloneGrid(gridRef.current);
    setHistoryIndex(newHistory.length - 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex >= 0) {
      const newIdx = historyIndex - 1;
      applyGridPatch(gridRef.current, historyRef.current[historyIndex], 'undo');
      committedGridRef.current = cloneGrid(gridRef.current);
      setHistoryIndex(newIdx);
      setTick(t => t + 1);
    }
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < historyRef.current.length - 1) {
      const newIdx = historyIndex + 1;
      applyGridPatch(gridRef.current, historyRef.current[newIdx], 'redo');
      committedGridRef.current = cloneGrid(gridRef.current);
      setHistoryIndex(newIdx);
      setTick(t => t + 1);
    }
  }, [historyIndex]);

  // Stamps
  const [stampMode, setStampMode] = useState<'text' | 'image' | 'audio' | null>(null);
  const [stampBuffer, setStampBuffer] = useState<StampBuffer | null>(null);
  const [placedImage, setPlacedImage] = useState<(ImportedFrame & { baseGrid: GridData }) | null>(null);
  const [sequenceFrames, setSequenceFrames] = useState<SequenceFrame[]>([]);
  const [sequenceVersion, setSequenceVersion] = useState(0);
  const [blueprintImageInfo, setBlueprintImageInfo] = useState<{
    sourceName: string;
    width: number;
    height: number;
  } | null>(null);
  const [stampScale, setStampScale] = useState(1);
  const [lockImageAspectRatio, setLockImageAspectRatio] = useState(true);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [animationEnabled, setAnimationEnabled] = useState(false);
  const [sequenceGlobalDelaySeconds, setSequenceGlobalDelaySeconds] = useState(15);
  const [includeAnimationHelp, setIncludeAnimationHelp] = useState(false);
  const [animationControllerSide, setAnimationControllerSide] = useState<AnimationControllerSide>('top');
  const [mediaFpsLimit, setMediaFpsLimit] = useState(30);
  const [mediaColorMode, setMediaColorMode] = useState<MediaColorMode>('full');
  const [mediaMonochromeThreshold, setMediaMonochromeThreshold] = useState(128);
  const [mediaDifferenceThreshold, setMediaDifferenceThreshold] = useState(0);
  const [mediaTargetSize, setMediaTargetSize] = useState<MediaTargetSize | null>(null);
  const [mediaAnimationInfo, setMediaAnimationInfo] = useState<MediaAnimationInfo | null>(null);
  const [mediaImporting, setMediaImporting] = useState(false);
  const [mediaPreviewFrame, setMediaPreviewFrame] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewSeekVersion, setPreviewSeekVersion] = useState(0);
  const [inspectedLamp, setInspectedLamp] = useState<{ x: number; y: number } | null>(null);
  const [audioNotesPerSecond, setAudioNotesPerSecond] = useState(4);
  const [audioVoicesPerChannel, setAudioVoicesPerChannel] = useState(2);
  const [audioTrackInfo, setAudioTrackInfo] = useState<DecodedAudioTrack | null>(null);
  const [audioPlacement, setAudioPlacement] = useState<{ x: number; y: number } | null>(null);
  const [audioImporting, setAudioImporting] = useState(false);
  const [audioLinkedToAnimation, setAudioLinkedToAnimation] = useState(false);
  const [leftAudioInstrument, setLeftAudioInstrument] = useState<AudioInstrumentSelection>('auto');
  const [rightAudioInstrument, setRightAudioInstrument] = useState<AudioInstrumentSelection>('auto');
  const [maxDefinition, setMaxDefinition] = useState(DEFAULT_MAX_DEFINITION);
  const [maxFrameCount, setMaxFrameCount] = useState(DEFAULT_MAX_FRAME_COUNT);
  const [backgroundTile, setBackgroundTile] = useState<BackgroundTileName>('');
  const [pendingMediaSelection, setPendingMediaSelection] = useState<PendingMediaSelection | null>(null);
  const [manualFrameRemovals, setManualFrameRemovals] = useState<Set<string>>(new Set());
  const [fitView, setFitView] = useState<{
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  } | undefined>();

  const ensureAnimationFrameLimit = useCallback((
    requiredFrames: number,
    structureName: string,
  ): number | null => {
    const normalizedRequired = Math.max(1, Math.round(requiredFrames));
    if (normalizedRequired <= maxFrameCount) return maxFrameCount;
    const accepted = window.confirm([
      t('This structure requires more animation frames than the current limit.'),
      `${t('Structure')} : ${structureName}`,
      `${t('Required frames')} : ${normalizedRequired.toLocaleString()}`,
      `${t('Current frame limit')} : ${maxFrameCount.toLocaleString()}`,
      '',
      `${t('OK')} : ${t('raise the frame limit and continue')}`,
      `${t('Cancel')} : ${t('cancel this structure')}`,
    ].join('\n'));
    if (!accepted) return null;
    setMaxFrameCount(normalizedRequired);
    return normalizedRequired;
  }, [maxFrameCount, t]);

  const resetPreviewPlayback = useCallback((autoplay = true) => {
    mediaPreviewFrameRef.current = 0;
    mediaPreviewTickRef.current = 0;
    setMediaPreviewFrame(0);
    setPreviewPlaying(autoplay);
    setPreviewSeekVersion(value => value + 1);
  }, []);

  const seekPreviewFrame = useCallback((frame: number) => {
    const normalizedFrame = Math.max(0, Math.round(frame));
    mediaPreviewFrameRef.current = normalizedFrame;
    setMediaPreviewFrame(normalizedFrame);
    setPreviewPlaying(false);
    setPreviewSeekVersion(value => value + 1);
  }, []);

  const imageDimensions = placedImage
    ? {
      originalWidth: placedImage.originalW,
      originalHeight: placedImage.originalH,
      currentWidth: placedImage.currentW,
      currentHeight: placedImage.currentH,
    }
    : undefined;

  const sequenceFrameInfos: SequenceFrameInfo[] = sequenceFrames.map(frame => ({
    id: frame.id,
    sourceName: frame.sourceName,
    originalWidth: frame.originalW,
    originalHeight: frame.originalH,
    currentWidth: frame.currentW,
    currentHeight: frame.currentH,
    delaySeconds: frame.delaySeconds,
    thumbnailUrl: frame.thumbnailUrl,
  }));

  const clearMediaAnimation = useCallback((keepFirstFrame = true) => {
    mediaDecodeRequestRef.current++;
    mediaAnimationRef.current = null;
    decodedMediaRef.current = null;
    mediaUnionGridRef.current = createEmptyGrid(GRID_W, GRID_H);
    mediaPreviewGridRef.current = createEmptyGrid(GRID_W, GRID_H);
    mediaSourceFileRef.current = null;
    lastDecodedFpsLimitRef.current = null;
    lastDecodedMaxDefinitionRef.current = null;
    lastDecodedTargetSizeRef.current = null;
    lastDecodedColorModeRef.current = null;
    lastDecodedMonochromeThresholdRef.current = null;
    lastDecodedDifferenceThresholdRef.current = null;
    setMediaTargetSize(null);
    setPendingMediaSelection(null);
    setMediaAnimationInfo(null);
    setMediaImporting(false);
    resetPreviewPlayback(false);
    setMediaFrameTick(value => value + 1);
    if (!keepFirstFrame) {
      gridRef.current = createEmptyGrid(GRID_W, GRID_H);
      committedGridRef.current = cloneGrid(gridRef.current);
      setTick(value => value + 1);
    }
  }, [resetPreviewPlayback]);

  const clearAudioTrack = useCallback(() => {
    audioDecodeRequestRef.current++;
    audioTrackRef.current = null;
    audioSourceFileRef.current = null;
    lastDecodedNotesPerSecondRef.current = null;
    lastDecodedVoicesPerChannelRef.current = null;
    setAudioTrackInfo(null);
    setAudioPlacement(null);
    setAudioImporting(false);
    setAudioLinkedToAnimation(false);
    setStampMode(previous => previous === 'audio' ? null : previous);
    setStampBuffer(previous => stampMode === 'audio' ? null : previous);
  }, [stampMode]);

  const beginAudioPlacement = useCallback((track: DecodedAudioTrack) => {
    setAudioPlacement(null);
    setStampScale(1);
    setStampBuffer({
      w: 1,
      h: 1,
      data: new Uint32Array([colorToUint32('#22d3ee')]),
      sourceName: track.sourceName,
    });
    setStampMode('audio');
  }, []);

  const importAudio = useCallback(async (
    file: File,
    notesPerSecond: number,
    voicesPerChannel: number,
    requirePlacement = false,
  ) => {
    if (!window.factorioLampEditor?.decodeAudioNotes) {
      alert('Audio-to-speaker conversion is available in the installed desktop application.');
      return;
    }
    const requestId = ++audioDecodeRequestRef.current;
    setAudioImporting(true);
    setStatusMsg('Detecting adaptive polyphonic note events with FFmpeg...');
    try {
      const decoded = await window.factorioLampEditor.decodeAudioNotes({
        sourceName: file.name,
        bytes: await file.arrayBuffer(),
        notesPerSecond: Math.max(1, Math.min(60, notesPerSecond)),
        voicesPerChannel: Math.max(1, Math.min(4, Math.round(voicesPerChannel))),
      });
      if (requestId !== audioDecodeRequestRef.current) return;
      audioTrackRef.current = decoded;
      lastDecodedNotesPerSecondRef.current = notesPerSecond;
      lastDecodedVoicesPerChannelRef.current = voicesPerChannel;
      setAudioTrackInfo(decoded);
      if (requirePlacement) {
        beginAudioPlacement(decoded);
        setStatusMsg(`${decoded.events.length.toLocaleString()} polyphonic events extracted. Click the grid to place the audio controller.`);
      } else {
        setStatusMsg(`${decoded.events.length.toLocaleString()} polyphonic note events extracted`);
      }
      setTimeout(() => setStatusMsg(''), 3500);
    } catch (error) {
      if (requestId !== audioDecodeRequestRef.current) return;
      console.error('Unable to decode audio.', error);
      setStatusMsg('');
      alert(`Unable to convert this audio file.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (requestId === audioDecodeRequestRef.current) setAudioImporting(false);
    }
  }, [beginAudioPlacement]);

  const placeDecodedMedia = useCallback((
    decoded: DecodedMediaAnimation,
    fpsLimit: number,
    definitionLimit: number,
  ) => {
    const startX = Math.floor((GRID_W - decoded.width) / 2);
    const startY = Math.floor((GRID_H - decoded.height) / 2);
    const placed = placeDecodedAnimation(decoded, GRID_W, GRID_H, startX, startY);
    decodedMediaRef.current = decoded;
    mediaAnimationRef.current = placed;
    mediaUnionGridRef.current = createAnimationUnionGrid(placed);
    mediaPreviewGridRef.current = placed.firstFrame;
    gridRef.current = placed.firstFrame;
    committedGridRef.current = cloneGrid(gridRef.current);
    historyRef.current = [];
    setHistoryIndex(-1);
    setPlacedImage(null);
    setSequenceFrames(previous => {
      previous.forEach(frame => URL.revokeObjectURL(frame.thumbnailUrl));
      return [];
    });
    setSequenceVersion(value => value + 1);
    setAnimationEnabled(false);
    resetPreviewPlayback(true);
    setPendingMediaSelection(null);
    setBlueprintImageInfo({
      sourceName: decoded.sourceName,
      width: decoded.width,
      height: decoded.height,
    });
    setMediaAnimationInfo({
      sourceName: decoded.sourceName,
      sourceWidth: decoded.sourceWidth,
      sourceHeight: decoded.sourceHeight,
      width: decoded.width,
      height: decoded.height,
      sampledFrameCount: decoded.sampledFrameCount,
      frameCount: decoded.frameCount,
      sampledFps: decoded.sampledFps,
      factorioFps: decoded.factorioFps,
      durationTicks: decoded.durationTicks,
      gifTimingRepaired: decoded.gifTimingRepaired,
      gifEmbeddedFrameCount: decoded.gifEmbeddedFrameCount,
      resizable: true,
    });
    lastDecodedFpsLimitRef.current = fpsLimit;
    lastDecodedMaxDefinitionRef.current = definitionLimit;
    lastDecodedTargetSizeRef.current = `${decoded.width}x${decoded.height}`;
    setMediaTargetSize({ width: decoded.width, height: decoded.height });
    setTick(value => value + 1);
    setMediaFrameTick(value => value + 1);
    setFitView({
      centerX: (startX + decoded.width / 2) * PIXEL_SIZE,
      centerY: (startY + decoded.height / 2) * PIXEL_SIZE,
      width: decoded.width * PIXEL_SIZE,
      height: decoded.height * PIXEL_SIZE,
    });
    setStatusMsg(`${decoded.frameCount.toLocaleString()} frames loaded at ${decoded.factorioFps.toFixed(2)} FPS`);
    setTimeout(() => setStatusMsg(''), 3500);
  }, [resetPreviewPlayback]);

  const importMedia = useCallback(async (
    file: File,
    fpsLimit: number,
    definitionLimit: number,
    frameLimit: number,
    targetSize: MediaTargetSize | null,
    confirmReduction = false,
  ) => {
    const browserImageType = browserImageMimeType(file.name, file.type);
    if (!isTgsFile(file) && !browserImageType && !window.factorioLampEditor?.decodeMedia) {
      alert(t('Animated media import is available in the installed desktop application.'));
      return false;
    }
    const requestId = ++mediaDecodeRequestRef.current;
    setMediaImporting(true);
    setStatusMsg(isTgsFile(file) ? t('Reading TGS animation…') : t('Inspecting animated media…'));
    try {
      const bytes = await file.arrayBuffer();
      const normalizedFpsLimit = Math.max(0.1, Math.min(30, fpsLimit));
      const normalizedDefinition = Math.max(1, Math.min(MAX_DEFINITION_LIMIT, definitionLimit));
      if (confirmReduction) {
        const inspection = isTgsFile(file)
          ? inspectTgs(bytes)
          : browserImageType
            ? await inspectBrowserImage(bytes, browserImageType)
            : await window.factorioLampEditor!.inspectMedia({ sourceName: file.name, bytes });
        const scale = Math.min(1, normalizedDefinition / inspection.sourceWidth, normalizedDefinition / inspection.sourceHeight);
        const targetWidth = Math.max(1, Math.round(inspection.sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(inspection.sourceHeight * scale));
        const targetFps = Math.max(0.1, Math.min(normalizedFpsLimit, inspection.sourceFps));
        const reducesDefinition = targetWidth < inspection.sourceWidth || targetHeight < inspection.sourceHeight;
        const reducesFps = targetFps + 0.001 < inspection.sourceFps;
        if ((reducesDefinition || reducesFps) && !window.confirm([
          t('This media exceeds the selected Factorio import limits.'),
          `${inspection.sourceWidth} × ${inspection.sourceHeight} px @ ${inspection.sourceFps.toFixed(2)} FPS`,
          `→ ${targetWidth} × ${targetHeight} px @ ${targetFps.toFixed(2)} FPS`,
          '',
          t('Convert it with these reduced dimensions and/or FPS?'),
        ].join('\n'))) {
          setStatusMsg(t('Media import cancelled.'));
          setTimeout(() => setStatusMsg(''), 2500);
          return false;
        }
      }

      setStatusMsg(isTgsFile(file)
        ? t('Rendering TGS animation…')
        : browserImageType
          ? t('Decoding APNG/WebP with Chromium…')
          : t('Decoding animated media with FFmpeg…'));
      const decodeOptions = {
        sourceName: file.name,
        fpsLimit: normalizedFpsLimit,
        maxDimension: normalizedDefinition,
        ...(targetSize ? { targetWidth: targetSize.width, targetHeight: targetSize.height } : {}),
        colorMode: mediaColorMode,
        monochromeThreshold: mediaMonochromeThreshold,
        differenceThreshold: mediaDifferenceThreshold,
      };
      const decoded = isTgsFile(file)
        ? await decodeTgsAnimation(bytes, decodeOptions)
        : browserImageType
          ? await decodeBrowserImageAnimation(bytes, { ...decodeOptions, mimeType: browserImageType })
          : await window.factorioLampEditor!.decodeMedia({ ...decodeOptions, bytes }) as DecodedMediaAnimation;
      if (requestId !== mediaDecodeRequestRef.current) return;
      lastDecodedFpsLimitRef.current = fpsLimit;
      lastDecodedMaxDefinitionRef.current = definitionLimit;
      lastDecodedTargetSizeRef.current = `${decoded.width}x${decoded.height}`;
      lastDecodedColorModeRef.current = mediaColorMode;
      lastDecodedMonochromeThresholdRef.current = mediaMonochromeThreshold;
      lastDecodedDifferenceThresholdRef.current = mediaDifferenceThreshold;
      if (decoded.frameCount > frameLimit) {
        decodedMediaRef.current = decoded;
        setPendingMediaSelection({
          decoded,
          sourceFile: file,
          thumbnailUrls: decoded.frameThumbnails.map(mediaThumbnailToDataUrl),
          removals: new Set(),
        });
        setStatusMsg(`${decoded.frameCount.toLocaleString()} frames found; choose ${frameLimit.toLocaleString()} or fewer.`);
        return true;
      }
      placeDecodedMedia(decoded, fpsLimit, definitionLimit);
      return true;
    } catch (error) {
      if (requestId !== mediaDecodeRequestRef.current) return;
      console.error('Unable to decode animated media.', error);
      setStatusMsg('');
      alert(`${t('Unable to decode this animated media.')}\n${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      if (requestId === mediaDecodeRequestRef.current) setMediaImporting(false);
    }
  }, [mediaColorMode, mediaDifferenceThreshold, mediaMonochromeThreshold, placeDecodedMedia, t]);

  const handleTextStamp = async (options: TextStampOptions) => {
    const emojiProvider = options.emojiArtworkStyle && options.emojiArtworkStyle !== 'font'
      ? options.emojiArtworkStyle
      : null;
    setStatusMsg(emojiProvider
      ? 'Preparing text stamp and loading cached emoji artwork…'
      : 'Preparing text stamp…');
    try {
      const buffer = await createTextStamp(emojiProvider
        ? { ...options, emojiImageLoader: emoji => loadEmojiImage(emojiProvider, emoji) }
        : options);
      if (buffer) {
        const requiredFrames = buffer.animation?.transitions.length
          ? buffer.animation.transitions.length + 1
          : 1;
        if (ensureAnimationFrameLimit(requiredFrames, t('Animated text stamp')) === null) {
          setStampBuffer(null);
          setStampMode(null);
          setStatusMsg(t('Structure cancelled.'));
          setTimeout(() => setStatusMsg(''), 2500);
          return;
        }
        setStampBuffer(buffer);
        setStampMode('text');
        setStampScale(1);
      }
    } catch (error) {
      console.error('Unable to create text stamp.', error);
      alert(`Unable to create this text stamp.\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStatusMsg('');
    }
  };

  const handleNotoAnimatedEmojiStamp = useCallback(async (
    entry: NotoAnimatedEmojiEntry,
    requestedSize: number,
    activateGridStamp: boolean,
  ): Promise<StampBuffer | null> => {
    if (!window.factorioLampEditor?.decodeMedia) {
      alert('Official animated-emoji stamps are available in the installed desktop application.');
      return null;
    }
    const size = Math.max(4, Math.min(128, Math.round(requestedSize)));
    setStatusMsg(`Loading ${entry.name} animation…`);
    try {
      const asset = await loadEmojiAsset('noto-animated', entry.codepoint);
      setStatusMsg(asset.source === 'cache'
        ? `Decoding cached ${entry.name} animation…`
        : `Downloaded and cached ${entry.name}; decoding animation…`);
      const decoded = await window.factorioLampEditor.decodeMedia({
        sourceName: `noto-animated-${entry.codepoint}.gif`,
        bytes: asset.bytes,
        fpsLimit: Math.max(0.1, Math.min(30, mediaFpsLimit)),
        maxDimension: size,
        targetWidth: size,
        targetHeight: size,
        colorMode: 'full',
        monochromeThreshold: 128,
        differenceThreshold: 0,
      });
      if (ensureAnimationFrameLimit(decoded.frameCount, `${t('Animated emoji')} : ${entry.name}`) === null) {
        if (activateGridStamp) {
          setStampBuffer(null);
          setStampMode(null);
        }
        setStatusMsg(t('Structure cancelled.'));
        setTimeout(() => setStatusMsg(''), 2500);
        return null;
      }
      const stamp: StampBuffer = {
        w: decoded.width,
        h: decoded.height,
        data: decoded.firstFrame,
        sourceName: `Noto Animated Emoji · ${entry.name}`,
        animation: decoded.frameCount > 1 ? {
          firstDurationTicks: decoded.firstDurationTicks,
          sourceFrameCount: decoded.frameCount,
          transitions: decoded.transitions,
        } : undefined,
      };
      if (activateGridStamp) {
        setStampBuffer(stamp);
        setStampMode('text');
        setStampScale(1);
      }
      setStatusMsg(activateGridStamp
        ? `${entry.name}: ${decoded.frameCount.toLocaleString()} real frames ready — click the grid to place it.`
        : `${entry.name}: ${decoded.frameCount.toLocaleString()} real frames inserted into the text field.`);
      setTimeout(() => setStatusMsg(''), 5000);
      return stamp;
    } catch (error) {
      console.error('Unable to create the official animated emoji stamp.', error);
      setStatusMsg('');
      alert(`Unable to load this animated emoji.\n${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }, [ensureAnimationFrameLimit, mediaFpsLimit, t]);

  const startPlacedImage = useCallback((
    image: HTMLImageElement,
    originalW: number,
    originalH: number,
    baseW = originalW,
    baseH = originalH,
    sourceName = 'Imported Image',
  ) => {
    clearMediaAnimation(true);
    setStampBuffer(null);
    setStampMode(null);
    setStampScale(1);
    setPlacedImage({
      image,
      originalW,
      originalH,
      sourceName,
      baseW,
      baseH,
      currentW: baseW,
      currentH: baseH,
      centerX: Math.floor(GRID_W / 2),
      centerY: Math.floor(GRID_H / 2),
      baseGrid: cloneGrid(gridRef.current),
    });
  }, [clearMediaAnimation]);

  const importImage = useCallback(async (file: Blob) => {
    try {
      const image = await loadImage(file);
      const originalW = image.naturalWidth;
      const originalH = image.naturalHeight;
      const sourceName = file instanceof File && file.name ? file.name : 'Imported Image';

      if (originalW > maxDefinition || originalH > maxDefinition) {
        setPendingImage({ image, originalW, originalH, sourceName });
        return;
      }

      startPlacedImage(image, originalW, originalH, originalW, originalH, sourceName);
    } catch (error) {
      console.error('Unable to import image.', error);
    }
  }, [maxDefinition, startPlacedImage]);

  const primaryContentCenter = useCallback(() => {
    if (placedImage) return { x: placedImage.centerX, y: placedImage.centerY };
    let minX = GRID_W;
    let minY = GRID_H;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < gridRef.current.cells.length; index++) {
      if (!gridRef.current.cells[index]) continue;
      const x = index % GRID_W;
      const y = Math.floor(index / GRID_W);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return maxX === -1
      ? { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) }
      : { x: Math.floor((minX + maxX + 1) / 2), y: Math.floor((minY + maxY + 1) / 2) };
  }, [placedImage]);

  useEffect(() => {
    const source = mediaSourceFileRef.current;
    if (!source || lastDecodedFpsLimitRef.current === null || lastDecodedMaxDefinitionRef.current === null) return;
    if (
      Math.abs(lastDecodedFpsLimitRef.current - mediaFpsLimit) < 0.0001
      && lastDecodedMaxDefinitionRef.current === maxDefinition
      && lastDecodedTargetSizeRef.current === (mediaTargetSize ? `${mediaTargetSize.width}x${mediaTargetSize.height}` : lastDecodedTargetSizeRef.current)
      && lastDecodedColorModeRef.current === mediaColorMode
      && lastDecodedMonochromeThresholdRef.current === mediaMonochromeThreshold
      && lastDecodedDifferenceThresholdRef.current === mediaDifferenceThreshold
    ) return;
    const timer = setTimeout(() => {
      void importMedia(source, mediaFpsLimit, maxDefinition, maxFrameCount, mediaTargetSize);
    }, 450);
    return () => clearTimeout(timer);
  }, [importMedia, maxDefinition, maxFrameCount, mediaColorMode, mediaDifferenceThreshold, mediaFpsLimit, mediaMonochromeThreshold, mediaTargetSize]);

  useEffect(() => {
    const source = audioSourceFileRef.current;
    if (
      !source
      || lastDecodedNotesPerSecondRef.current === null
      || lastDecodedVoicesPerChannelRef.current === null
    ) return;
    if (
      Math.abs(lastDecodedNotesPerSecondRef.current - audioNotesPerSecond) < 0.0001
      && lastDecodedVoicesPerChannelRef.current === audioVoicesPerChannel
    ) return;
    const timer = setTimeout(() => {
      void importAudio(source, audioNotesPerSecond, audioVoicesPerChannel);
    }, 450);
    return () => clearTimeout(timer);
  }, [audioNotesPerSecond, audioVoicesPerChannel, importAudio]);

  useEffect(() => {
    const decoded = decodedMediaRef.current;
    const sourceFile = mediaSourceFileRef.current;
    if (
      pendingMediaSelection
      || !mediaAnimationInfo
      || !decoded
      || !sourceFile
      || decoded.frameCount <= maxFrameCount
    ) return;
    setPendingMediaSelection({
      decoded,
      sourceFile,
      thumbnailUrls: decoded.frameThumbnails.map(mediaThumbnailToDataUrl),
      removals: new Set(),
    });
  }, [maxFrameCount, mediaAnimationInfo, pendingMediaSelection]);

  const convertSequenceImage = useCallback(async (
    image: HTMLImageElement,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
  ) => {
    let buffer: StampBuffer;
    try {
      buffer = await generateImageBufferInWorker(image, width, height);
    } catch (error) {
      console.warn('Worker conversion failed for a slideshow frame; using local fallback.', error);
      buffer = generateImageBuffer(image, width, height);
    }
    const grid = createEmptyGrid(GRID_W, GRID_H);
    const startX = centerX - Math.floor(width / 2);
    const startY = centerY - Math.floor(height / 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const packedColor = buffer.data[y * width + x];
        const gridX = startX + x;
        const gridY = startY + y;
        if (packedColor && gridX >= 0 && gridX < GRID_W && gridY >= 0 && gridY < GRID_H) {
          grid.cells[gridY * GRID_W + gridX] = packedColor;
        }
      }
    }
    return grid;
  }, []);

  const importSequenceFiles = useCallback(async (files: readonly File[]) => {
    if (!files.length) return;
    clearMediaAnimation(true);
    setStatusMsg(`Converting ${files.length.toLocaleString()} slideshow frame(s)...`);
    const center = primaryContentCenter();
    try {
      const imported = await Promise.all(files.map(async (file, fileIndex): Promise<SequenceFrame> => {
        const image = await loadImage(file);
        const originalW = image.naturalWidth;
        const originalH = image.naturalHeight;
        const scale = Math.min(1, maxDefinition / originalW, maxDefinition / originalH);
        const currentW = Math.max(1, Math.floor(originalW * scale));
        const currentH = Math.max(1, Math.floor(originalH * scale));
        const grid = await convertSequenceImage(image, currentW, currentH, center.x, center.y);
        return {
          id: `${Date.now()}-${fileIndex}-${Math.random().toString(36).slice(2)}`,
          image,
          originalW,
          originalH,
          sourceName: file.name || `Frame ${sequenceFrames.length + fileIndex + 2}`,
          baseW: currentW,
          baseH: currentH,
          currentW,
          currentH,
          centerX: center.x,
          centerY: center.y,
          grid,
          delaySeconds: sequenceGlobalDelaySeconds,
          thumbnailUrl: URL.createObjectURL(file),
        };
      }));
      const mergedFrames = [...sequenceFrames, ...imported];
      setSequenceFrames(mergedFrames);
      if (!sequenceFrames.length && imported[0]) {
        gridRef.current = cloneGrid(imported[0].grid);
        committedGridRef.current = cloneGrid(gridRef.current);
        historyRef.current = [];
        setHistoryIndex(-1);
        setPlacedImage(null);
        setBlueprintImageInfo({
          sourceName: imported[0].sourceName,
          width: imported[0].currentW,
          height: imported[0].currentH,
        });
        setTick(value => value + 1);
      }
      setSequenceVersion(value => value + 1);
      setAnimationEnabled(true);
      resetPreviewPlayback(true);
      setStatusMsg(`${mergedFrames.length.toLocaleString()} slideshow frames loaded.`);
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (error) {
      console.error('Unable to import slideshow frames.', error);
      setStatusMsg('');
      alert(`Unable to import one of the slideshow images.\n${error instanceof Error ? error.message : String(error)}`);
    }
  }, [clearMediaAnimation, convertSequenceImage, maxDefinition, primaryContentCenter, resetPreviewPlayback, sequenceFrames, sequenceGlobalDelaySeconds]);

  useEffect(() => {
    if (!placedImage) return;
    setBlueprintImageInfo({
      sourceName: placedImage.sourceName,
      width: placedImage.currentW,
      height: placedImage.currentH,
    });
  }, [placedImage]);

  const handleImageDimensionChange = useCallback((axis: 'width' | 'height', value: number) => {
    if (!Number.isFinite(value)) return;

    setPlacedImage((previous) => {
      if (!previous) return previous;

      const nextValue = Math.max(1, Math.min(maxDefinition, Math.round(value)));
      if (!lockImageAspectRatio) {
        return axis === 'width'
          ? { ...previous, currentW: nextValue }
          : { ...previous, currentH: nextValue };
      }

      const ratio = previous.baseW / previous.baseH;
      if (axis === 'width') {
        let currentW = nextValue;
        let currentH = Math.max(1, Math.round(currentW / ratio));
        if (currentH > maxDefinition) {
          currentH = maxDefinition;
          currentW = Math.max(1, Math.round(currentH * ratio));
        }
        return { ...previous, currentW, currentH };
      }

      let currentH = nextValue;
      let currentW = Math.max(1, Math.round(currentH * ratio));
      if (currentW > maxDefinition) {
        currentW = maxDefinition;
        currentH = Math.max(1, Math.round(currentW / ratio));
      }
      return { ...previous, currentW, currentH };
    });
  }, [lockImageAspectRatio, maxDefinition]);

  const handleSequenceFrameDimensionChange = useCallback(async (
    id: string,
    axis: 'width' | 'height',
    value: number,
  ) => {
    const frame = sequenceFrames.find(candidate => candidate.id === id);
    if (!frame || !Number.isFinite(value)) return;
    const ratio = frame.baseW / frame.baseH;
    const nextValue = Math.max(1, Math.min(maxDefinition, Math.round(value)));
    let currentW = axis === 'width' ? nextValue : Math.max(1, Math.round(nextValue * ratio));
    let currentH = axis === 'height' ? nextValue : Math.max(1, Math.round(nextValue / ratio));
    if (currentW > maxDefinition) {
      currentW = maxDefinition;
      currentH = Math.max(1, Math.round(currentW / ratio));
    }
    if (currentH > maxDefinition) {
      currentH = maxDefinition;
      currentW = Math.max(1, Math.round(currentH * ratio));
    }
    setStatusMsg(`Converting ${frame.sourceName}...`);
    const grid = await convertSequenceImage(frame.image, currentW, currentH, frame.centerX, frame.centerY);
    setSequenceFrames(previous => previous.map(candidate => (
      candidate.id === id ? { ...candidate, currentW, currentH, grid } : candidate
    )));
    if (sequenceFrames[0]?.id === id) {
      gridRef.current = cloneGrid(grid);
      committedGridRef.current = cloneGrid(gridRef.current);
      setBlueprintImageInfo({ sourceName: frame.sourceName, width: currentW, height: currentH });
      setTick(value => value + 1);
    }
    setSequenceVersion(version => version + 1);
    setStatusMsg('');
  }, [convertSequenceImage, maxDefinition, sequenceFrames]);

  const handleSequenceFrameDelayChange = useCallback((id: string, seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    setSequenceFrames(previous => previous.map(frame => (
      frame.id === id
        ? { ...frame, delaySeconds: Math.max(0.1, Math.min(86400, seconds)) }
        : frame
    )));
  }, []);

  const handleSequenceGlobalDelayChange = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const normalized = Math.max(0.1, Math.min(86400, seconds));
    setSequenceGlobalDelaySeconds(normalized);
    setSequenceFrames(previous => previous.map(frame => ({ ...frame, delaySeconds: normalized })));
    setSequenceVersion(version => version + 1);
  }, []);

  const removeSequenceFrame = useCallback((id: string) => {
    setSequenceFrames(previous => {
      const removed = previous.find(frame => frame.id === id);
      if (removed) URL.revokeObjectURL(removed.thumbnailUrl);
      const next = previous.filter(frame => frame.id !== id);
      gridRef.current = next[0] ? cloneGrid(next[0].grid) : createEmptyGrid(GRID_W, GRID_H);
      committedGridRef.current = cloneGrid(gridRef.current);
      setBlueprintImageInfo(next[0] ? {
        sourceName: next[0].sourceName,
        width: next[0].currentW,
        height: next[0].currentH,
      } : null);
      setTick(value => value + 1);
      return next;
    });
    setSequenceVersion(version => version + 1);
    resetPreviewPlayback(true);
  }, [resetPreviewPlayback]);

  useEffect(() => {
    setPlacedImage(previous => {
      if (!previous || (previous.currentW <= maxDefinition && previous.currentH <= maxDefinition)) return previous;
      const scale = Math.min(maxDefinition / previous.currentW, maxDefinition / previous.currentH);
      return {
        ...previous,
        currentW: Math.max(1, Math.floor(previous.currentW * scale)),
        currentH: Math.max(1, Math.floor(previous.currentH * scale)),
      };
    });
  }, [maxDefinition]);

  useEffect(() => {
    if (!sequenceFrames.some(frame => frame.currentW > maxDefinition || frame.currentH > maxDefinition)) return;
    let cancelled = false;
    void Promise.all(sequenceFrames.map(async (frame) => {
      if (frame.currentW <= maxDefinition && frame.currentH <= maxDefinition) return frame;
      const scale = Math.min(maxDefinition / frame.currentW, maxDefinition / frame.currentH);
      const currentW = Math.max(1, Math.floor(frame.currentW * scale));
      const currentH = Math.max(1, Math.floor(frame.currentH * scale));
      const grid = await convertSequenceImage(frame.image, currentW, currentH, frame.centerX, frame.centerY);
      return { ...frame, currentW, currentH, grid };
    })).then((frames) => {
      if (cancelled) return;
      setSequenceFrames(frames);
      setSequenceVersion(version => version + 1);
    });
    return () => { cancelled = true; };
  }, [convertSequenceImage, maxDefinition, sequenceFrames]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await importImage(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleSequenceImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length) setAudioLinkedToAnimation(false);
    await importSequenceFiles(files);
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAudioLinkedToAnimation(false);
    mediaSourceFileRef.current = file;
    setMediaTargetSize(null);
    await importMedia(file, mediaFpsLimit, maxDefinition, maxFrameCount, null, true);
  };

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAudioLinkedToAnimation(false);
    audioSourceFileRef.current = file;
    await importAudio(file, audioNotesPerSecond, audioVoicesPerChannel, true);
  };

  const handleMediaDimensionChange = useCallback((axis: 'width' | 'height', value: number) => {
    if (!mediaAnimationInfo || !Number.isFinite(value)) return;
    const ratio = mediaAnimationInfo.sourceWidth / mediaAnimationInfo.sourceHeight;
    const normalized = Math.max(1, Math.min(maxDefinition, Math.round(value)));
    let width = axis === 'width' ? normalized : Math.max(1, Math.round(normalized * ratio));
    let height = axis === 'height' ? normalized : Math.max(1, Math.round(normalized / ratio));
    if (width > maxDefinition) {
      width = maxDefinition;
      height = Math.max(1, Math.round(width / ratio));
    }
    if (height > maxDefinition) {
      height = maxDefinition;
      width = Math.max(1, Math.round(height * ratio));
    }
    setMediaTargetSize({ width, height });
  }, [maxDefinition, mediaAnimationInfo]);

  // Rebuild the editable imported image whenever its dimensions change.
  useEffect(() => {
    if (!placedImage) return;
    const controller = new AbortController();
    const width = placedImage.currentW;
    const height = placedImage.currentH;
    setStatusMsg('Converting image...');

    const convert = async () => {
      let buffer: StampBuffer;
      try {
        buffer = await generateImageBufferInWorker(
          placedImage.image,
          width,
          height,
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Worker image conversion failed; using local fallback.', error);
        buffer = generateImageBuffer(placedImage.image, width, height);
      }
      if (controller.signal.aborted) return;

      const nextGrid = cloneGrid(placedImage.baseGrid);
      const startX = placedImage.centerX - Math.floor(width / 2);
      const startY = placedImage.centerY - Math.floor(height / 2);
      let changed = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const color = buffer.data[y * width + x];
          const gridX = startX + x;
          const gridY = startY + y;
          if (color && gridX >= 0 && gridX < GRID_W && gridY >= 0 && gridY < GRID_H) {
            nextGrid.cells[gridY * GRID_W + gridX] = color;
            changed = true;
          }
        }
      }

      gridRef.current = nextGrid;
      if (changed) {
        saveHistory();
        setTick(t => t + 1);
      }
      setFitView({
        centerX: placedImage.centerX * PIXEL_SIZE,
        centerY: placedImage.centerY * PIXEL_SIZE,
        width: width * PIXEL_SIZE,
        height: height * PIXEL_SIZE,
      });
      setStatusMsg('');
    };
    void convert();
    return () => controller.abort();
  }, [placedImage, saveHistory]);

  // Paste support
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            if (blob instanceof File && await isMediaImportFile(blob)) {
              setAudioLinkedToAnimation(false);
              mediaSourceFileRef.current = blob;
              setMediaTargetSize(null);
              await importMedia(blob, mediaFpsLimit, maxDefinition, maxFrameCount, null, true);
            } else {
              await importImage(blob);
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importImage, importMedia, maxDefinition, maxFrameCount, mediaFpsLimit]);

  // Power & Blueprint
  const [autoPole, setAutoPole] = useState(true);
  const [autoRoboport, setAutoRoboport] = useState(false);
  const [autoConstruction, setAutoConstruction] = useState(false);
  const [smartPlacement, setSmartPlacement] = useState(false);
  const [poleType, setPoleType] = useState(storedPoleType);
  const [qualityIdx, setQualityIdx] = useState(storedPoleQuality);

  useEffect(() => {
    window.localStorage.setItem(POLE_TYPE_STORAGE_KEY, poleType);
  }, [poleType]);

  useEffect(() => {
    window.localStorage.setItem(POLE_QUALITY_STORAGE_KEY, String(qualityIdx));
  }, [qualityIdx]);

  useEffect(() => {
    if (!autoPole || !autoRoboport) setAutoConstruction(false);
  }, [autoPole, autoRoboport]);

  const calculationWorkerRef = useRef<Worker | null>(null);
  const workerRequestIdRef = useRef(0);
  const workerCallbacksRef = useRef(new Map<number, {
    resolve: (response: CalculationWorkerResponse) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: number) => void;
  }>());

  useEffect(() => {
    const worker = new Worker(new URL('./workers/calculation.worker.ts', import.meta.url), { type: 'module' });
    const callbacks = workerCallbacksRef.current;
    calculationWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<CalculationWorkerResponse>) => {
      const response = event.data;
      const callback = workerCallbacksRef.current.get(response.id);
      if (!callback) return;
      if (typeof response.progress === 'number') {
        callback.onProgress?.(response.progress);
        return;
      }
      workerCallbacksRef.current.delete(response.id);
      if (response.error) callback.reject(new Error(response.error));
      else callback.resolve(response);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Calculation worker failed.');
      workerCallbacksRef.current.forEach(callback => callback.reject(error));
      workerCallbacksRef.current.clear();
    };
    return () => {
      worker.terminate();
      calculationWorkerRef.current = null;
      callbacks.forEach(callback => callback.reject(new Error('Calculation worker stopped.')));
      callbacks.clear();
    };
  }, []);

  const manualAnimation = useMemo<GridAnimationData | null>(() => {
    void sequenceVersion;
    if (!animationEnabled || sequenceFrames.length < 2) return null;
    return createGridAnimationFromFrames(
      sequenceFrames.map(frame => frame.grid),
      sequenceFrames.map(frame => Math.max(2, Math.round(frame.delaySeconds * 60))),
    );
  }, [animationEnabled, sequenceFrames, sequenceVersion]);

  const activePreviewAnimation = mediaAnimationInfo ? mediaAnimationRef.current : manualAnimation;
  const activePreviewFrameCount = activePreviewAnimation
    ? animationMaximumFrameCount(activePreviewAnimation)
    : 0;

  useEffect(() => {
    const animation = activePreviewAnimation;
    if (!animation) return;

    const tracks = getGridAnimationTracks(animation);
    const timeline = tracks.length > 1
      ? createAnimationPreviewTimeline(animation)
      : createAnimationTimeline(animation);

    if (tracks.length > 1) {
      const trackTimelines = tracks.map(createAnimationTrackTimeline);
      let renderedSignature = '';
      const renderTick = (requestedTick: number, force = false) => {
        mediaPreviewTickRef.current = requestedTick;
        const signature = trackTimelines
          .map(trackTimeline => animationFrameAtTick(trackTimeline, requestedTick))
          .join(',');
        if (!force && signature === renderedSignature) return;
        renderedSignature = signature;
        const previewGrid = renderGridAnimationAtTick(animation, requestedTick);
        const displayedFrame = animationFrameAtTick(timeline, requestedTick);
        mediaPreviewGridRef.current = previewGrid;
        mediaPreviewFrameRef.current = displayedFrame;
        setMediaPreviewFrame(previous => previous === displayedFrame ? previous : displayedFrame);
        setMediaFrameTick(value => value + 1);
      };

      const initialFrame = Math.min(mediaPreviewFrameRef.current, timeline.frameStartTicks.length - 1);
      const startingTick = timeline.frameStartTicks[initialFrame];
      renderTick(startingTick, true);
      if (!previewPlaying) return;

      let animationFrameRequest = 0;
      const startedAt = performance.now();
      const advance = (now: number) => {
        const elapsedTicks = Math.floor((now - startedAt) * 60 / 1000);
        renderTick(startingTick + elapsedTicks);
        animationFrameRequest = requestAnimationFrame(advance);
      };
      animationFrameRequest = requestAnimationFrame(advance);
      return () => cancelAnimationFrame(animationFrameRequest);
    }

    const cells = animation.firstFrame.cells.slice();
    const previewGrid: GridData = {
      width: animation.firstFrame.width,
      height: animation.firstFrame.height,
      cells,
    };
    let renderedFrame = 0;

    const renderFrame = (requestedFrame: number) => {
      const targetFrame = Math.max(0, Math.min(timeline.frameStartTicks.length - 1, requestedFrame));
      mediaPreviewTickRef.current = timeline.frameStartTicks[targetFrame];
      if (targetFrame < renderedFrame) {
        cells.set(animation.firstFrame.cells);
        renderedFrame = 0;
      }
      for (let frame = renderedFrame; frame < targetFrame; frame++) {
        const transition = animation.transitions[frame];
        for (let index = 0; index < transition.indices.length; index++) {
          cells[transition.indices[index]] = transition.colors[index];
        }
      }
      renderedFrame = targetFrame;
      mediaPreviewGridRef.current = previewGrid;
      mediaPreviewFrameRef.current = targetFrame;
      setMediaPreviewFrame(previous => previous === targetFrame ? previous : targetFrame);
      setMediaFrameTick(value => value + 1);
    };

    const initialFrame = Math.min(mediaPreviewFrameRef.current, timeline.frameStartTicks.length - 1);
    renderFrame(initialFrame);
    if (!previewPlaying) return;

    let animationFrameRequest = 0;
    const startedAt = performance.now();
    const startingTick = timeline.frameStartTicks[initialFrame];
    const advance = (now: number) => {
      const elapsedTicks = Math.floor((now - startedAt) * 60 / 1000);
      const targetFrame = animationFrameAtTick(timeline, startingTick + elapsedTicks);
      if (targetFrame !== renderedFrame) renderFrame(targetFrame);
      animationFrameRequest = requestAnimationFrame(advance);
    };
    animationFrameRequest = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animationFrameRequest);
  }, [activePreviewAnimation, previewPlaying, previewSeekVersion]);

  const manualUnionGrid = useMemo(() => (
    manualAnimation ? createAnimationUnionGrid(manualAnimation) : gridRef.current
  ), [manualAnimation]);
  const hasActiveAnimation = Boolean(activePreviewAnimation);
  const audioIncludedInCurrentComposition = Boolean(audioTrackInfo && audioPlacement)
    && (!hasActiveAnimation || audioLinkedToAnimation);

  const runCalculation = useCallback((
    request: Record<string, unknown>,
    onProgress?: (progress: number) => void,
  ) => {
    const worker = calculationWorkerRef.current;
    if (!worker) return Promise.reject(new Error('Calculation worker is not ready.'));
    const id = ++workerRequestIdRef.current;
    const cells = gridRef.current.cells.slice();
    const activeAnimation = mediaAnimationRef.current ?? manualAnimation;
    const includeAudio = Boolean(audioTrackRef.current && audioPlacement)
      && (!activeAnimation || audioLinkedToAnimation);
    const mediaTracks = activeAnimation?.tracks?.length
      ? getGridAnimationTracks(activeAnimation).map(track => ({
        firstDurationTicks: track.firstDurationTicks,
        transitions: track.transitions.map(transition => ({
          indices: transition.indices.slice(),
          colors: transition.colors.slice(),
          durationTicks: transition.durationTicks,
        })),
      }))
      : activeAnimation
        ? [{
          firstDurationTicks: activeAnimation.firstDurationTicks,
          transitions: activeAnimation.transitions.map(transition => ({
            indices: transition.indices.slice(),
            colors: transition.colors.slice(),
            durationTicks: transition.durationTicks,
          })),
        }]
        : undefined;
    return new Promise<CalculationWorkerResponse>((resolve, reject) => {
      workerCallbacksRef.current.set(id, { resolve, reject, onProgress });
      const transferables: ArrayBuffer[] = [cells.buffer];
      mediaTracks?.forEach(track => track.transitions.forEach((transition) => {
        transferables.push(transition.indices.buffer, transition.colors.buffer);
      }));
      worker.postMessage({
        ...request,
        id,
        cells: cells.buffer,
        audioTrack: includeAudio ? audioTrackRef.current ?? undefined : undefined,
        audioInstruments: includeAudio
          ? { left: leftAudioInstrument, right: rightAudioInstrument }
          : undefined,
        audioPlacement: includeAudio ? audioPlacement : undefined,
        mediaAnimation: activeAnimation && mediaTracks
          ? {
            tracks: mediaTracks.map(track => ({
              firstDurationTicks: track.firstDurationTicks,
              transitions: track.transitions.map(transition => ({
                indices: transition.indices.buffer,
                colors: transition.colors.buffer,
                durationTicks: transition.durationTicks,
              })),
            })),
          }
          : undefined,
        width: GRID_W,
        height: GRID_H,
      }, transferables);
    });
  }, [audioLinkedToAnimation, audioPlacement, leftAudioInstrument, manualAnimation, rightAudioInstrument]);

  // Stats
  const [lampCount, setLampCount] = useState(0);

  useEffect(() => {
    // Recount lamps whenever the grid might have changed (tick/history)
    if (mediaAnimationInfo) {
      setLampCount(countLamps(mediaUnionGridRef.current));
      return;
    }
    if (!manualAnimation) {
      setLampCount(countLamps(gridRef.current));
      return;
    }
    setLampCount(countLamps(manualUnionGrid));
  }, [tick, historyIndex, manualAnimation, manualUnionGrid, mediaAnimationInfo, sequenceVersion]);

  // Async Pole Calculation
  // We store the poles AND the type they were calculated for, to avoid rendering mismatch during debounced updates.
  const [activePolesState, setActivePolesState] = useState<{ poles: ActivePole[], type: string, qualityIdx: number }>({
    poles: [],
    type: "medium-electric-pole",
    qualityIdx: 0
  });

  const [activeRoboports, setActiveRoboports] = useState<ActiveRoboport[]>([]);
  const [animationPreviewEntities, setAnimationPreviewEntities] = useState<BlueprintPreviewEntity[]>([]);
  const [animationStats, setAnimationStats] = useState<AnimationEntityStats>(EMPTY_ANIMATION_STATS);
  const shouldFitAnimationPreviewRef = useRef(false);

  useEffect(() => {
    shouldFitAnimationPreviewRef.current = hasActiveAnimation || audioIncludedInCurrentComposition;
  }, [animationControllerSide, audioIncludedInCurrentComposition, hasActiveAnimation, leftAudioInstrument, rightAudioInstrument]);

  useEffect(() => {
    if (!autoPole && !hasActiveAnimation && !audioIncludedInCurrentComposition) {
      setActivePolesState(previous => ({ ...previous, poles: [] }));
      setActiveRoboports([]);
      setAnimationPreviewEntities([]);
      setAnimationStats(EMPTY_ANIMATION_STATS);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await runCalculation({
          kind: 'layout',
          poleType,
          qualityIdx,
          autoPole,
          smartPlacement,
          autoRoboport,
          autoConstruction,
          includeAnimationHelp,
          animationControllerSide,
        });
        if (cancelled) return;
        setActivePolesState({ poles: response.poles ?? [], type: poleType, qualityIdx });
        setActiveRoboports(response.roboports ?? []);
        setAnimationPreviewEntities(response.previewEntities ?? []);
        setAnimationStats(response.animationStats ?? EMPTY_ANIMATION_STATS);
        if (response.previewBounds && shouldFitAnimationPreviewRef.current) {
          const bounds = response.previewBounds;
          setFitView({
            centerX: ((bounds.minX + bounds.maxX) / 2) * PIXEL_SIZE,
            centerY: ((bounds.minY + bounds.maxY) / 2) * PIXEL_SIZE,
            width: Math.max(PIXEL_SIZE, (bounds.maxX - bounds.minX) * PIXEL_SIZE),
            height: Math.max(PIXEL_SIZE, (bounds.maxY - bounds.minY) * PIXEL_SIZE),
          });
          shouldFitAnimationPreviewRef.current = false;
        }
      } catch (error) {
        if (!cancelled) console.error('Unable to calculate support layout.', error);
      }
    }, autoPole && smartPlacement ? 500 : 75);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoPole, autoRoboport, autoConstruction, smartPlacement, poleType, qualityIdx, tick, historyIndex, manualAnimation, mediaAnimationInfo, audioTrackInfo, audioIncludedInCurrentComposition, hasActiveAnimation, includeAnimationHelp, animationControllerSide, leftAudioInstrument, rightAudioInstrument, runCalculation, sequenceVersion]);

  const activeRoboportReplacedPoleIndices = useMemo(() => (
    new Set(activeRoboports.flatMap(roboport => roboport.replacedPoleIndices))
  ), [activeRoboports]);

  const effectiveActivePoles = useMemo(() => (
    activePolesState.poles.filter((_, index) => !activeRoboportReplacedPoleIndices.has(index))
  ), [activePolesState.poles, activeRoboportReplacedPoleIndices]);

  const generatedLampCount = useMemo(() => {
    if (!autoPole) return lampCount;

    const occupiedLampCells = new Set<number>();
    const markIfLamp = (x: number, y: number) => {
      const index = y * GRID_W + x;
      const hasLamp = mediaAnimationInfo
        ? mediaUnionGridRef.current.cells[index]
        : manualAnimation
          ? manualUnionGrid.cells[index]
          : gridRef.current.cells[index];
      if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H && hasLamp) {
        occupiedLampCells.add(y * GRID_W + x);
      }
    };

    const poleSize = POLE_DATA[activePolesState.type].size;
    effectiveActivePoles.forEach((pole) => {
      for (let y = pole.y; y < pole.y + poleSize; y++) {
        for (let x = pole.x; x < pole.x + poleSize; x++) markIfLamp(x, y);
      }
    });

    if (autoRoboport) {
      activeRoboports.forEach((roboport) => {
        for (let y = roboport.y; y < roboport.y + ROBOPORT_SIZE; y++) {
          for (let x = roboport.x; x < roboport.x + ROBOPORT_SIZE; x++) markIfLamp(x, y);
        }
      });
    }

    return Math.max(0, lampCount - occupiedLampCells.size);
  }, [lampCount, autoPole, autoRoboport, activePolesState.type, effectiveActivePoles, activeRoboports, manualAnimation, manualUnionGrid, mediaAnimationInfo]);

  const copyBlueprint = async () => {
    if (!mediaAnimationInfo && animationEnabled && !sequenceFrames.length) {
      alert('Add at least one slideshow image before generating the blueprint.');
      return;
    }
    const activeFrameCount = mediaAnimationInfo?.frameCount ?? (manualAnimation ? manualAnimation.transitions.length + 1 : 1);
    if (ensureAnimationFrameLimit(activeFrameCount, t('Blueprint animation')) === null) {
      return;
    }
    const primaryLabel = blueprintImageInfo
      ? formatBlueprintLabel(blueprintImageInfo.sourceName, blueprintImageInfo.width, blueprintImageInfo.height)
      : 'Factorio Art';
    const blueprintLabel = mediaAnimationInfo
      ? `${mediaAnimationInfo.sourceName.replace(/\.[^/.]+$/, '')} (${mediaAnimationInfo.width}x${mediaAnimationInfo.height}, ${mediaAnimationInfo.frameCount} frames)${audioIncludedInCurrentComposition ? ' + stereo notes' : ''}`
      : manualAnimation
        ? `${primaryLabel} slideshow (${sequenceFrames.length} frames)${audioIncludedInCurrentComposition ? ' + stereo notes' : ''}`
        : audioIncludedInCurrentComposition && audioTrackInfo
          ? `${audioTrackInfo.sourceName.replace(/\.[^/.]+$/, '')} approximate stereo notes`
          : primaryLabel;
    const startedAt = performance.now();
    const estimatedEntities = generatedLampCount
      + animationStats.deciderCombinatorCount
      + animationStats.arithmeticCombinatorCount
      + animationStats.constantCombinatorCount
      + effectiveActivePoles.length
      + activeRoboports.length
      + animationStats.programmableSpeakerCount;
    let blueprintProgress = 0;
    const updateProgressStatus = () => {
      const elapsedSeconds = Math.floor((performance.now() - startedAt) / 1000);
      setStatusMsg(`Generating blueprint… ${blueprintProgress}% · ${elapsedSeconds.toLocaleString()} s · ${estimatedEntities.toLocaleString()}+ entities`);
    };
    updateProgressStatus();
    const progressTimer = window.setInterval(() => {
      updateProgressStatus();
    }, 1000);
    let response: CalculationWorkerResponse;
    try {
      response = await runCalculation({
        kind: 'blueprint',
        poleType,
        qualityIdx,
        autoPole,
        smartPlacement,
        autoRoboport,
        autoConstruction,
        label: blueprintLabel,
        includeAnimationHelp,
        animationControllerSide,
        backgroundTile,
      }, progress => {
        blueprintProgress = Math.max(blueprintProgress, Math.max(0, Math.min(100, Math.round(progress))));
        updateProgressStatus();
      });
    } catch (error) {
      console.error('Unable to generate blueprint.', error);
      setStatusMsg("");
      alert('Unable to generate the blueprint.');
      return;
    } finally {
      window.clearInterval(progressTimer);
    }
    const { bpString, status = 'Blueprint generation failed.' } = response;
    if (bpString) {
      lastGeneratedBlueprintRef.current = bpString;
      lastGeneratedBlueprintLabelRef.current = blueprintLabel;
      setHasGeneratedBlueprint(true);
      setStatusMsg(`Blueprint generated · ${bpString.length.toLocaleString()} characters · copying…`);
      try {
        if (window.factorioLampEditor) {
          const copied = await window.factorioLampEditor.copyText(bpString);
          if (copied.length !== bpString.length) throw new Error('The complete blueprint string was not copied.');
        } else {
          await navigator.clipboard.writeText(bpString);
        }
        setStatusMsg("Blueprint Copied!");
        setTimeout(() => setStatusMsg(""), 3000);
      } catch (error) {
        console.error('Unable to copy the blueprint.', error);
        setStatusMsg('Clipboard copy failed. The new blueprint is ready to save.');
        if (window.factorioLampEditor?.saveBlueprint) {
          try {
            const saved = await window.factorioLampEditor.saveBlueprint(bpString, blueprintLabel);
            if (!saved.canceled && saved.filePath) {
              setStatusMsg(`Blueprint saved to ${saved.filePath}`);
              alert(`The clipboard copy failed, but the newly generated blueprint was saved to:\n${saved.filePath}`);
              return;
            }
          } catch (saveError) {
            console.error('Unable to save the generated blueprint.', saveError);
          }
        }
        alert('Unable to copy the new blueprint to the clipboard. The previous clipboard content was cleared; use Save Blueprint to keep this generated result.');
      }
    } else {
      alert(status);
    }
  };

  const saveGeneratedBlueprint = async () => {
    const bpString = lastGeneratedBlueprintRef.current;
    if (!bpString || !window.factorioLampEditor?.saveBlueprint) return;
    try {
      const saved = await window.factorioLampEditor.saveBlueprint(
        bpString,
        lastGeneratedBlueprintLabelRef.current,
      );
      if (!saved.canceled && saved.filePath) {
        setStatusMsg(`Blueprint saved to ${saved.filePath}`);
        setTimeout(() => setStatusMsg(''), 5000);
      }
    } catch (error) {
      console.error('Unable to save the generated blueprint.', error);
      alert('Unable to save the generated blueprint to a file.');
    }
  };

  // Interactions
  const viewingMediaFrame = Boolean(mediaAnimationInfo);
  const viewingSequenceFrame = !viewingMediaFrame
    && animationEnabled
    && activePreviewFrameCount > 0;
  const hasAlternateFrameLamp = useCallback((x: number, y: number) => {
    if (mediaAnimationInfo) {
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
      return Boolean(mediaUnionGridRef.current.cells[y * GRID_W + x]);
    }
    if (!manualAnimation || x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
    return Boolean(manualUnionGrid.cells[y * GRID_W + x]);
  }, [manualAnimation, manualUnionGrid, mediaAnimationInfo]);

  const handleLampClick = useCallback((x: number, y: number) => {
    if (stampMode || x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    const index = y * GRID_W + x;
    const visibleGrid = viewingMediaFrame || viewingSequenceFrame
      ? mediaPreviewGridRef.current
      : gridRef.current;
    if (!visibleGrid.cells[index] && !hasAlternateFrameLamp(x, y)) return;
    setInspectedLamp({ x, y });
  }, [hasAlternateFrameLamp, stampMode, viewingMediaFrame, viewingSequenceFrame]);

  const handleInspectedLampColorChange = useCallback((nextColor: number) => {
    if (!inspectedLamp || (activePreviewAnimation && previewPlaying)) return;
    const index = inspectedLamp.y * GRID_W + inspectedLamp.x;
    if (index < 0 || index >= GRID_W * GRID_H) return;

    if (mediaAnimationInfo && mediaAnimationRef.current) {
      const updatedAnimation = updateGridAnimationCellAtTick(
        mediaAnimationRef.current,
        index,
        mediaPreviewTickRef.current,
        nextColor,
      );
      mediaAnimationRef.current = updatedAnimation;
      mediaUnionGridRef.current = createAnimationUnionGrid(updatedAnimation);
      mediaPreviewGridRef.current = renderGridAnimationAtTick(updatedAnimation, mediaPreviewTickRef.current);
      gridRef.current = updatedAnimation.firstFrame;
      committedGridRef.current = cloneGrid(gridRef.current);
      setMediaFrameTick(value => value + 1);
      setTick(value => value + 1);
      setPreviewSeekVersion(value => value + 1);
      return;
    }

    if (manualAnimation) {
      const frameIndex = Math.max(0, Math.min(sequenceFrames.length - 1, mediaPreviewFrameRef.current));
      const previewGrid = cloneGrid(mediaPreviewGridRef.current);
      previewGrid.cells[index] = nextColor >>> 0;
      mediaPreviewGridRef.current = previewGrid;
      setSequenceFrames(previous => previous.map((frame, candidateIndex) => {
        if (candidateIndex !== frameIndex) return frame;
        const editedGrid = cloneGrid(frame.grid);
        editedGrid.cells[index] = nextColor >>> 0;
        return { ...frame, grid: editedGrid };
      }));
      if (frameIndex === 0) {
        gridRef.current = cloneGrid(previewGrid);
        committedGridRef.current = cloneGrid(gridRef.current);
        setTick(value => value + 1);
      }
      setSequenceVersion(value => value + 1);
      setMediaFrameTick(value => value + 1);
      setPreviewSeekVersion(value => value + 1);
      return;
    }

    if (gridRef.current.cells[index] === (nextColor >>> 0)) return;
    gridRef.current.cells[index] = nextColor >>> 0;
    setPlacedImage(null);
    saveHistory();
    setTick(value => value + 1);
  }, [activePreviewAnimation, inspectedLamp, manualAnimation, mediaAnimationInfo, previewPlaying, saveHistory, sequenceFrames.length]);

  const inspectedLampColor = inspectedLamp
    ? (viewingMediaFrame || viewingSequenceFrame ? mediaPreviewGridRef.current : gridRef.current)
      .cells[inspectedLamp.y * GRID_W + inspectedLamp.x] ?? 0
    : 0;
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const camStart = useRef({ x: 0, y: 0 });
  const pressedPanKeysRef = useRef(new Map<string, 'up' | 'down' | 'left' | 'right'>());
  const keyboardPanFrameRef = useRef<number | null>(null);

  // Track last grid position for stamping on release
  const lastGridPos = useRef<{ x: number, y: number } | null>(null);
  const stampPlacementPendingRef = useRef(false);

  const onInteractStart = (e: React.MouseEvent | React.TouchEvent, x: number, y: number) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const button = 'button' in e ? e.button : 0;

    if (stampMode && stampBuffer && button !== 2) {
      // Commit on press instead of waiting for a canvas-local mouseup. Electron
      // can lose that release when focus changes (for example Print Screen or
      // an OS overlay), which used to leave a valid stamp apparently ignored.
      lastGridPos.current = null;
      void commitStamp(x, y);
      return;
    }

    if (button !== 2 && tool !== 'erase' && x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) {
      const index = y * GRID_W + x;
      const visibleGrid = viewingMediaFrame || viewingSequenceFrame
        ? mediaPreviewGridRef.current
        : gridRef.current;
      if (visibleGrid.cells[index] || hasAlternateFrameLamp(x, y)) {
        // A simple click is reserved for the lamp inspector. Erase keeps its
        // direct manipulation behavior, while all colors remain editable from
        // the inspector without an accidental brush stroke first.
        lastGridPos.current = null;
        if (tool === 'pan' || viewingMediaFrame || viewingSequenceFrame) {
          setIsPanning(true);
          panStart.current = { x: clientX, y: clientY };
          camStart.current = { ...camera };
        }
        return;
      }
    }

    if (button === 2 || tool === 'pan' || viewingSequenceFrame || viewingMediaFrame) {
      setIsPanning(true);
      panStart.current = { x: clientX, y: clientY };
      camStart.current = { ...camera };
      return;
    }

    lastGridPos.current = { x, y };

    if (tool === 'fill') {
      const newGrid = floodFill(gridRef.current, x, y, colorToUint32(color));
      if (newGrid !== gridRef.current) {
        gridRef.current = newGrid;
        setPlacedImage(null);
        saveHistory();
        setTick(t => t + 1);
      }
    } else {
      // Brush / Erase
      draw(x, y);
    }
  };

  const draw = (x: number, y: number) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    const targetColor = tool === 'erase' ? 0 : colorToUint32(color);
    const index = y * GRID_W + x;
    if (gridRef.current.cells[index] !== targetColor) {
      setPlacedImage(null);
      gridRef.current.cells[index] = targetColor;
      // We don't need to setTick here because mutating ref + Canvas RAF handles it visually.
      // But we need to know we Changed something to save history on MouseUp.
      changedRef.current = true;
    }
  };

  const changedRef = useRef(false);

  const onInteractMove = (e: React.MouseEvent | React.TouchEvent, x: number, y: number) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (isPanning) {
      const dx = (clientX - panStart.current.x) / camera.zoom;
      const dy = (clientY - panStart.current.y) / camera.zoom;
      setCamera({
        ...camera,
        x: camStart.current.x - dx,
        y: camStart.current.y - dy
      });
      return;
    }

    lastGridPos.current = { x, y };

    if (stampMode) return; // Ghost is handled by Canvas render loop

    // If mouse is down (buttons=1 for left click)
    // const buttons = 'buttons' in e ? e.buttons : 1;
    // Actually Pointer Events are better but we use Mouse/Touch.
    // For MouseEvent: buttons===1. For Touch, we only get move if touching.

    const isDown = (e.nativeEvent instanceof MouseEvent) ? (e.nativeEvent.buttons === 1) : true;

    if (isDown && (tool === 'brush' || tool === 'erase')) {
      draw(x, y);
    }
  };

  const onInteractEnd = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (stampMode && stampBuffer && lastGridPos.current) {
      void commitStamp(lastGridPos.current.x, lastGridPos.current.y);
      lastGridPos.current = null;
      return;
    }

    if (changedRef.current) {
      saveHistory();
      changedRef.current = false;
    }
  };

  const commitStamp = async (cx: number, cy: number) => {
    if (stampPlacementPendingRef.current) return;
    const pendingStamp = stampBuffer;
    if (!pendingStamp) return;
    stampPlacementPendingRef.current = true;

    if (stampMode === 'audio') {
      if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) {
        stampPlacementPendingRef.current = false;
        return;
      }
      setAudioPlacement({ x: Math.round(cx), y: Math.round(cy) });
      setStampMode(null);
      setStampBuffer(null);
      shouldFitAnimationPreviewRef.current = true;
      setTick(value => value + 1);
      setStatusMsg(t('Audio controller placed. All speakers share the same tick clock.'));
      setTimeout(() => setStatusMsg(''), 3000);
      stampPlacementPendingRef.current = false;
      return;
    }

    // Check mode
    const isText = stampMode === 'text';

    // Image buffer is already scaled (resampled). Text buffer is 1x and needs scaling.
    const destW = isText ? Math.floor(pendingStamp.w * stampScale) : pendingStamp.w;
    const destH = isText ? Math.floor(pendingStamp.h * stampScale) : pendingStamp.h;

    // Center
    const startX = cx - Math.floor(destW / 2);
    const startY = cy - Math.floor(destH / 2);

    const renderStampFrame = (base: GridData, source: Uint32Array) => {
      const frame = cloneGrid(base);
      let changed = false;
      for (let dy = 0; dy < destH; dy++) {
        for (let dx = 0; dx < destW; dx++) {
          const gx = startX + dx;
          const gy = startY + dy;
          if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) continue;
          const index = gy * GRID_W + gx;
          // Text display zones own their full rectangle so their one-cell
          // border and scrolling gaps stay genuinely empty in every frame.
          if (isText && frame.cells[index]) {
            frame.cells[index] = 0;
            changed = true;
          }
          const srcX = isText ? Math.floor(dx / stampScale) : dx;
          const srcY = isText ? Math.floor(dy / stampScale) : dy;
          if (srcX < 0 || srcX >= pendingStamp.w || srcY < 0 || srcY >= pendingStamp.h) continue;
          const col = source[srcY * pendingStamp.w + srcX];
          if (col && frame.cells[index] !== col) {
            frame.cells[index] = col;
            changed = true;
          }
        }
      }
      return { frame, changed };
    };

    const stampAnimation = isText ? pendingStamp.animation : undefined;
    if (stampAnimation) {
      const previousAnimation = mediaAnimationRef.current;
      const previousAnimationInfo = mediaAnimationInfo;
      const requiredFrameCount = Math.max(
        stampAnimation.transitions.length + 1,
        previousAnimation ? animationMaximumFrameCount(previousAnimation) : 1,
      );
      const placementFrameLimit = ensureAnimationFrameLimit(
        requiredFrameCount,
        pendingStamp.sourceName ?? t('Animated text stamp'),
      );
      if (placementFrameLimit === null) {
        setStampBuffer(null);
        setStampMode(null);
        setStatusMsg(t('Structure cancelled.'));
        setTimeout(() => setStatusMsg(''), 2500);
        stampPlacementPendingRef.current = false;
        return;
      }
      setStatusMsg(previousAnimation ? 'Adding an independent animated stamp…' : 'Placing animated text…');
      try {
        const baseGrid = cloneGrid(previousAnimation?.firstFrame ?? gridRef.current);
        const firstFrame = renderStampFrame(baseGrid, pendingStamp.data).frame;
        const placementStamp = previousAnimation ? {
          ...pendingStamp,
          animation: {
            ...stampAnimation,
            transitions: stampAnimation.transitions.map(transition => ({
              ...transition,
              indices: transition.indices.slice(),
              colors: transition.colors.slice(),
            })),
          },
        } : pendingStamp;
        const placed = await placeSparseStampAnimation(
          placementStamp,
          firstFrame,
          startX,
          startY,
          stampScale,
        );
        const animation = previousAnimation
          ? composeGridAnimations(
            previousAnimation,
            placed.animation,
            { x: startX, y: startY, width: destW, height: destH },
            placementFrameLimit,
          )
          : placed.animation;
        const unionGrid = previousAnimation ? createAnimationUnionGrid(animation) : placed.unionGrid;
        clearMediaAnimation(true);
        mediaAnimationRef.current = animation;
        mediaUnionGridRef.current = unionGrid;
        mediaPreviewGridRef.current = animation.firstFrame;
        gridRef.current = animation.firstFrame;
        committedGridRef.current = cloneGrid(gridRef.current);
        historyRef.current = [];
        setHistoryIndex(-1);
        setSequenceFrames(previous => {
          previous.forEach(frame => URL.revokeObjectURL(frame.thumbnailUrl));
          return [];
        });
        setAnimationEnabled(false);
        resetPreviewPlayback(true);
        setPlacedImage(null);
        const stampSourceName = pendingStamp.sourceName ?? 'Animated text';
        const animationSourceName = previousAnimation
          ? `${previousAnimationInfo?.sourceName ?? 'Animation'} + ${stampSourceName}`
          : stampSourceName;

        let minX = GRID_W;
        let minY = GRID_H;
        let maxX = -1;
        let maxY = -1;
        unionGrid.cells.forEach((cell, index) => {
          if (!cell) return;
          const x = index % GRID_W;
          const y = Math.floor(index / GRID_W);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        });
        const contentWidth = maxX >= minX ? maxX - minX + 1 : destW;
        const contentHeight = maxY >= minY ? maxY - minY + 1 : destH;
        const contentCenterX = maxX >= minX ? (minX + maxX + 1) / 2 : cx;
        const contentCenterY = maxY >= minY ? (minY + maxY + 1) / 2 : cy;
        const durationTicks = animationDurationTicks(animation);
        const frameCount = animationMaximumFrameCount(animation);
        const trackCount = animationTrackCount(animation);
        setBlueprintImageInfo({ sourceName: animationSourceName, width: contentWidth, height: contentHeight });
        setMediaAnimationInfo({
          sourceName: animationSourceName,
          sourceWidth: contentWidth,
          sourceHeight: contentHeight,
          width: contentWidth,
          height: contentHeight,
          sampledFrameCount: frameCount,
          frameCount,
          sampledFps: frameCount * 60 / durationTicks,
          factorioFps: frameCount * 60 / durationTicks,
          durationTicks,
        });
        setStampMode(null);
        setStampBuffer(null);
        setTick(value => value + 1);
        setMediaFrameTick(value => value + 1);
        setFitView({
          centerX: contentCenterX * PIXEL_SIZE,
          centerY: contentCenterY * PIXEL_SIZE,
          width: contentWidth * PIXEL_SIZE,
          height: contentHeight * PIXEL_SIZE,
        });
        setStatusMsg(trackCount > 1
          ? `${trackCount.toLocaleString()} independent animation tracks placed (up to ${frameCount.toLocaleString()} frames each).`
          : `${frameCount.toLocaleString()} animation frames created.`);
        setTimeout(() => setStatusMsg(''), 3000);
      } catch (error) {
        console.error('Unable to place animated text.', error);
        setStatusMsg('');
        alert(`Unable to place this animated text.\n${error instanceof Error ? error.message : String(error)}`);
      } finally {
        stampPlacementPendingRef.current = false;
      }
      return;
    }

    const { frame, changed } = renderStampFrame(gridRef.current, pendingStamp.data);
    gridRef.current = frame;

    if (changed) {
      setPlacedImage(null);
      saveHistory();
      setTick(t => t + 1);
    }

    setStampMode(null);
    setStampBuffer(null);
    stampPlacementPendingRef.current = false;
  };

  const handleStampScale = useCallback((delta: number) => {
    setStampScale(s => {
      return stampMode === 'text' ? Math.max(TEXT_SCALE_MIN, s + delta) : s;
    });
  }, [stampMode]);

  useEffect(() => {
    const pressedKeys = pressedPanKeysRef.current;

    const stopAnimation = () => {
      if (keyboardPanFrameRef.current !== null) {
        cancelAnimationFrame(keyboardPanFrameRef.current);
        keyboardPanFrameRef.current = null;
      }
    };

    const startAnimation = () => {
      if (keyboardPanFrameRef.current !== null) return;
      let previousTime = performance.now();
      const advance = (now: number) => {
        if (!pressedKeys.size) {
          keyboardPanFrameRef.current = null;
          return;
        }
        const elapsedSeconds = Math.min(0.05, Math.max(0, now - previousTime) / 1000);
        previousTime = now;
        let horizontal = 0;
        let vertical = 0;
        pressedKeys.forEach(direction => {
          if (direction === 'left') horizontal -= 1;
          else if (direction === 'right') horizontal += 1;
          else if (direction === 'up') vertical -= 1;
          else if (direction === 'down') vertical += 1;
        });
        if (horizontal || vertical) {
          const diagonalScale = horizontal && vertical ? Math.SQRT1_2 : 1;
          setCamera(current => {
            const distance = KEYBOARD_PAN_SPEED * elapsedSeconds * diagonalScale / current.zoom;
            return {
              ...current,
              x: current.x + horizontal * distance,
              y: current.y + vertical * distance,
            };
          });
        }
        keyboardPanFrameRef.current = requestAnimationFrame(advance);
      };
      keyboardPanFrameRef.current = requestAnimationFrame(advance);
    };

    const handlePanKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableKeyboardTarget(event.target)) return;
      const direction = keyboardPanDirection(event.code, event.key);
      const token = keyboardPanToken(event.code, event.key);
      if (!direction || !token) return;
      event.preventDefault();
      pressedKeys.set(token, direction);
      startAnimation();
    };
    const handlePanKeyUp = (event: KeyboardEvent) => {
      const token = keyboardPanToken(event.code, event.key);
      if (!token) return;
      pressedKeys.delete(token);
      if (!pressedKeys.size) stopAnimation();
    };
    const handleWindowBlur = () => {
      pressedKeys.clear();
      stopAnimation();
    };

    window.addEventListener('keydown', handlePanKeyDown);
    window.addEventListener('keyup', handlePanKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handlePanKeyDown);
      window.removeEventListener('keyup', handlePanKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      pressedKeys.clear();
      stopAnimation();
    };
  }, []);

  const handleZoomKey = useCallback((e: KeyboardEvent) => {
    if (isEditableKeyboardTarget(e.target)) return;
    if (stampMode) {
      if (e.key === "+" || e.key === "=") {
        handleStampScale(1);
      }
      if (e.key === "-" || e.key === "_") {
        handleStampScale(-1);
      }
      if (e.key === "Escape") {
        setStampMode(null);
        setStampBuffer(null);
      }
    } else {
      if (e.key.toLowerCase() === 'h') setTool('pan');
      if (e.key.toLowerCase() === 'b') setTool('brush');
      if (e.key.toLowerCase() === 'f') setTool('fill');
      if (e.key.toLowerCase() === 'e') setTool('erase');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo(); else undo();
      }
    }
  }, [handleStampScale, stampMode, undo, redo]);

  useEffect(() => {
    window.addEventListener('keydown', handleZoomKey);
    return () => window.removeEventListener('keydown', handleZoomKey);
  }, [handleZoomKey]);

  // Coords
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [showHelp, setShowHelp] = useState(false);

  // Drag & Drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (await isMediaImportFile(file)) {
        try {
          setAudioLinkedToAnimation(false);
          mediaSourceFileRef.current = file;
          setMediaTargetSize(null);
          await importMedia(file, mediaFpsLimit, maxDefinition, maxFrameCount, null, true);
        } catch (err) {
          console.error(err);
        }
      } else if (file.type.startsWith('image/')) {
        try {
          await importImage(file);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }, [importImage, importMedia, maxDefinition, maxFrameCount, mediaFpsLimit]);

  const reducePendingImage = useCallback(() => {
    if (!pendingImage) return;

    const scale = Math.min(maxDefinition / pendingImage.originalW, maxDefinition / pendingImage.originalH);
    const targetW = Math.max(1, Math.floor(pendingImage.originalW * scale));
    const targetH = Math.max(1, Math.floor(pendingImage.originalH * scale));
    startPlacedImage(
      pendingImage.image,
      pendingImage.originalW,
      pendingImage.originalH,
      targetW,
      targetH,
      pendingImage.sourceName,
    );
    setPendingImage(null);
  }, [maxDefinition, pendingImage, startPlacedImage]);

  const manualFrameOverflow = animationEnabled && sequenceFrames.length > maxFrameCount;
  const frameSelectionItems = useMemo<FrameSelectionItem[]>(() => {
    if (pendingMediaSelection) {
      return pendingMediaSelection.decoded.frameThumbnails.map((_, index) => ({
        id: String(index),
        label: `Frame ${index + 1}`,
        thumbnailUrl: pendingMediaSelection.thumbnailUrls[index] ?? '',
        selectedForRemoval: pendingMediaSelection.removals.has(index),
      }));
    }
    if (!manualFrameOverflow) return [];
    return sequenceFrames.map(frame => ({
        id: frame.id,
        label: frame.sourceName,
        thumbnailUrl: frame.thumbnailUrl,
        selectedForRemoval: manualFrameRemovals.has(frame.id),
      }));
  }, [manualFrameOverflow, manualFrameRemovals, pendingMediaSelection, sequenceFrames]);

  const toggleFrameRemoval = useCallback((id: string) => {
    if (pendingMediaSelection) {
      const index = Number(id);
      setPendingMediaSelection(previous => {
        if (!previous || !Number.isInteger(index)) return previous;
        const removals = new Set(previous.removals);
        if (removals.has(index)) removals.delete(index);
        else removals.add(index);
        return { ...previous, removals };
      });
      return;
    }
    setManualFrameRemovals(previous => {
      const removals = new Set(previous);
      if (removals.has(id)) removals.delete(id);
      else removals.add(id);
      return removals;
    });
  }, [pendingMediaSelection]);

  const letAppChooseFrames = useCallback(() => {
    const itemCount = pendingMediaSelection?.decoded.frameCount ?? sequenceFrames.length;
    const kept = new Set(evenlySpacedFrameIndices(itemCount, maxFrameCount));
    if (pendingMediaSelection) {
      setPendingMediaSelection(previous => previous ? {
        ...previous,
        removals: new Set(Array.from({ length: itemCount }, (_, index) => index).filter(index => !kept.has(index))),
      } : previous);
      return;
    }
    setManualFrameRemovals(new Set(sequenceFrames
      .filter((_, index) => !kept.has(index))
      .map(frame => frame.id)));
  }, [maxFrameCount, pendingMediaSelection, sequenceFrames]);

  const applyFrameSelection = useCallback(() => {
    if (pendingMediaSelection) {
      const kept = Array.from(
        { length: pendingMediaSelection.decoded.frameCount },
        (_, index) => index,
      ).filter(index => !pendingMediaSelection.removals.has(index));
      const selected = selectDecodedMediaFrames(pendingMediaSelection.decoded, kept);
      placeDecodedMedia(selected, mediaFpsLimit, maxDefinition);
      return;
    }
    setSequenceFrames(previous => {
      previous
        .filter(frame => manualFrameRemovals.has(frame.id))
        .forEach(frame => URL.revokeObjectURL(frame.thumbnailUrl));
      const next = previous.filter(frame => !manualFrameRemovals.has(frame.id));
      gridRef.current = next[0] ? cloneGrid(next[0].grid) : createEmptyGrid(GRID_W, GRID_H);
      committedGridRef.current = cloneGrid(gridRef.current);
      setTick(value => value + 1);
      return next;
    });
    setManualFrameRemovals(new Set());
    resetPreviewPlayback(true);
    setSequenceVersion(version => version + 1);
  }, [manualFrameRemovals, maxDefinition, mediaFpsLimit, pendingMediaSelection, placeDecodedMedia, resetPreviewPlayback]);

  const cancelFrameSelection = useCallback(() => {
    if (pendingMediaSelection) {
      setPendingMediaSelection(null);
      decodedMediaRef.current = null;
      mediaSourceFileRef.current = null;
      lastDecodedFpsLimitRef.current = null;
      lastDecodedMaxDefinitionRef.current = null;
      setStatusMsg('');
      return;
    }
    setManualFrameRemovals(new Set());
  }, [pendingMediaSelection]);

  const resetCanvas = useCallback(() => {
    clearMediaAnimation(false);
    clearAudioTrack();
    setSequenceFrames(previous => {
      previous.forEach(frame => URL.revokeObjectURL(frame.thumbnailUrl));
      return [];
    });
    setSequenceVersion(version => version + 1);
    setPlacedImage(null);
    setPendingImage(null);
    setBlueprintImageInfo(null);
    setAnimationEnabled(false);
    resetPreviewPlayback(false);
    setManualFrameRemovals(new Set());
    setStampMode(null);
    setStampBuffer(null);
    setStampScale(1);
    setInspectedLamp(null);
    lastGeneratedBlueprintRef.current = null;
    lastGeneratedBlueprintLabelRef.current = 'Factorio Art';
    setHasGeneratedBlueprint(false);
    historyRef.current = [];
    gridRef.current = createEmptyGrid(GRID_W, GRID_H);
    committedGridRef.current = cloneGrid(gridRef.current);
    setHistoryIndex(-1);
    setFitView(undefined);
    setTick(value => value + 1);
    setStatusMsg('Canvas reset.');
    setTimeout(() => setStatusMsg(''), 2000);
  }, [clearAudioTrack, clearMediaAnimation, resetPreviewPlayback]);

  return (
    <div
      className="flex flex-col h-screen bg-gray-900 text-gray-300 font-sans"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Header
        onReset={resetCanvas}
        gameTexturesEnabled={gameTexturesEnabled}
        gameTexturesStatus={gameTexturesStatus}
        onGameTexturesChange={enabled => void handleGameTexturesChange(enabled)}
      />

      <main className="flex-1 overflow-hidden relative w-full flex flex-col md:flex-row">
        <div id="view-draw" className="absolute inset-0 flex flex-col md:flex-row w-full h-full">

          {/* Canvas Area */}
          <main className="flex-1 flex flex-col relative bg-gray-950 order-1 md:order-2 h-[60vh] md:h-auto overflow-hidden">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              {hasGeneratedBlueprint && window.factorioLampEditor?.saveBlueprint && (
                <button
                  type="button"
                  onClick={saveGeneratedBlueprint}
                  className="px-3 py-2 bg-sky-700 hover:bg-sky-600 text-white font-bold rounded-lg shadow-lg text-xs md:text-sm flex items-center gap-2 transition-transform hover:-translate-y-0.5 active:scale-95 border border-sky-400/20 backdrop-blur-sm opacity-90 hover:opacity-100"
                  title="Save the last generated blueprint without generating it again"
                >
                  💾 <span className="hidden sm:inline">Save Blueprint</span>
                </button>
              )}
              <button
                onClick={copyBlueprint}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg shadow-lg text-xs md:text-sm flex items-center gap-2 transition-transform hover:-translate-y-0.5 active:scale-95 border border-yellow-400/20 backdrop-blur-sm opacity-90 hover:opacity-100"
              >
                📋 <span className="hidden sm:inline">Copy Blueprint</span>
              </button>
            </div>

            {animationPreviewEntities.length > 0 && (
              <div className="pointer-events-none absolute right-4 top-16 z-10 max-w-72 rounded border border-cyan-400/30 bg-gray-950/85 px-3 py-2 text-[9px] leading-4 text-cyan-100 shadow-lg backdrop-blur-sm">
                <strong className="block uppercase tracking-wider text-cyan-300">Blueprint controller preview</strong>
                These footprints are the combinators, controller substations, relays, speakers, and optional display that will be exported with the current animation.
                <span className="mt-1 block text-cyan-300/80">
                  {animationPreviewEntities.length.toLocaleString()} shown · spatially culled · up to {MAX_BLUEPRINT_PREVIEW_ENTITIES.toLocaleString()} sampled ROM/audio footprints
                </span>
              </div>
            )}

            {stampMode && (
              <div className="absolute top-4 left-4 z-10 bg-blue-600/90 backdrop-blur text-white px-3 py-1.5 rounded-lg shadow-lg text-[10px] md:text-xs font-bold border border-blue-400/30 flex items-center gap-2 pointer-events-none">
                🎯 <span>{stampMode === 'audio' ? t('Click to place audio controller') : t('Click to Stamp')}</span>
              </div>
            )}

            {hasActiveAnimation && (
              <div className={`absolute left-4 z-20 flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-gray-950/90 px-2 py-1.5 text-[10px] text-cyan-100 shadow-lg backdrop-blur-sm ${stampMode ? 'top-14' : 'top-4'}`}>
                <button
                  type="button"
                  onClick={() => setPreviewPlaying(playing => !playing)}
                  className="flex h-7 w-7 items-center justify-center rounded border border-cyan-400/30 bg-cyan-950 text-cyan-200 transition-colors hover:bg-cyan-900"
                  title={previewPlaying ? 'Pause real-time preview' : 'Play real-time preview'}
                  aria-label={previewPlaying ? 'Pause real-time preview' : 'Play real-time preview'}
                  aria-pressed={previewPlaying}
                >
                  <i className={`fa-solid ${previewPlaying ? 'fa-pause' : 'fa-play'}`} aria-hidden="true"></i>
                </button>
                <span>
                  <strong className="block uppercase tracking-wider text-cyan-300">
                    {previewPlaying ? 'Real-time preview' : 'Preview paused'}
                  </strong>
                  <span className="font-mono text-cyan-100/75">
                    Frame {Math.min(mediaPreviewFrame + 1, activePreviewFrameCount)} / {activePreviewFrameCount} · 60 ticks/s
                  </span>
                </span>
              </div>
            )}

            {inspectedLamp && (
              <LampInspector
                x={inspectedLamp.x}
                y={inspectedLamp.y}
                color={inspectedLampColor}
                hasAnimation={hasActiveAnimation}
                isPlaying={previewPlaying}
                frame={mediaPreviewFrame}
                frameCount={Math.max(1, activePreviewFrameCount)}
                onTogglePlayback={() => setPreviewPlaying(playing => !playing)}
                onChangeColor={handleInspectedLampColorChange}
                onClose={() => setInspectedLamp(null)}
              />
            )}

            <Canvas
              gridData={viewingMediaFrame || viewingSequenceFrame ? mediaPreviewGridRef.current : gridRef.current}
              gridVersion={viewingMediaFrame || viewingSequenceFrame ? mediaFrameTick : tick}
              camera={camera}
              setCamera={setCamera}
              onInteractStart={onInteractStart}
              onInteractMove={onInteractMove}
              onInteractEnd={onInteractEnd}
              onLampClick={handleLampClick}
              stampMode={stampMode}
              stampBuffer={stampBuffer}
              stampScale={stampScale}
              fitView={fitView}
              autoPole={autoPole}
              activePoles={effectiveActivePoles}
              poleType={activePolesState.type}
              qualityIdx={activePolesState.qualityIdx}
              autoRoboport={autoPole && autoRoboport}
              activeRoboports={activeRoboports}
              previewEntities={animationPreviewEntities}
              hasAlternateFrameLamp={hasAlternateFrameLamp}
              lampPresenceGrid={viewingMediaFrame
                ? mediaUnionGridRef.current
                : viewingSequenceFrame
                  ? manualUnionGrid
                  : undefined}
              gameTextures={gameTexturesEnabled ? gameTextures : null}
              onHover={(x, y) => setCoords({ x, y })}
              tool={viewingSequenceFrame || viewingMediaFrame ? 'pan' : tool}
            />

            {animationEnabled && !viewingMediaFrame && (
              <SequenceFrameTray
                frames={sequenceFrameInfos}
                activeFrame={mediaPreviewFrame}
                maxDefinition={maxDefinition}
                onSelect={seekPreviewFrame}
                onRemove={removeSequenceFrame}
                onDimensionChange={handleSequenceFrameDimensionChange}
                onDelayChange={handleSequenceFrameDelayChange}
              />
            )}

            <div className="h-6 md:h-8 bg-gray-900 border-t border-gray-800 flex items-center px-4 md:px-6 text-[10px] text-gray-500 justify-between shrink-0 font-mono">
              <span className="opacity-70">X: {coords.x} Y: {coords.y}</span>
              <span className={`font-bold opacity-70 ${statusMsg ? 'text-green-400' : ''}`}>{statusMsg || "READY"}</span>
            </div>
          </main>

          <Toolbar
            currentTool={tool} setTool={setTool}
            color={color} setColor={setColor}
            onUndo={undo} onRedo={redo}
            renderTextStamp={handleTextStamp}
            renderNotoAnimatedEmojiStamp={handleNotoAnimatedEmojiStamp}
            onImageUpload={handleImageUpload}
            onImageDimensionChange={handleImageDimensionChange}
            lockImageAspectRatio={lockImageAspectRatio}
            setLockImageAspectRatio={setLockImageAspectRatio}
            autoPole={autoPole} setAutoPole={setAutoPole}
            autoRoboport={autoRoboport} setAutoRoboport={setAutoRoboport}
            autoConstruction={autoConstruction} setAutoConstruction={setAutoConstruction}
            smartPlacement={smartPlacement} setSmartPlacement={setSmartPlacement}
            poleType={poleType} setPoleType={setPoleType}
            qualityIdx={qualityIdx} setQualityIdx={setQualityIdx}
            isDragging={isDragging}
            lampCount={generatedLampCount}
            relayPoleCount={animationStats.relayPoleCount}
            deciderCombinatorCount={animationStats.deciderCombinatorCount}
            arithmeticCombinatorCount={animationStats.arithmeticCombinatorCount}
            constantCombinatorCount={animationStats.constantCombinatorCount}
            displayPanelCount={animationStats.displayPanelCount}
            programmableSpeakerCount={animationStats.programmableSpeakerCount}
            poleCount={effectiveActivePoles.length}
            controllerPoleCount={animationStats.controllerPoleCount}
            roboportCount={activeRoboports.length + animationStats.controllerRoboportCount}
            imageDimensions={imageDimensions}
            maxDefinition={maxDefinition}
            setMaxDefinition={setMaxDefinition}
            maxFrameCount={maxFrameCount}
            setMaxFrameCount={setMaxFrameCount}
            backgroundTile={backgroundTile}
            setBackgroundTile={setBackgroundTile}
            animationEnabled={animationEnabled}
              setAnimationEnabled={(enabled) => {
                setAnimationEnabled(enabled);
                resetPreviewPlayback(enabled);
            }}
            onSequenceImagesUpload={handleSequenceImageUpload}
            sequenceFrameCount={sequenceFrames.length}
            sequenceGlobalDelaySeconds={sequenceGlobalDelaySeconds}
            onSequenceGlobalDelayChange={handleSequenceGlobalDelayChange}
            includeAnimationHelp={includeAnimationHelp}
            setIncludeAnimationHelp={setIncludeAnimationHelp}
            animationControllerSide={animationControllerSide}
            setAnimationControllerSide={setAnimationControllerSide}
            onMediaUpload={handleMediaUpload}
            mediaFpsLimit={mediaFpsLimit}
            setMediaFpsLimit={setMediaFpsLimit}
            mediaColorMode={mediaColorMode}
            setMediaColorMode={setMediaColorMode}
            mediaMonochromeThreshold={mediaMonochromeThreshold}
            setMediaMonochromeThreshold={setMediaMonochromeThreshold}
            mediaDifferenceThreshold={mediaDifferenceThreshold}
            setMediaDifferenceThreshold={setMediaDifferenceThreshold}
            onMediaDimensionChange={handleMediaDimensionChange}
            mediaAnimationInfo={mediaAnimationInfo ?? undefined}
            mediaImporting={mediaImporting}
            mediaPreviewFrame={mediaPreviewFrame}
            setMediaPreviewFrame={seekPreviewFrame}
            onRemoveMediaAnimation={() => clearMediaAnimation(true)}
            onAudioUpload={handleAudioUpload}
            audioNotesPerSecond={audioNotesPerSecond}
            setAudioNotesPerSecond={setAudioNotesPerSecond}
            audioVoicesPerChannel={audioVoicesPerChannel}
            setAudioVoicesPerChannel={setAudioVoicesPerChannel}
            audioTrackInfo={audioTrackInfo ?? undefined}
            audioImporting={audioImporting}
            onRemoveAudioTrack={clearAudioTrack}
            audioPlaced={Boolean(audioPlacement)}
            onPlaceAudioTrack={() => {
              if (audioTrackInfo) beginAudioPlacement(audioTrackInfo);
            }}
            hasAnimation={hasActiveAnimation}
            audioLinkedToAnimation={audioLinkedToAnimation}
            setAudioLinkedToAnimation={setAudioLinkedToAnimation}
            leftAudioInstrument={leftAudioInstrument}
            setLeftAudioInstrument={setLeftAudioInstrument}
            rightAudioInstrument={rightAudioInstrument}
            setRightAudioInstrument={setRightAudioInstrument}
          />

        </div>
      </main>

      <button
        onClick={() => setShowHelp(true)}
        className="fixed bottom-12 right-3 z-40 flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-indigo-500"
        title="Help"
      >
        <i className="fa-solid fa-circle-question" aria-hidden="true"></i>
        <span>Help</span>
      </button>

      <ImportSizeModal
        image={pendingImage}
        maxWidth={maxDefinition}
        maxHeight={maxDefinition}
        onReduce={reducePendingImage}
        onCancel={() => setPendingImage(null)}
      />

      {frameSelectionItems.length > 0 && (
        <FrameSelectionTray
          items={frameSelectionItems}
          maximumFrames={maxFrameCount}
          onToggle={toggleFrameRemoval}
          onLetAppDecide={letAppChooseFrames}
          onApply={applyFrameSelection}
          onCancel={cancelFrameSelection}
        />
      )}

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

export default App;
