# Third-party notices

This project uses third-party packages and assets that remain subject to their own terms. The dependency lockfile is the authoritative inventory for the exact installed versions.

## Runtime and build dependencies

- [React](https://github.com/facebook/react) and React DOM — MIT License.
- [pako](https://github.com/nodeca/pako) — MIT License.
- [lottie-web](https://github.com/airbnb/lottie-web) — MIT License; used to render Telegram TGS/Lottie animations locally.
- [Electron](https://github.com/electron/electron) — MIT License; packaged applications also contain Chromium and other components covered by Electron’s bundled notices.
- [Vite](https://github.com/vitejs/vite), TypeScript, ESLint, Tailwind CSS, PostCSS, Autoprefixer, electron-builder, and related development packages — see each installed package’s license file and metadata.

## Fonts and icons

- [Noto Sans Japanese](https://github.com/notofonts/noto-cjk) through `@fontsource/noto-sans-jp` — SIL Open Font License 1.1.
- [Noto Color Emoji](https://github.com/googlefonts/noto-emoji) revision `8998f5dd683424a73e2314a8c1f1e359c19e8742` — SIL Open Font License 1.1. This is the cross-platform bundled emoji renderer.
- [Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/) by Google — CC BY 4.0. The application includes the official 881-entry catalog, previews and downloads animation assets from Google on demand, and converts selected artwork into Factorio lamp frames. The animation files themselves are not bundled. Attribution is also distributed in `public/licenses/Noto-Animated-Emoji-CC-BY-4.0.txt`.
- [Twemoji](https://github.com/jdecked/twemoji) 17.0.3 — static graphics under CC BY 4.0. The application downloads selected PNG artwork on demand, stores it in the persistent emoji cache, and converts it into Factorio lamp pixels. Twemoji does not provide the animated catalog used by the application. Attribution is also distributed in `public/licenses/Twemoji-CC-BY-4.0.txt`.
- [OpenMoji](https://github.com/hfg-gmuend/openmoji) 17.0 — color SVG artwork under CC BY-SA 4.0, downloaded on demand and cached persistently. The license text is distributed in `public/licenses/OpenMoji-CC-BY-SA-4.0.txt`.
- [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) revision `62ecdc0d7ca5c6df32148c169556bc8d3782fca4` — Flat, Color, and 3D artwork under the MIT License, downloaded on demand and cached persistently. The license text is distributed in `public/licenses/Microsoft-Fluent-Emoji-MIT.txt`.
- [Blobmoji](https://github.com/C1710/blobmoji) revision `7dd14d2b0141693485fd26bc35817bd290352a79` — SVG artwork under Apache License 2.0, downloaded on demand and cached persistently. The license text is distributed in `public/licenses/Blobmoji-LICENSE.txt`.
- [Toss Face](https://github.com/toss/tossface) revision `37720aa5cf2ec9a853a9787f29e39002c58cc2e7` — the original unmodified web font is bundled under the upstream Toss Face license distributed in `public/licenses/Tossface-LICENSE.txt`.
- Iceberg, Jersey 10, MedievalSharp, Quantico, and Space Grotesk are bundled under the SIL Open Font License 1.1. Their original `OFL.txt` files are distributed in `public/licenses/fonts/` and beside the packaged desktop resources.
- [Font Awesome Free](https://fontawesome.com/license/free) — icons under CC BY 4.0, fonts under SIL OFL 1.1, and code under MIT, according to the upstream license terms.
- Segoe UI Emoji and Apple Color Emoji are referenced only as operating-system fonts. Their files and glyph artwork are not redistributed by this repository; those style choices are enabled only on the platforms that provide them.

## FFmpeg

The Windows desktop package obtains an FFmpeg executable through [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static). The packaged binary’s GPLv3 license text and build/source information are copied beside it by the Electron build configuration. Distributors must review and satisfy the terms applicable to the exact FFmpeg build they ship, including source-offer or corresponding-source requirements where applicable.

## Factorio

Factorio, its entity names, signals, graphics, and related trademarks are property of Wube Software Ltd. The generated blueprint format is used for interoperability. This project is not affiliated with or endorsed by Wube Software.

## Upstream application

This repository derives from [`jojkos/factorioLampEditor`](https://github.com/jojkos/factorioLampEditor). No license file was published by that repository when this notice was prepared. See [LICENSE](LICENSE) for the resulting restriction on the application source.

If a required notice is missing, please report it before distributing a binary or source archive.
