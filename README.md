# SnipasteVeya

SnipasteVeya 是一个面向 Windows 10/11 x64 的轻量截图、贴图和 OCR 工具。它常驻系统托盘，核心操作只有 **F1 截图**、**F3 贴图** 和 **OCR**，适合快速把屏幕内容变成可复制的文字。

## 核心体验

- **F1 截图**：冻结当前显示器，拖动框选区域。工具栏提供复制、贴图和 OCR；Enter 复制，Esc 取消。
- **F3 贴图**：读取剪贴板图片并置顶。可以重复按 F3 创建多张贴图，拖动移动、滚轮缩放，Esc 关闭当前窗口，Shift+F3 隐藏或显示贴图。
- **OCR**：默认使用本地 PP-OCRv5 mobile，中英文混排，图片不会自动上传。识别结果可编辑、复制和重试。
- **AI OCR**：按需接入 DeepSeek Vision 或任意 OpenAI 兼容视觉接口。只有用户主动点击云端 OCR 时，当前图片才会发送到配置的服务。
- **开机启动**：设置中开启后以当前用户登录启动并进入托盘；退出程序不会取消设置。
- **语言和主题**：支持简体中文/English，以及跟随系统、浅色、深色主题。

首版刻意不包含会员、账号、历史管理、标注编辑、翻译、总结和复杂后台页面。

## 安装与下载

从 [Releases](https://github.com/turtoncarllyle/snipasteveya/releases) 下载：

- `SnipasteVeya-0.1.0-win-x64-setup.exe`：当前用户 NSIS 安装包。
- `SnipasteVeya-0.1.0-win-x64-portable.zip`：便携包，解压后直接运行。
- `SHA256SUMS.txt`：两个包的 SHA-256 校验值。

安装包和便携包均面向 Windows 10/11 x64，包含 PP-OCRv5 mobile 模型和 WebView2 离线安装资源；普通用户不需要安装 Rust、Node.js、Python 或手动下载模型。私有仓库的 Release 下载需要相应 GitHub 访问权限。

## 开发环境

- Rust stable（MSVC）
- Node.js 22+
- Windows 10/11 SDK 与 MSVC C++ 工具链

```powershell
npm install
npm run typecheck
npm run build

# Rust 静态检查和测试
cd src-tauri
cargo check
cargo test
cd ..

# Windows 安装包
npm run tauri build
```

`src-tauri/resources/ocr/` 中的 PP-OCRv5 文件按 oar-ocr 注册表的 SHA-256 校验；开发时如果资源缺失，oar-ocr 会在首次本地 OCR 时按需下载到 `OAR_HOME`。

## 项目结构

```text
src/                 React + TypeScript 界面和快捷键交互
src-tauri/src/       截图、剪贴板、托盘、设置、OCR 和 AI Provider
src-tauri/resources/ 发布时随应用携带的 OCR 模型
scripts/             打包和发布校验脚本
tests/               发布契约和辅助测试
```

## 隐私与云端 OCR

本地截图默认只保留在内存，点击保存时才写入文件。云端 OCR 不会后台自动调用；API Key 通过 Windows Credential Manager 保存，普通设置以 UTF-8 JSON 保存到当前用户配置目录。DeepSeek 等服务的网络请求由 Rust 后端发起，并使用 Chat Completions 图片消息。

## 验证范围

本仓库会记录 TypeScript 检查、Vite 构建、Rust 检查/测试、Windows x64 打包和附件校验结果。真实 DeepSeek 请求、多显示器/DPI 组合、Windows 10 与 Windows 11 的安装覆盖和卸载验证需要在对应系统上实测；没有实测的项目不会在发布说明中标记为已验证。

## License

MIT
