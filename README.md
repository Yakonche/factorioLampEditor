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
- Create text stamps with global defaults and per-character size, color, and font overrides.
- Choose built-in fonts from separate monospaced (equal-width) and proportional (variable-width) groups, and import local TTF or OTF fonts; imported fonts are classified automatically.
- Search and filter the complete Unicode RGI emoji catalog, including supported skin-tone variants. Every catalog emoji can also become a Factorio animation, alongside the curated animated presets.
- Switch the complete interface between English and French with the flag buttons; Factorio item names remain in English.
- Give a text stamp a bounded display area. Oversized text becomes a scrolling animation and keeps a one-cell empty margin.
- Resize the tool sidebar by dragging its right edge; double-click the handle to restore its default width.
- Add stone brick, concrete, hazard concrete, refined concrete, or refined hazard concrete one full tile beyond the lamp artwork.
- Choose whether animation combinators are placed above, below, left, or right of the display. Above is the default.
- Auto-place power poles is enabled by default. The optional in-game timing/help display is disabled by default.

### Images and animation

- Import several images as a slideshow. Imported frames appear in a dedicated tray at the bottom instead of the sidebar.
- Set all slideshow frame durations at once, then override individual frames; the global value can overwrite every duration again.
- Import all GIF frames, including GIFs whose timing metadata is stored in non-standard or legacy layouts.
- Import FFmpeg-readable video formats in the desktop application.
- Resize GIFs and videos while preserving their aspect ratio.
- Set FPS, frame limit, media dimensions, full-color/grayscale/monochrome conversion, and insignificant-color-delta filtering.
- Inspect and remove decoded frames manually when the configured frame limit is exceeded, or use even automatic selection.
- Link an audio track to a GIF or video so both use the same 60-tick-per-second counter and start together.
- Watch real blueprint-generation progress, including the current percentage, during long exports.
- Copy ordinary blueprints directly. For exceptionally large exports such as full-fidelity Bad Apple, the desktop app avoids a costly clipboard read-back and offers a **Save Blueprint** file fallback without regenerating.

### Blueprint-size optimizations

- Pixels that never change are exported as ordinary Always ON lamps.
- Duplicate frames are merged.
- Animation data stores sparse pixel changes instead of complete frames.
- Empty transitions do not receive useless decider combinators.
- Note events for both speakers are packed into the same sampled instant where possible.

Long, full-definition, full-FPS animation blueprints can still be enormous. Generation runs outside the UI thread, so the interface remains responsive and reports real progress through entity creation, JSON serialization, compression, and Base64 encoding.

The cyan controller footprints shown around an animation are a blueprint infrastructure preview. They represent the combinators, controller substations, circuit relays, speakers, and optional display that will be included in the newly generated blueprint. If Windows rejects a very large clipboard transfer, the old clipboard is cleared and the same generated string can immediately be saved to a text file.

## Desktop and browser capabilities

| Capability | Browser development build | Windows desktop build |
| --- | :---: | :---: |
| Drawing, text, fonts, emoji, static images | Yes | Yes |
| Multi-image slideshows | Yes | Yes |
| GIF, video, and audio decoding | No | Yes |
| Portable executable | No | Yes |

The desktop application bundles FFmpeg for local media decoding. Media stays on the machine; no upload service is required.

## Using the editor

1. Start the portable Windows executable, or run the development server.
2. Draw on the grid, use **Stamps**, or import one or more media files.
3. For animations, review dimensions, FPS, frame selection, color mode, and timing.
4. Optionally link an audio file. The editor converts its dominant pitches to native programmable-speaker notes; it cannot preserve the original waveform.
5. Configure tiles, power, roboports, help display, and controller placement.
6. Select **Generate blueprint**, wait for 100%, then copy the resulting string.
7. In Factorio, open the blueprint import dialog, paste the string, and confirm.

### Color delta

**Ignore color delta <= N** suppresses small RGB changes between consecutive frames. At `0`, every detected color change is retained. Higher values treat near-identical colors as unchanged, which can remove compression noise and reduce the number of animation instructions and combinators. Excessive values may erase subtle shading or motion. Monochrome sources normally need little or no color-delta filtering.

### Audio limitations

Vanilla Factorio blueprints cannot contain an MP3, a stereo waveform, or arbitrary sampled audio. The desktop editor instead analyzes each channel and approximates its dominant pitch with Factorio's native programmable-speaker instruments. Stereo input can produce two speakers with two different note sequences, but not the two original waveforms.

Sampling accepts 1 to 60 notes per second because Factorio updates at 60 ticks per second. Higher rates improve temporal detail but increase blueprint size sharply; 4 to 8 notes per second is a practical starting range. **Auto** chooses a native instrument range that clips as few detected notes as possible, while manual instrument selection is available when a particular timbre is preferred.

## Requirements

- Node.js 20.19 or newer (Node.js 22.12 or newer is also supported by the build tools)
- npm
- Windows x64 to produce and run the configured portable desktop target
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

The output for this version is `release/Factorio Lamp Editor-1.2.0-win-x64-portable.exe`. The `dist/`, `release/`, `release-build-*/`, and `node_modules/` directories are intentionally ignored because they are generated or machine-local. Do not commit test media, generated blueprints, unpacked Electron applications, or portable binaries to the source repository; publish binaries as GitHub Release assets instead.

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
