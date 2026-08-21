/// <reference lib="webworker" />

import {
    calculateActivePoles,
    calculateAnimationPreviewLayout,
    calculateMediaAnimationPreviewLayout,
    calculateActiveRoboports,
    calculateSmartPoles,
    createUnionGrid,
    generateAnimatedBlueprintData,
    generateMediaAnimationBlueprintData,
    generateBlueprintData,
} from '../utils/blueprint';
import type { AnimationControllerSide } from '../utils/blueprint';
import type { GridData } from '../utils/grid';
import { createAnimationUnionGrid, type GridAnimationData } from '../utils/mediaAnimation';
import type { BackgroundTileName } from '../constants';
import type { AudioInstrumentSelections, DecodedAudioTrack } from '../utils/audio';

type WorkerRequest = {
    id: number;
    kind: 'layout' | 'blueprint';
    cells: ArrayBuffer;
    secondFrameCells?: ArrayBuffer;
    mediaAnimation?: {
        firstDurationTicks: number;
        transitions: {
            indices: ArrayBuffer;
            colors: ArrayBuffer;
            durationTicks: number;
        }[];
    };
    width: number;
    height: number;
    poleType: string;
    qualityIdx: number;
    smartPlacement: boolean;
    autoRoboport: boolean;
    autoConstruction?: boolean;
    autoPole?: boolean;
    label?: string;
    animationEnabled?: boolean;
    animationDelayTicks?: number;
    includeAnimationHelp?: boolean;
    animationControllerSide?: AnimationControllerSide;
    backgroundTile?: BackgroundTileName;
    audioTrack?: DecodedAudioTrack;
    audioInstruments?: AudioInstrumentSelections;
};

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

