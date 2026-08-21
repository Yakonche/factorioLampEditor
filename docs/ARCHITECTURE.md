# Architecture

## Execution model

Factorio Lamp Editor has two layers:

1. A React renderer built by Vite. It owns the grid, editing state, import controls, frame trays, preview, and export UI.
2. An optional Electron host. It supplies native file dialogs and FFmpeg-backed GIF, video, and audio decoding through a restricted preload API.

The browser development build supports drawing, text, static images, and multi-image slideshows. Native media decoding is deliberately desktop-only because browsers cannot use the bundled FFmpeg executable directly.

## Data flow

```text
draw / stamp / image / media
              |
              v
       normalized pixel frames
              |
              v
  frame timing + audio note events
              |
              v
 background blueprint generation
              |
              v
 entities -> JSON -> zlib -> Base64
              |
              v
      Factorio blueprint string
```

Static and animated sources are normalized into a shared grid/frame representation. Animation timing is expressed in Factorio ticks. The blueprint generator divides data into controller, lamp, transition-ROM, optional speaker, power, roboport, tile, and help-display entities.

## Important directories

- `src/components/` contains UI panels and canvas/frame-tray presentation.
- `src/utils/grid.ts` and `src/utils/stamp.ts` handle editable cell data and rasterized text.
- `src/utils/mediaAnimation.ts` normalizes decoded animation frames and timing.
- `src/utils/audio.ts` maps analyzed pitches to native speaker note events.
- `src/utils/blueprint.ts` builds Factorio entities and encodes the blueprint.
- `src/workers/` keeps expensive image and blueprint operations off the UI thread.
- `electron/` owns desktop startup, preload isolation, file access, and FFmpeg processes.
- `scripts/` contains deterministic validation programs used by npm scripts and CI.

## Blueprint strategy

The generator treats unchanged lamps and animated lamps differently. A lamp whose state never changes is connected as Always ON. Animated data records sparse transitions, so only pixels that change at a boundary consume transition instructions. Consecutive duplicate frames are merged and timing is preserved. The configured controller side affects the physical routing and can affect entity count for wide or tall media.

Audio is not embedded. FFmpeg provides decoded channel samples; analysis selects dominant pitches at a configurable rate; those pitches are mapped to native Factorio instruments and notes. When audio is linked to animation, both systems use the same tick counter.

## Security boundaries

The renderer does not receive unrestricted Node.js access. Native functions are exposed through the Electron preload bridge. Media decoding receives user-selected paths, writes temporary decoded data, and should validate limits before allocating large frame buffers. Any new IPC method should be narrow, typed in `src/electron.d.ts`, and avoid exposing arbitrary command execution.

## Generated directories

`dist/`, `release/`, `release-build-*/`, and `node_modules/` are reproducible or local artifacts and are ignored. Only source, lockfiles, documentation, small application assets, and validation scripts belong in Git.
