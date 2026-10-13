# SnipasteVeya v0.1.2

## 中文

v0.1.2 将 SnipasteVeya 从 Windows-only 扩展为 Windows 与 macOS 双平台桌面工具，核心仍然是 F1 截图、F3 贴图和中英文 OCR。

- Windows 10/11 x64：NSIS 当前用户安装包和完整便携 ZIP。
- macOS 13.3+：Intel x64 与 Apple Silicon arm64 DMG。
- macOS 首次使用 F1 需要在“系统设置 → 隐私与安全性 → 屏幕录制”授权。
- Windows 使用托盘和窗口吸附；macOS 使用菜单栏和显示器级框选，暂不枚举其他应用窗口用于吸附。
- 本地 OCR、DeepSeek/OpenAI 兼容云端 OCR、快捷键、登录启动和多张贴图保持统一的 Rust 后端与 React 界面。

| 附件 | 用途 |
| --- | --- |
| `SnipasteVeya-0.1.2-win-x64-setup.exe` | Windows 10/11 x64 当前用户安装包 |
| `SnipasteVeya-0.1.2-win-x64-portable.zip` | Windows 完整便携包 |
| `SnipasteVeya-0.1.2-macos-x64.dmg` | Intel Mac 安装镜像 |
| `SnipasteVeya-0.1.2-macos-arm64.dmg` | Apple Silicon Mac 安装镜像 |
| `SHA256SUMS*.txt` | 对应构建的 SHA-256 校验值 |

Windows 包携带固定 WebView2、OCR 模型、DirectML 和 Visual C++ 运行库；macOS DMG 携带应用、OCR 模型和 macOS 对应的 ONNX Runtime。普通用户不需要安装 Rust、Node.js、Python 或手动下载模型。

Windows 端在本机完成 TypeScript、前端构建、截图/设置测试、Rust 检查与测试、NSIS 构建和运行库 staging。macOS 构建由 GitHub Actions 的 macOS 13/14 原生 runner 完成；本机无法宣称 macOS 权限、菜单栏、DMG 安装和原生 F1/F3 已实测。

## English

v0.1.2 extends SnipasteVeya from Windows-only to a Windows and macOS desktop utility while keeping F1 capture, F3 pin and bilingual OCR as the core experience.

- Windows 10/11 x64: per-user NSIS installer and complete portable ZIP.
- macOS 13.3+: Intel x64 and Apple Silicon arm64 DMGs.
- The first macOS F1 capture requires Screen Recording permission in System Settings → Privacy & Security → Screen Recording.
- Windows keeps the tray and native window snapping; macOS uses the menu bar and display-level selection and does not enumerate other application windows for snapping yet.
- Local OCR, DeepSeek/OpenAI-compatible cloud OCR, shortcuts, login launch and multiple pins use the same Rust backend and React UI.

| Asset | Purpose |
| --- | --- |
| `SnipasteVeya-0.1.2-win-x64-setup.exe` | Per-user installer for Windows 10/11 x64 |
| `SnipasteVeya-0.1.2-win-x64-portable.zip` | Complete Windows portable package |
| `SnipasteVeya-0.1.2-macos-x64.dmg` | Intel Mac disk image |
| `SnipasteVeya-0.1.2-macos-arm64.dmg` | Apple Silicon Mac disk image |
| `SHA256SUMS*.txt` | SHA-256 checksums from the corresponding builds |

Windows packages bundle fixed WebView2, OCR models, DirectML and Visual C++ runtime files. macOS DMGs bundle the app, OCR models and the macOS ONNX Runtime. End users do not need Rust, Node.js, Python or manual model downloads.

TypeScript, frontend builds, capture/settings tests, Rust checks and tests, NSIS packaging and Windows runtime staging passed on this workstation. macOS packages are produced by native macOS 13/14 GitHub Actions runners; this Windows workstation does not claim native macOS permissions, menu-bar behavior, DMG installation or live F1/F3 interaction as tested.
