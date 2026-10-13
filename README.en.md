# SnipasteVeya

[简体中文](README.md) | English

SnipasteVeya is a focused screenshot, pinned-image and OCR utility for Windows 10/11 x64 and macOS 13.3+ (Intel and Apple Silicon). It stays in the system tray or menu bar and keeps the first release centered on **F1 screenshot**, **F3 pin** and **OCR**.

## Core experience

- **F1 screenshot**: hide Settings, then freeze the display under the pointer in a separate capture window. Click to select a detected window or drag a region; use eight resize handles, a pixel magnifier and arrow-key adjustments. The compact toolbar follows the selection and avoids edges. Enter or double-click copies; Esc cancels. Right-click leaves annotation mode, then resets the selection.
- **Capture toolbar**: rectangle/ellipse, arrow, pen, highlighter, mosaic, text, eraser (remove annotations), undo/redo, OCR, cancel, pin, save and copy. Color and width options appear only when an annotation tool is selected. Copy, pin, save and OCR all receive the annotated image.
- **F3 pin**: each image has its own borderless, topmost desktop window. Drag to move, scroll to zoom around the pointer, and middle-click or press Ctrl+0 to reset size. Esc or double-click closes only that pin. Its context menu offers copy, save, OCR and hide all. Shift+F3 restores existing pins without reading the clipboard again.
- **OCR**: local PP-OCRv5 mobile supports mixed Chinese and English and reuses loaded models. Edit and copy results in a separate window, or select another engine and retry. Errors preserve the image and existing text. Cloud cancellation aborts the client request; local cancellation stops waiting immediately, discards the current native ONNX inference when it finishes, and skips cancelled queued work.
- **AI OCR**: a DeepSeek preset and multiple saved OpenAI-compatible providers, each with its own credential. Select an actual model that supports image input; presets do not guarantee model capabilities. Images are sent only when you explicitly use cloud OCR. Changing the dropdown alone does not send an image.
- **Start at login**: the switch updates only after successful per-user startup registration, with rollback on failure. Login starts in the tray or menu bar; quitting does not remove the setting. Shortcuts are editable; new conflicts retain previous bindings, while existing conflicts do not block unrelated settings.
- **Language and theme**: Simplified Chinese/English plus system, light and dark themes.
- **Simple settings**: general preferences save automatically; recording a shortcut suppresses capture/pin actions. Cloud providers use separate drafts that remain available when Settings is hidden. Save a completed provider explicitly without affecting unrelated preferences. OCR can open the relevant provider configuration directly. Credentials use Windows Credential Manager or macOS Keychain.

The capture toolbar groups annotation, editing, image actions and completion, with Copy as the primary action. Hover or keyboard focus reveals action hints. OCR emphasizes editable text and Copy text, with one area for progress, cancellation and errors.

Accounts, subscriptions, history management, translation, summaries and a complex dashboard remain outside the scope. Closing Settings keeps the app in the tray. Version 0.1.1 reworks desktop capture, independent pins and the OCR result window.

Tool shortcuts: `Ctrl+1…7` selects annotation tools, `Ctrl+Z` undoes, `Ctrl+Y` / `Ctrl+Shift+Z` redoes, `Ctrl+S` saves and `Ctrl+C` copies. While entering text, Enter adds a line, `Ctrl+Enter` commits and Esc discards the current text.

Selection shortcuts: arrows move by one source pixel; `Ctrl+arrows` expands and `Shift+arrows` shrinks. `Ctrl+A` selects the display, `R` restores the last region, and `Ctrl+T` pins directly. Hold Alt for the magnifier and press C to copy the center pixel's HEX color.

## Platform support

- **Windows 10/11 x64**: F1/F3, window snapping, tray, login launch, local OCR and cloud OCR use the Windows build. The NSIS installer and portable archive include fixed WebView2, OCR models and Windows runtime files.
- **macOS 13.3+**: Intel and Apple Silicon are supported. F1 selection, F3 pins, clipboard, menu bar, login launch, local OCR and cloud OCR use the Tauri/macOS build. The first F1 capture requires Screen Recording permission in System Settings → Privacy & Security → Screen Recording. macOS currently does not enumerate other application windows for snapping; clicking selects the current display, while drag selection remains available.

macOS packages are built by GitHub Actions on macOS runners and do not use Windows WebView2, DirectML or Visual C++ runtime files. macOS local OCR uses the CPU/system ONNX Runtime; the DMG contains the OCR models and runtime. This Windows workstation cannot perform native macOS permission, menu-bar or installer acceptance; release notes distinguish CI packaging from live macOS verification.

