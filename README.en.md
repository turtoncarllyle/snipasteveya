# SnipasteVeya

[简体中文](README.md) | English

SnipasteVeya is a focused screenshot, pinned-image and OCR utility for Windows 10/11 x64. It stays in the system tray and keeps the first release centered on **F1 screenshot**, **F3 pin** and **OCR**.

## Core experience

- **F1 screenshot**: hide Settings, then freeze the display under the pointer in a separate capture window. Click to select a detected window or drag a region; use eight resize handles, a pixel magnifier and arrow-key adjustments. The compact toolbar follows the selection and avoids edges. Enter or double-click copies; Esc cancels. Right-click leaves annotation mode, then resets the selection.
- **Capture toolbar**: rectangle/ellipse, arrow, pen, highlighter, mosaic, text, eraser (remove annotations), undo/redo, OCR, cancel, pin, save and copy. Color and width options appear only when an annotation tool is selected. Copy, pin, save and OCR all receive the annotated image.
- **F3 pin**: each image has its own borderless, topmost desktop window. Drag to move, scroll to zoom around the pointer, and middle-click or press Ctrl+0 to reset size. Esc or double-click closes only that pin. Its context menu offers copy, save, OCR and hide all. Shift+F3 restores existing pins without reading the clipboard again.
- **OCR**: local PP-OCRv5 mobile supports mixed Chinese and English and reuses loaded models. Edit and copy results in a separate window, or select another engine and retry. Errors preserve the image and existing text. Cloud cancellation aborts the client request; local cancellation stops waiting immediately, discards the current native ONNX inference when it finishes, and skips cancelled queued work.
- **AI OCR**: a DeepSeek preset and multiple saved OpenAI-compatible providers, each with its own credential. Select an actual model that supports image input; presets do not guarantee model capabilities. Images are sent only when you explicitly use cloud OCR. Changing the dropdown alone does not send an image.
- **Start with Windows**: the switch updates only after successful per-user startup registration, with rollback on failure. Login starts in the tray; quitting does not remove the setting. Shortcuts are editable; new conflicts retain previous bindings, while existing conflicts do not block unrelated settings.
- **Language and theme**: Simplified Chinese/English plus system, light and dark themes.
- **Simple settings**: general preferences save automatically; recording a shortcut suppresses capture/pin actions. Cloud providers use separate drafts that remain available when Settings is hidden. Save a completed provider explicitly without affecting unrelated preferences. OCR can open the relevant provider configuration directly.

The capture toolbar groups annotation, editing, image actions and completion, with Copy as the primary action. Hover or keyboard focus reveals action hints. OCR emphasizes editable text and Copy text, with one area for progress, cancellation and errors.

Accounts, subscriptions, history management, translation, summaries and a complex dashboard remain outside the scope. Closing Settings keeps the app in the tray. Version 0.1.1 reworks desktop capture, independent pins and the OCR result window.

Tool shortcuts: `Ctrl+1…7` selects annotation tools, `Ctrl+Z` undoes, `Ctrl+Y` / `Ctrl+Shift+Z` redoes, `Ctrl+S` saves and `Ctrl+C` copies. While entering text, Enter adds a line, `Ctrl+Enter` commits and Esc discards the current text.

Selection shortcuts: arrows move by one source pixel; `Ctrl+arrows` expands and `Shift+arrows` shrinks. `Ctrl+A` selects the display, `R` restores the last region, and `Ctrl+T` pins directly. Hold Alt for the magnifier and press C to copy the center pixel's HEX color.

## Installation and downloads

Download from [Releases](https://github.com/turtoncarllyle/snipasteveya/releases):

- `SnipasteVeya-0.1.1-win-x64-setup.exe`: per-user NSIS installer.
- `SnipasteVeya-0.1.1-win-x64-portable.zip`: extract the entire archive and run `SnipasteVeya.exe`.
- `SHA256SUMS.txt`: SHA-256 values for both packages.

Both packages target Windows 10/11 x64 and include PP-OCRv5 mobile models, fixed WebView2 154.0.4258.37, DirectML and the Visual C++ runtime. End users do not need Rust, Node.js, Python or separate model/runtime downloads. Keep the DLLs, `resources` and `WebView2` folders next to the portable executable. Downloads from the private repository require GitHub access.

## Development

- Rust stable (MSVC)
- Node.js 22+
- Windows 10/11 SDK and MSVC C++ toolchain
- x64 Visual C++ runtime 14.51.36247.0 or later on the build host; packaging copies these DLLs into the release

```powershell
npm ci
npm run typecheck
npm run test:capture
npm run test:settings
npm run build

# Rust checks and tests
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-windows-runtime.ps1
cd src-tauri
cargo check
cargo test
cd ..

# Windows installer
npm run tauri build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-portable.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-release.ps1
```

Local OCR reads bundled files from `src-tauri/resources/ocr/` without downloading models during recognition. Missing models produce an explicit error. Run the real model fixture with `cargo test --manifest-path src-tauri/Cargo.toml bundled_models -- --ignored --nocapture`.

The pre-build script downloads and verifies the pinned WebView2 CAB, extracts it, and collects the build host's x64 Visual C++ DLLs. Downloads occur only during development and packaging. The pre-bundle script adds DirectML to the installer resources. Downloaded and extracted runtimes are not committed to Git; release assets are written to `artifacts/build/v0.1.1/`.

## Structure

```text
src/                 React + TypeScript UI and shortcut interaction
src-tauri/src/       capture, clipboard, tray, settings, OCR and AI provider
src-tauri/resources/ bundled OCR models for releases
scripts/              packaging and release verification scripts
tests/                release contracts and helper tests
```

## Privacy and cloud OCR

Local captures stay in memory until the user saves one. Cloud OCR is never called in the background; API keys are stored through Windows Credential Manager, while ordinary settings are UTF-8 JSON in the current user's configuration directory. DeepSeek and other providers are called by the Rust backend with Chat Completions image messages.

## Verification scope

The repository records TypeScript checks, Vite builds, Rust checks/tests, Windows x64 packaging and asset checksums. Real DeepSeek requests, multi-monitor/DPI combinations, and install/upgrade/uninstall behavior on both Windows 10 and Windows 11 require testing on those systems; release notes distinguish untested scenarios clearly.

Window snapping currently detects top-level windows, not individual UI controls or selections spanning displays. See the latest [UI verification record](docs/verification-ui-2026-10-10.md) and the earlier [desktop interaction verification](docs/verification-2026-10-09.md).

See the [v0.1.1 release record](docs/release-v0.1.1.md) for this release's changes and verification scope.

## License

MIT
