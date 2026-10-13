# 平台支持说明 / Platform support — 2026-10-13

SnipasteVeya 现在按同一套 Tauri + Rust + React 代码提供 Windows 和 macOS 构建入口。
SnipasteVeya now has build paths for Windows and macOS from the same Tauri + Rust + React codebase.

## 支持范围 / Supported scope

| 平台 / Platform | 架构 / Architecture | 打包 / Package | 说明 / Notes |
| --- | --- | --- | --- |
| Windows 10/11 | x64 | NSIS、便携 ZIP | F1/F3、窗口吸附、托盘、登录启动、本地/云端 OCR |
| macOS 13.3+ | Intel x64 | DMG | F1/F3、菜单栏、登录启动、本地/云端 OCR |
| macOS 13.3+ | Apple Silicon arm64 | DMG | F1/F3、菜单栏、登录启动、本地/云端 OCR |

macOS 首次使用 F1 需要在“系统设置 → 隐私与安全性 → 屏幕录制”授权。没有授权时，macOS 系统会阻止屏幕捕获；这不是应用内 OCR 错误。密钥在 Windows 使用 Credential Manager，在 macOS 使用 Keychain。
macOS requires Screen Recording permission for the first F1 capture. Without it, macOS blocks screen capture before OCR is involved. Credentials use Credential Manager on Windows and Keychain on macOS.

Windows 保留现有的窗口吸附检测。macOS 当前使用显示器级冻结和框选；点击默认选中当前显示器，拖动可以选取区域，暂未枚举其他应用窗口的边界。
Windows keeps native top-level window snapping. macOS currently freezes and selects the current display; clicking selects the display and dragging selects a region, while other application window bounds are not enumerated yet.

## 构建 / Build

Tauri 的构建前命令已经改为跨平台 Node 脚本。Windows 会准备 WebView2、DirectML 和 Visual C++ DLL；macOS 会准备资源目录并携带与目标架构匹配的 macOS CPU ONNX Runtime。
Tauri build hooks now use cross-platform Node scripts. Windows stages WebView2, DirectML and Visual C++ DLLs; macOS stages the resource directory and bundles the macOS CPU ONNX Runtime matching the target architecture.

```text
npm ci
npm run typecheck
npm run test:capture
npm run test:settings
npm run test:contract

# Windows
npm run tauri:build:windows

# macOS Intel
npm run tauri:build:macos -- --target x86_64-apple-darwin

# macOS Apple Silicon
npm run tauri:build:macos -- --target aarch64-apple-darwin
```

`.github/workflows/desktop-packages.yml` 在 Windows、macOS Intel 和 macOS Apple Silicon runner 上分别构建；推送 `v*` 标签时会把三个系统的包上传到对应 GitHub Release。当前 Windows 工作站只能直接验证 Windows 构建；macOS 的原生权限、菜单栏、DMG 安装和真实 F1/F3 流程需要在 macOS runner 或真实 Mac 上继续验收。
`.github/workflows/desktop-packages.yml` builds Windows, Intel macOS and Apple Silicon macOS packages on their native runners; pushing a `v*` tag uploads the three platform packages to the GitHub Release. This Windows workstation can verify the Windows build directly; native macOS permissions, menu bar behavior, DMG installation and live F1/F3 flows still require a macOS runner or Mac.

## 当前证据 / Current evidence

- Windows 10 x64 的 TypeScript、截图/设置测试、Rust 检查和 release 构建已通过。
  TypeScript, capture/settings tests, Rust checks and a release build passed on Windows 10 x64.
- macOS 依赖已启用 `keyring` 的 `apple-native`，全局鼠标位置使用跨平台实现，Tauri bundle 增加 DMG 目标，Windows 专用运行时脚本已从通用构建入口隔离。
  macOS support enables `keyring`'s `apple-native`, uses a cross-platform cursor implementation, adds the DMG target, and isolates Windows-only runtime scripts from generic build hooks.
- 未在本机宣称 macOS 构建或原生交互已通过；CI 产物与真实 Mac 验证应在发布记录中单独标记。
  This workstation does not claim a passing macOS build or native interaction run; CI artifacts and live Mac verification must be recorded separately in release notes.