## Installation and downloads

Download from [Releases](https://github.com/turtoncarllyle/snipasteveya/releases). `v0.1.1` is the historical Windows-only release; starting with `v0.1.2`, GitHub Actions publishes Windows, Intel Mac and Apple Silicon Mac assets together.

- `SnipasteVeya-0.1.2-win-x64-setup.exe`: Windows per-user NSIS installer.
- `SnipasteVeya-0.1.2-win-x64-portable.zip`: Windows portable archive; extract it and run `SnipasteVeya.exe`.
- `SnipasteVeya-0.1.2-macos-x64.dmg`: Intel Mac disk image built by macOS CI.
- `SnipasteVeya-0.1.2-macos-arm64.dmg`: Apple Silicon Mac disk image built by macOS CI.
- `SHA256SUMS*.txt`: SHA-256 files generated by each platform build.

The Windows installer and portable archive include PP-OCRv5 mobile models, fixed WebView2 154.0.4258.37, DirectML and Visual C++ runtime files. The macOS DMGs include the app, OCR models and the macOS ONNX Runtime. End users do not need Rust, Node.js, Python or separate model downloads; keep the DLLs, `resources` and `WebView2` folders next to the Windows portable executable. The public repository's releases can be downloaded directly.

## Development

- Rust stable (MSVC on Windows; Apple clang on macOS)
- Node.js 22+
- Windows builds require the Windows 10/11 SDK, MSVC C++ toolchain and x64 Visual C++ runtime 14.51.36247.0 or later.
- macOS builds require macOS 13.3+, Xcode Command Line Tools and the matching Rust target.

```powershell
npm ci
npm run typecheck
npm run test:capture
npm run test:settings
npm run build

# Windows Rust checks and tests
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-windows-runtime.ps1
cd src-tauri
cargo check
cargo test
cd ..

# Windows installer
npm run tauri build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-portable.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-release.ps1

# macOS DMG (run on macOS)
npm run tauri:build:macos -- --target x86_64-apple-darwin
npm run tauri:build:macos -- --target aarch64-apple-darwin
```

Local OCR reads bundled files from `src-tauri/resources/ocr/` without downloading models during recognition. Missing models produce an explicit error. Run the real model fixture with `cargo test --manifest-path src-tauri/Cargo.toml bundled_models -- --ignored --nocapture`.

The cross-platform preparation scripts stage the runtime for the current OS: Windows downloads and verifies the pinned WebView2 CAB and collects x64 Visual C++ DLLs, while macOS only creates the Tauri resource directory. The Windows bundle step adds DirectML; macOS does not use DirectML. Downloaded and extracted runtimes are not committed to Git; release assets are written to `artifacts/build/v0.1.2/`. `.github/workflows/desktop-packages.yml` builds Windows, Intel Mac and Apple Silicon Mac packages separately.

## Structure

```text
src/                 React + TypeScript UI and shortcut interaction
src-tauri/src/       capture, clipboard, tray, settings, OCR and AI provider
src-tauri/resources/ bundled OCR models for releases
scripts/              packaging and release verification scripts
tests/                release contracts and helper tests
```

## Privacy and cloud OCR

Local captures stay in memory until the user saves one. Cloud OCR is never called in the background; API keys are stored through Windows Credential Manager or macOS Keychain, while ordinary settings are UTF-8 JSON in the current user's configuration directory. DeepSeek and other providers are called by the Rust backend with Chat Completions image messages.

## Verification scope

The repository records TypeScript checks, Vite builds, Rust checks/tests, Windows x64 and dual-architecture macOS packaging, and asset checksums. Real DeepSeek requests, multi-monitor/DPI combinations, platform permissions, and install/upgrade/uninstall behavior on Windows and macOS require testing on those systems; release notes distinguish untested scenarios clearly.

Windows window snapping detects top-level windows, not individual UI controls or selections spanning displays. See the [platform support note](docs/platform-support-2026-10-13.md), the latest [UI verification record](docs/verification-ui-2026-10-10.md) and the earlier [desktop interaction verification](docs/verification-2026-10-09.md).

See the [v0.1.2 release record](docs/release-v0.1.2.md) for this cross-platform release and the [historical v0.1.1 record](docs/release-v0.1.1.md) for the earlier Windows package.

## License

MIT
