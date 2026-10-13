# SnipasteVeya

简体中文 | [English](README.en.md)

SnipasteVeya 是一个面向 Windows 10/11 x64 的轻量截图、贴图和 OCR 工具。它常驻系统托盘，核心操作只有 **F1 截图**、**F3 贴图** 和 **OCR**，适合快速把屏幕内容变成可复制的文字。

## 核心体验

- **F1 截图**：先隐藏设置窗口，再在独立截图层冻结鼠标所在显示器。点击自动选中窗口，拖动自由框选，八个手柄调整选区；提供像素放大镜和方向键微调。紧凑工具栏跟随选区并避开边缘；Enter 或双击复制，Esc 取消，右键先退出标注、再重新框选。
- **截图工具栏**：矩形/椭圆、箭头、画笔、荧光笔、马赛克、文字、橡皮擦（删除标注）、撤销/重做，以及 OCR、取消、贴图、保存和复制。颜色和粗细只在选中标注工具时展开；复制、贴图、保存和 OCR 使用包含标注的图片。
- **F3 贴图**：每张图片都是独立、无边框、置顶的桌面窗口。拖动移动，滚轮围绕鼠标缩放，中键或 Ctrl+0 恢复原始大小，Esc 或双击只关闭当前贴图。右键提供复制、保存、OCR 和隐藏全部；Shift+F3 恢复已有贴图，不重复读取剪贴板。
- **OCR**：默认使用本地 PP-OCRv5 mobile，支持中英文混排并复用模型。结果在独立窗口中编辑、复制、切换引擎后重试；失败保留图片和已有文字，错误单独显示。云端取消会中止客户端请求；本地取消立即停止等待，当前 ONNX 推理会完成后丢弃结果，排队的已取消任务不会开始推理。
- **AI OCR**：提供 DeepSeek 预设，可保存多个 OpenAI 兼容服务及各自的密钥。需要使用支持图片输入的实际模型；预设不代表所有模型都具有视觉能力。只有主动使用云端 OCR 时，当前图片才发送到所选服务；切换下拉框本身不发送图片。
- **开机启动**：成功注册当前用户登录启动项后才更新开关；失败会回滚。登录后进入托盘，退出程序不会取消设置。快捷键可在设置中修改；新快捷键冲突时保留原绑定，已有冲突不阻止保存其他设置。
- **语言和主题**：支持简体中文/English，以及跟随系统、浅色、深色主题。
- **极简设置**：常规设置自动保存；快捷键录制时暂停截图/贴图动作。云服务配置使用独立草稿，填写完成后保存，不影响其他设置；隐藏窗口后草稿保留。服务缺少配置时，可从 OCR 窗口直接进入对应配置。

截图工具栏按标注、编辑、使用截图和完成分组，复制为主按钮；悬停或键盘聚焦可查看操作提示。OCR 窗口突出可编辑文字和“复制文字”，统一显示识别进度、取消和失败反馈。

不包含会员、账号、历史管理、翻译、总结和复杂后台页面。日常常驻托盘，关闭设置窗口后继续运行。v0.1.1 重构了桌面截图、独立贴图和 OCR 结果窗口。

工具快捷键：`Ctrl+1…7` 选择标注工具，`Ctrl+Z` 撤销，`Ctrl+Y` / `Ctrl+Shift+Z` 重做，`Ctrl+S` 保存，`Ctrl+C` 复制。文字输入时 Enter 换行，`Ctrl+Enter` 完成文字，Esc 放弃当前文字。

选区快捷键：方向键移动 1 个原图像素，`Ctrl+方向键` 扩大、`Shift+方向键` 缩小，`Ctrl+A` 选中当前屏幕，`R` 恢复上次选区，`Ctrl+T` 直接贴图。按住 Alt 显示放大镜，C 复制放大镜中心的 HEX 颜色。

## 安装与下载

从 [Releases](https://github.com/turtoncarllyle/snipasteveya/releases) 下载：

- `SnipasteVeya-0.1.1-win-x64-setup.exe`：当前用户 NSIS 安装包。
- `SnipasteVeya-0.1.1-win-x64-portable.zip`：便携包，完整解压后运行 `SnipasteVeya.exe`。
- `SHA256SUMS.txt`：两个包的 SHA-256 校验值。

安装包和便携包均面向 Windows 10/11 x64，包含 PP-OCRv5 mobile 模型、固定版本 WebView2 154.0.4258.37、DirectML 和 Visual C++ 运行库。普通用户不需要安装 Rust、Node.js、Python 或手动下载模型、运行库。便携版需要保留程序旁的 DLL、`resources` 和 `WebView2` 文件夹。私有仓库的 Release 下载需要相应 GitHub 访问权限。

## 开发环境

- Rust stable（MSVC）
- Node.js 22+
- Windows 10/11 SDK 与 MSVC C++ 工具链
- 构建机器上的 x64 Visual C++ 运行库 14.51.36247.0 或更新版本（打包脚本将其复制到发布包）

```powershell
npm ci
npm run typecheck
npm run test:capture
npm run test:settings
npm run build

# Rust 静态检查和测试
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-windows-runtime.ps1
cd src-tauri
cargo check
cargo test
cd ..

# Windows 安装包
npm run tauri build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-portable.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-release.ps1
```

本地 OCR 直接读取 `src-tauri/resources/ocr/` 随包携带的模型，不在识别时自动下载。模型缺失时会明确报错。真实模型样本测试：`cargo test --manifest-path src-tauri/Cargo.toml bundled_models -- --ignored --nocapture`。

构建前的脚本会下载并校验固定 WebView2 CAB，展开运行时，并收集本机 x64 Visual C++ DLL；这只发生在开发打包阶段。构建后的脚本会把 DirectML 加入安装资源。下载产物与展开的运行库不提交到 Git；发布文件输出至 `artifacts/build/v0.1.1/`。

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

当前窗口吸附检测顶层窗口，不包含 UI 控件识别或跨屏拼接选区。最近一次验证记录见 [界面与交互重构验证](docs/verification-ui-2026-10-10.md)，此前记录见 [桌面交互验证](docs/verification-2026-10-09.md)。

本次发布说明与验证范围见 [v0.1.1 发布记录](docs/release-v0.1.1.md)。

## License

MIT
