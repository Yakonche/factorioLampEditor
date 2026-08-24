# Factorio Lamp Editor

[Français](README-FR.md)

Factorio Lamp Editor turns pixel art, drawings, text, images, slideshows, GIFs, videos, and approximate musical-note sequences into Factorio 2.x blueprint strings.

This repository is an extended desktop-oriented fork of the original [Factorio Lamp Editor web application](https://factorio-lamp-editor.vercel.app/) and its [source repository](https://github.com/jojkos/factorioLampEditor). It is an independent community project and is not affiliated with or endorsed by Wube Software.

> [!IMPORTANT]
> Licensing decision: the upstream repository does not publish a software license, so this fork intentionally remains unlicensed under default copyright rules. The links above provide source attribution but do not imply an open-source reuse grant. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## What it does

The editor represents every visible pixel with a Factorio lamp, then builds the circuit-network entities needed to reproduce a static picture or timed animation. The generated blueprint string can be copied and imported directly in Factorio 2.x.

### Editing and layout

- Draw on the grid, erase cells, import a static image, or reset the complete canvas.
- Create text stamps with global size, color, font, imported TTF/OTF fonts, and static emoji. Selected text can be bold, italic, or underlined, and the text field includes a complete context menu. Genuine animated emoji are created from the separate official Noto catalog. Every emoji style displays a conservative minimum lamp-grid size for retaining its fine details.
- Choose consistently rendered bundled fonts, the complete system-font inventory exposed by the desktop OS, or imported TTF/OTF files. Imported fonts use their internal OpenType full name instead of their file name. Every source remains split into monospaced and proportional groups, every menu entry previews its own typeface, and a conservative full-fidelity raster estimate is shown as `(X px)`.
- Search and filter the complete static Unicode RGI emoji catalog, including supported skin-tone variants. Choose OS-native Apple or Segoe, bundled Noto Color Emoji or Toss Face, or downloadable Twemoji 17, OpenMoji 17, Blobmoji, and Microsoft Fluent Flat, Color, or 3D artwork.
- Browse all 881 genuine animations in the official Google Noto Animated Emoji catalog. Visible previews use the real animated artwork; selecting one downloads the CC BY 4.0 asset on demand and converts its real frames into a placeable Factorio stamp at the chosen global size. Multiple animated stamps keep their independent loops and controller data instead of replacing one another. The former editor-made curated glyph sequences have been removed; Twemoji has no official animated catalog.
- Limit a text display horizontally or vertically and scroll it right-to-left, left-to-right, top-to-bottom, or bottom-to-top while keeping a one-cell empty border.
- Switch the complete interface between English and French with the flag buttons; Factorio item names remain in English.
- Give a text stamp a bounded display area. Oversized text becomes a scrolling animation and keeps a one-cell empty margin.
- Resize the tool sidebar by dragging its right edge; double-click the handle to restore its default width.
- Add stone brick, concrete, hazard concrete, refined concrete, or refined hazard concrete one full tile beyond the lamp artwork.
- Choose whether animation combinators are placed above, below, left, or right of the display. Above is the default.
- Auto-place power poles is enabled by default. The optional in-game timing/help display is disabled by default.

### Images and animation

- Import several images as a slideshow. Imported frames appear in a dedicated tray at the bottom instead of the sidebar.
- Set all slideshow frame durations at once, then override individual frames; the global value can overwrite every duration again.
- Import GIF, APNG, static or animated WebP, transparent WebM, ordinary FFmpeg-readable video, and Telegram TGS/Lottie animations. GIF timing in non-standard or legacy layouts is repaired when possible.
- Import FFmpeg-readable video formats in the desktop application.
- Resize animated media while preserving aspect ratio and transparency. If the selected definition or the 30 FPS Factorio limit requires conversion, the app shows the exact before/after values and asks for confirmation first.
- Set FPS, frame limit, media dimensions, full-color/grayscale/monochrome conversion, and insignificant-color-delta filtering.
- Inspect and remove decoded frames manually when the configured frame limit is exceeded, or use even automatic selection.
- Link an audio track to a GIF or video so both use the same 60-tick-per-second counter and start together.
- Play scrolling text, animated emoji, slideshows, GIFs, and videos directly on the editor canvas with their exact per-frame Factorio timing. The preview can be paused and scrubbed frame by frame.
- Pan the grid continuously with the arrow keys or the physical WASD/ZQSD key cluster. Chromium's keyboard layout map supplies the labels automatically when the operating system exposes it.
- Watch real blueprint-generation progress, including the current percentage, during long exports.
- Copy ordinary blueprints directly. For exceptionally large exports such as full-fidelity Bad Apple, the desktop app avoids a costly clipboard read-back and offers a **Save Blueprint** file fallback without regenerating.

### Blueprint-size optimizations

- Pixels that never change are exported as ordinary Always ON lamps.
- Duplicate frames are merged.
- Animation data stores sparse pixel changes instead of complete frames.
- Empty transitions do not receive useless decider combinators.
- Note events for both speakers are packed into the same sampled instant where possible.

Long, full-definition, full-FPS animation blueprints can still be enormous. Generation runs outside the UI thread, so the interface remains responsive and reports real progress through entity creation, JSON serialization, compression, and Base64 encoding.

The cyan controller footprints shown around an animation are a blueprint infrastructure preview. They represent the combinators, controller substations, circuit relays, speakers, and optional display that will be included in the newly generated blueprint. Up to 100,000 controller/audio footprints can be sampled; a spatial index draws only those inside the visible viewport. If Windows rejects a very large clipboard transfer, the old clipboard is cleared and the same generated string can immediately be saved to a text file.

## Desktop and browser capabilities

| Capability | Browser development build | Windows/Linux desktop build |
| --- | :---: | :---: |
| Drawing, text, fonts, emoji, static images | Yes | Yes |
| Multi-image slideshows | Yes | Yes |
| GIF, video, and audio decoding | No | Yes |
| Portable executable | No | Yes |

The desktop application bundles FFmpeg for local media decoding. Media stays on the machine; no upload service is required.

## Using the editor

1. Start the portable Windows executable, Linux AppImage, or development server.
2. Draw on the grid, use **Stamps**, or import one or more media files.
3. For animations, review dimensions, FPS, frame selection, color mode, and timing.
4. Optionally link an audio file. The editor converts its dominant pitches to native programmable-speaker notes; it cannot preserve the original waveform.
5. Configure tiles, power, roboports, help display, and controller placement.
6. Select **Generate blueprint**, wait for 100%, then copy the resulting string.
7. In Factorio, open the blueprint import dialog, paste the string, and confirm.

### Emoji cache

Downloaded Twemoji, OpenMoji, Blobmoji, Microsoft Fluent artwork and selected Google Noto animations are stored under `emoji-cache` in Electron's persistent user-data directory. After an asset has been used once, it can be loaded again without an internet connection. Noto Color Emoji and Toss Face are bundled and need no first download. The browser development build uses the browser Cache Storage API for the same purpose. Deleting the cache is safe; missing assets are downloaded again the next time they are used.

### Color delta

**Ignore color delta <= N** suppresses small RGB changes between consecutive frames. At `0`, every detected color change is retained. Higher values treat near-identical colors as unchanged, which can remove compression noise and reduce the number of animation instructions and combinators. Excessive values may erase subtle shading or motion. Monochrome sources normally need little or no color-delta filtering.

### Audio limitations

Vanilla Factorio blueprints cannot contain an MP3, a stereo waveform, or arbitrary sampled audio. The desktop editor instead analyzes each channel and approximates its dominant pitch with Factorio's native programmable-speaker instruments. Stereo input can produce two speakers with two different note sequences, but not the two original waveforms.

Sampling accepts 1 to 60 notes per second because Factorio updates at 60 ticks per second. Higher rates improve temporal detail but increase blueprint size sharply; 4 to 8 notes per second is a practical starting range. **Auto** chooses a native instrument range that clips as few detected notes as possible, while manual instrument selection is available when a particular timbre is preferred.

## Requirements

- Node.js 22.12 or newer
- npm
- Windows x64 for the Windows portable executable, or Linux x64 for the AppImage
- Factorio 2.x to import the generated blueprint

## Development

Install the exact dependency versions recorded in the lockfile:

```sh
npm ci
```

Run the browser development build:

```sh
npm run dev
```

Run the Electron desktop application from a production build:

```sh
npm run desktop:dev
```

Quality checks that do not need local media fixtures:

```sh
npm run lint
npm run build
npm run test:ci
```

Additional decoder checks use media files stored locally in the ignored `release/` directory:

```sh
npm run test:media-decoder
npm run test:morning
```

## Building the Windows portable application

```sh
npm ci
npm run desktop:portable
```

The Windows output is `release/Factorio Lamp Editor-1.6.0-win-x64-portable.exe`. The `dist/`, `release/`, `release-build-*/`, and `node_modules/` directories are intentionally ignored because they are generated or machine-local. Do not commit test media, generated blueprints, unpacked Electron applications, or portable binaries to the source repository; publish binaries as GitHub Release assets instead.

## Building the Linux portable application

On Linux x64:

```sh
npm ci
npm run desktop:linux
```

This produces an AppImage and a `tar.gz` portable directory archive. From Windows with WSL2 Debian available, `wsl.exe -- bash scripts/build-linux-wsl.sh` performs an isolated Linux build without replacing the Windows `node_modules` tree. The AppImage uses Electron Builder's pinned static runtime toolset `1.0.3` (AppImage runtime `20251108`), so current FUSE 3 systems no longer need the legacy `libfuse.so.2`/`libfuse2` package. A working `/dev/fuse` device and `fusermount3` are still required for mounting; the `tar.gz` archive remains the FUSE-independent fallback.

## Project structure

```text
electron/          Electron main process, IPC bridge, and FFmpeg integration
public/            Static assets and application icons
scripts/           Blueprint and media validation scripts
src/components/    React editor controls, grid, panels, and frame trays
src/utils/         Blueprint, media, audio, text-stamp, and grid logic
src/workers/       Background blueprint/image processing workers
```

Vite builds the React renderer into `dist/`. Electron loads that renderer, exposes a deliberately small preload API, and performs file/media work in the main process. Blueprint creation and costly image processing use Web Workers so long operations do not block interaction.

More detail is available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Please report vulnerabilities according to [SECURITY.md](SECURITY.md), without publishing exploit details first.

## License and trademarks

This fork intentionally has no open-source license because the upstream project did not provide one. Default copyright rules apply. The [LICENSE](LICENSE) file records this decision and the upstream attribution; dependencies and bundled assets retain their separate licenses, summarized in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Factorio is a trademark of Wube Software Ltd. This community project is not affiliated with Wube Software.
