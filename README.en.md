# SnipasteVeya

SnipasteVeya is a focused screenshot, pinned-image and OCR utility for Windows 10/11 x64. It stays in the system tray and keeps the first release centered on **F1 screenshot**, **F3 pin** and **OCR**.

## Core experience

- **F1 screenshot**: freeze the active display and drag a region. The compact toolbar offers copy, pin and OCR; Enter copies and Esc cancels.
- **F3 pin**: read an image from the clipboard and keep it visible above other windows. Press F3 again for another image, drag to move, use the wheel to zoom, press Esc to close, and use Shift+F3 to hide or show pinned images.
- **OCR**: local PP-OCRv5 mobile is enabled by default for mixed Chinese and English. Images are not uploaded automatically. Results are editable, copyable and retryable.
- **AI OCR**: opt into DeepSeek Vision or any OpenAI-compatible vision endpoint. The current image is sent only after the user explicitly starts cloud OCR.
- **Start with Windows**: enable it in Settings to launch in the tray for the current user. Closing the app does not remove the setting.
- **Language and theme**: Simplified Chinese/English plus system, light and dark themes.

The first release intentionally excludes accounts, subscriptions, history management, annotation editing, translation, summaries and a complex dashboard.

## Installation and downloads

Download from [Releases](https://github.com/turtoncarllyle/snipasteveya/releases):

- `SnipasteVeya-0.1.0-win-x64-setup.exe`: per-user NSIS installer.
- `SnipasteVeya-0.1.0-win-x64-portable.zip`: self-contained portable package.
- `SHA256SUMS.txt`: SHA-256 values for both packages.

Both packages target Windows 10/11 x64 and include the PP-OCRv5 mobile models and offline WebView2 installation resources. End users do not need Rust, Node.js, Python or a separate model download. Downloads from the private repository require GitHub access.

## Development

- Rust stable (MSVC)
- Node.js 22+
- Windows 10/11 SDK and MSVC C++ toolchain

```powershell
npm install
npm run typecheck
npm run build

# Rust checks and tests
cd src-tauri
cargo check
cargo test
cd ..

# Windows installer
npm run tauri build
```

The PP-OCRv5 files in `src-tauri/resources/ocr/` are checked against the SHA-256 values from the oar-ocr registry. If resources are absent during development, oar-ocr can download registered models into `OAR_HOME` on the first local OCR request.

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

## License

MIT