context.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    try {
        const grid: GridData = {
            width: request.width,
            height: request.height,
            cells: new Uint32Array(request.cells),
        };
        const secondFrame: GridData | undefined = request.secondFrameCells
            ? {
                width: request.width,
                height: request.height,
                cells: new Uint32Array(request.secondFrameCells),
            }
            : undefined;
        const mediaAnimation: GridAnimationData | undefined = request.mediaAnimation
            ? {
                firstFrame: grid,
                firstDurationTicks: request.mediaAnimation.firstDurationTicks,
                transitions: request.mediaAnimation.transitions.map(transition => ({
                    indices: new Uint32Array(transition.indices),
                    colors: new Uint32Array(transition.colors),
                    durationTicks: transition.durationTicks,
                })),
            }
            : undefined;
        const playbackAnimation: GridAnimationData | undefined = mediaAnimation ?? (request.audioTrack
            ? {
                firstFrame: grid,
                firstDurationTicks: Math.max(2, Math.round(request.audioTrack.durationTicks)),
                transitions: [],
            }
            : undefined);

        if (request.kind === 'blueprint') {
            let lastProgress = -1;
            const reportProgress = (percentage: number) => {
                const progress = Math.max(0, Math.min(100, Math.round(percentage)));
                if (progress === lastProgress) return;
                lastProgress = progress;
                context.postMessage({ id: request.id, kind: request.kind, progress });
            };
            reportProgress(0);
            const result = playbackAnimation
                ? generateMediaAnimationBlueprintData(playbackAnimation, request.width, request.height, {
                    poleType: request.poleType,
                    qualityIdx: request.qualityIdx,
                    autoPole: Boolean(request.autoPole),
                    smartPlacement: request.smartPlacement,
                    autoRoboport: request.autoRoboport,
                    autoConstruction: Boolean(request.autoConstruction),
                    includeHelpDisplay: Boolean(request.includeAnimationHelp),
                    controllerSide: request.animationControllerSide ?? 'top',
                    label: request.label,
                    backgroundTile: request.backgroundTile,
                    audioTrack: request.audioTrack,
                    audioInstruments: request.audioInstruments,
                    onProgress: reportProgress,
                })
                : request.animationEnabled && secondFrame
                ? generateAnimatedBlueprintData(grid, secondFrame, request.width, request.height, {
                    poleType: request.poleType,
                    qualityIdx: request.qualityIdx,
                    autoPole: Boolean(request.autoPole),
                    smartPlacement: request.smartPlacement,
                    autoRoboport: request.autoRoboport,
                    autoConstruction: Boolean(request.autoConstruction),
                    delayTicks: request.animationDelayTicks ?? 900,
                    includeHelpDisplay: Boolean(request.includeAnimationHelp),
                    controllerSide: request.animationControllerSide ?? 'top',
                    label: request.label,
                    backgroundTile: request.backgroundTile,
                })
                : generateBlueprintData(
                    grid,
                    request.width,
                    request.height,
                    request.poleType,
                    request.qualityIdx,
                    Boolean(request.autoPole),
                    request.smartPlacement,
                    request.autoRoboport,
                    Boolean(request.autoConstruction),
                    request.label,
                    request.backgroundTile,
                );
            reportProgress(100);
            context.postMessage({ id: request.id, kind: request.kind, ...result });
            return;
        }

        const layoutGrid = playbackAnimation
            ? createAnimationUnionGrid(playbackAnimation)
            : request.animationEnabled && secondFrame
            ? createUnionGrid(grid, secondFrame, request.width, request.height)
            : grid;
        let minX = request.width;
        let minY = request.height;
        let maxX = -1;
        let maxY = -1;
        for (let index = 0; index < layoutGrid.cells.length; index++) {
            if (!layoutGrid.cells[index]) continue;
            const x = index % request.width;
            const y = Math.floor(index / request.width);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        if (maxX === -1 && !request.audioTrack) {
            context.postMessage({
                id: request.id,
                kind: request.kind,
                poles: [],
                roboports: [],
                previewEntities: [],
                animationStats: {
                    deciderCombinatorCount: 0,
                    arithmeticCombinatorCount: 0,
                    constantCombinatorCount: 0,
                    displayPanelCount: 0,
                    controllerPoleCount: 0,
                    controllerRoboportCount: 0,
                    relayPoleCount: 0,
                    programmableSpeakerCount: 0,
                },
                previewBounds: null,
            });
            return;
        }
        if (maxX === -1) {
            minX = 0;
            minY = 0;
            maxX = 0;
            maxY = 0;
        }

        const poles = request.autoPole
            ? request.smartPlacement
                ? calculateSmartPoles(request.poleType, request.qualityIdx, minX, minY, maxX, maxY, layoutGrid, request.width, request.height)
                : calculateActivePoles(request.poleType, request.qualityIdx, minX, minY, maxX, maxY, layoutGrid, request.width, request.height)
            : [];
        const roboports = request.autoPole && request.autoRoboport
            ? calculateActiveRoboports(
                poles,
                request.poleType,
                request.qualityIdx,
                layoutGrid,
                request.width,
                request.height,
                Boolean(request.autoConstruction),
            )
            : [];
        const replacedPoleIndices = new Set(roboports.flatMap(roboport => roboport.replacedPoleIndices));
        const effectivePoles = poles.filter((_, index) => !replacedPoleIndices.has(index));
        const preview = playbackAnimation
            ? calculateMediaAnimationPreviewLayout(
                playbackAnimation,
                request.width,
                request.height,
                effectivePoles,
                roboports,
                request.poleType,
                Boolean(request.includeAnimationHelp),
                request.animationControllerSide ?? 'top',
                Boolean(request.autoRoboport && request.autoConstruction),
                request.audioTrack,
                request.audioInstruments,
            )
            : request.animationEnabled && secondFrame
            ? calculateAnimationPreviewLayout(
                grid,
                secondFrame,
                request.width,
                request.height,
                effectivePoles,
                roboports,
                request.poleType,
                Boolean(request.includeAnimationHelp),
                request.animationControllerSide ?? 'top',
            )
            : {
                entities: [],
                stats: {
                    deciderCombinatorCount: 0,
                    arithmeticCombinatorCount: 0,
                    constantCombinatorCount: 0,
                    displayPanelCount: 0,
                    controllerPoleCount: 0,
                    controllerRoboportCount: 0,
                    relayPoleCount: 0,
                    programmableSpeakerCount: 0,
                },
                bounds: null,
            };
        context.postMessage({
            id: request.id,
            kind: request.kind,
            poles,
            roboports,
            previewEntities: preview.entities,
            animationStats: preview.stats,
            previewBounds: preview.bounds,
        });
    } catch (error) {
        context.postMessage({
            id: request.id,
            kind: request.kind,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

export {};
