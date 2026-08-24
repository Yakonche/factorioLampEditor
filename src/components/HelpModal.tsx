import React from 'react';
import { detectKeyboardPanLabels } from '../utils/keyboardNavigation';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [panKeys, setPanKeys] = React.useState('W/Z · A/Q · S · D');

    React.useEffect(() => {
        let active = true;
        void detectKeyboardPanLabels().then(labels => {
            if (active) setPanKeys(`${labels.up} · ${labels.left} · ${labels.down} · ${labels.right}`);
        });
        return () => { active = false; };
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-600 bg-gray-800 p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
                <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-white" aria-label="Close help">
                    <i className="fa-solid fa-xmark"></i>
                </button>

                <div className="space-y-6 text-sm text-gray-300">
                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">Navigation</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div className="flex justify-between"><span>Pan canvas</span><span className="rounded bg-gray-700 px-1.5 text-xs text-white">Right-click drag</span></div>
                            <div className="flex justify-between"><span>Keyboard pan</span><span className="rounded bg-gray-700 px-1.5 font-mono text-xs text-white">{panKeys} / arrows</span></div>
                            <div className="flex justify-between"><span>Zoom</span><span className="rounded bg-gray-700 px-1.5 text-xs text-white">Scroll</span></div>
                            <div className="flex justify-between"><span>Pan tool</span><span className="rounded bg-gray-700 px-1.5 font-mono text-xs text-yellow-500">H</span></div>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">Drawing and stamping</h3>
                        <ul className="list-inside list-disc space-y-2 pl-1 text-xs text-gray-400">
                            <li>Brush, fill, erase, and pan use the B, F, E, and H shortcuts.</li>
                            <li>Imported images are centered automatically. Width and height can be edited while the link button controls proportions.</li>
                            <li>Text stamps support global size, font, and color settings, imported TTF/OTF fonts, and bold/italic/underline formatting for selected text.</li>
                            <li>The complete Unicode RGI emoji catalog is built in, including categories, search, skin tones, and an animation mode for every emoji. Emoji animation keeps a stable 5 FPS cadence independently of scrolling.</li>
                            <li>Limited display zones keep a one-cell border and scroll in any of four horizontal or vertical directions when needed.</li>
                            <li>Press <strong>Ctrl+Enter</strong> to create a text stamp, then click the grid to place it.</li>
                            <li>The mouse wheel zooms the canvas; <strong>+/-</strong> resize text stamps.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">Multi-image slideshow</h3>
                        <ul className="list-inside list-disc space-y-2 pl-1 text-xs text-gray-400">
                            <li>Enable the slideshow and add any number of images. Only imported images become frames; no empty Canvas frame is inserted.</li>
                            <li>Set every duration at once in the toolbar, then override individual frames in the horizontal tray below the canvas. Applying the global value again overwrites all overrides.</li>
                            <li>Click a bottom-tray thumbnail to preview it. Added images stay centered on the current canvas.</li>
                            <li>The controller can be placed on any side and defaults to above the artwork. Pole and roboport placement covers the union of every frame.</li>
                            <li>Pixels that never change use Always ON lamps and no animation combinator; only changing pixels are stored in delta ROMs.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">GIF / video animation</h3>
                        <ul className="list-inside list-disc space-y-2 pl-1 text-xs text-gray-400">
                            <li>FFmpeg preserves the source ratio. Width or height can be edited after import and the other dimension follows automatically.</li>
                            <li>The FPS limit is capped at 30 FPS. Set definition, FPS, color mode, and frame limit directly for long clips such as Bad Apple.</li>
                            <li><strong>Ignore color delta</strong> compares each RGB channel with the preceding frame. 0 preserves every change; higher values reuse the previous color for small variations, reducing flicker and decider ROMs while sacrificing subtle detail. Lit/unlit changes are never ignored.</li>
                            <li>Grayscale and monochrome thresholding also reduce noisy transitions. Sparse per-line ROM packing removes deciders for lines that do not change, without changing definition or FPS.</li>
                            <li>Legacy multi-image GIFs with missing timing blocks are repaired before decoding.</li>
                            <li>If decoding exceeds the shared frame limit (256 by default), the bottom tray shows every frame. Select removals or let the app choose evenly spaced frames.</li>
                            <li>Consecutive duplicates are merged. The blueprint stores a base image and ordered frame differences.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">Output settings</h3>
                        <ul className="list-inside list-disc space-y-2 pl-1 text-xs text-gray-400">
                            <li><strong>Maximum definition</strong> applies to static images, slideshows, GIFs, and videos.</li>
                            <li><strong>Maximum animation frames</strong> is shared by slideshows and media and can be raised for intentionally large blueprints.</li>
                            <li><strong>Blueprint background</strong> fills the artwork and extends one complete tile beyond every edge.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">Audio and programmable speakers</h3>
                        <ul className="list-inside list-disc space-y-2 pl-1 text-xs text-gray-400">
                            <li>Import MP3, WAV, FLAC, OGG, or another FFmpeg-readable audio file. The app detects one dominant pitch per left/right channel.</li>
                            <li>One decider stores both channel pitches for each sampled instant; two programmable speakers play the approximate sequences.</li>
                            <li>The sampling rate accepts 1–60 notes/s because Factorio runs at 60 ticks/s. 4–8 is recommended; high values produce much larger, denser, and often less musical blueprints.</li>
                            <li>Choose a native instrument independently for each speaker, or use Auto to minimize notes clipped outside its range. Piano has 48 notes (F3–E7); the other melodic instruments have 36-note ranges.</li>
                            <li>After importing an animation and audio, click <strong>Link audio to animation</strong>. Linked playback shares the same tick counter and starts at T = 0; the animation defines the combined loop. Audio-only blueprints use the complete audio duration.</li>
                            <li>The original waveforms cannot be embedded in a vanilla blueprint, so this is a musical approximation rather than faithful MP3 or stereo playback.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-gray-100">Exporting</h3>
                        <p className="text-xs text-gray-400">Click <strong>Copy Blueprint</strong> to generate and copy a Factorio 2.x blueprint string. The status bar reports the real generation percentage, including serialization and compression. Auto-place poles provides power; roboports and auto-construction add build coverage and a connected logistic backbone.</p>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <button onClick={onClose} className="rounded-lg bg-yellow-600 px-6 py-2 font-bold text-white transition-colors hover:bg-yellow-500">Got it!</button>
                </div>
            </div>
        </div>
    );
};
