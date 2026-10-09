# SnipasteVeya v0.1.1

## 中文

本版重构 F1 截图、F3 贴图和 OCR 的桌面操作体验，并补齐离线发布包的运行库。

- **F1 截图**：先隐藏设置窗，再冻结鼠标所在显示器；独立截图层提供窗口吸附、框选调整、放大镜、像素微调和贴近选区的工具栏。
- **截图工具栏**：矩形/椭圆、箭头、画笔、荧光笔、马赛克、文字、橡皮擦、撤销/重做，以及复制、贴图、保存和 OCR。
- **F3 贴图**：每张图片使用独立置顶窗口，支持拖动、围绕鼠标缩放、右键菜单、单独关闭和隐藏/显示全部。
- **OCR**：独立可编辑结果窗，默认使用本地中英文 OCR；支持重试、取消等待和多个 OpenAI 兼容服务。失败保留已有文字，迟到结果不会覆盖新任务。
- **设置**：简化语言、主题、开机启动和快捷键设置。新快捷键冲突时保留原绑定；已有冲突不会阻止保存其他设置。
- **完整离线资源**：两个包均包含 PP-OCRv5 mobile 模型、固定 WebView2 154.0.4258.37、DirectML 与 Visual C++ DLL。便携版完整解压后运行 `SnipasteVeya.exe`，无需另外安装开发环境、模型或 WebView2。

| 附件 | 用途 |
| --- | --- |
| `SnipasteVeya-0.1.1-win-x64-setup.exe` | Windows 10/11 x64 当前用户安装包 |
| `SnipasteVeya-0.1.1-win-x64-portable.zip` | 完整便携包；请保留旁边的 DLL、resources 和 WebView2 文件夹 |
| `SHA256SUMS.txt` | 两个包的 SHA-256 校验值 |

验证：TypeScript 检查、前端生产构建、18 项前端逻辑测试、Rust 检查、12 项 Rust 测试与发布契约检查通过。真实中英文模型样本连续识别两次通过；云端成功、鉴权错误、不支持图片和超时使用本机 HTTP 模拟测试。

安装包构建完成并核对了模型、固定 WebView2 和原生 DLL 的安装清单。便携 ZIP 已实际解压启动，设置窗口显示 0.1.1；确认 WebView2 子进程与 DirectML、Visual C++ DLL 均从解压目录加载，重复启动保留单实例。两个附件的本地 SHA-256 校验及便携包必要文件检查通过。

实际验证环境为 Windows 10 x64（10.0.19045）。原生截图/贴图完整交互、多显示器/混合 DPI、登录启动、安装/覆盖安装/卸载、Windows 11 和真实云端厂商调用未完成本版验收。桌面自动化工具截图超时，不能把逻辑测试视为完整桌面实测。已有 v0.1.0 安装版未被本次验证覆盖。

当前窗口吸附检测顶层窗口，暂不支持跨屏拼接框选。取消本地 OCR 会立即停止界面等待，但当前 ONNX 推理会运行到返回后丢弃结果。使用云端 OCR 需要实际支持图片的模型，选择服务本身不会上传图片。若 F1/F3 被其他截图软件占用，请关闭占用程序或更改快捷键后重新保存。

仓库保持私有，下载需要相应 GitHub 访问权限。

## English

This release reworks the F1 capture, F3 pin and OCR desktop workflows and completes the offline runtime packaging.

- **F1 capture**: hide Settings before freezing the display under the pointer. A separate capture window provides window snapping, selection handles, a magnifier, pixel adjustments and a toolbar beside the selection.
- **Capture toolbar**: rectangle/ellipse, arrow, pen, highlighter, mosaic, text, eraser, undo/redo, copy, pin, save and OCR.
- **F3 pin**: each image has an independent topmost window with dragging, zoom around the pointer, context actions, individual closing and hide/show all.
- **OCR**: a separate editable result window, local bilingual OCR by default, retry, cancellation and multiple OpenAI-compatible providers. Errors preserve edited text; late results cannot overwrite a newer job.
- **Settings**: compact language, theme, startup and shortcut controls. New shortcut conflicts retain previous bindings; existing conflicts do not block unrelated settings.
- **Bundled offline resources**: both packages include PP-OCRv5 mobile models, fixed WebView2 154.0.4258.37, DirectML and Visual C++ DLLs. Extract the entire portable archive and run `SnipasteVeya.exe`; development tools, model downloads and a separate WebView2 installation are unnecessary.

| Asset | Purpose |
| --- | --- |
| `SnipasteVeya-0.1.1-win-x64-setup.exe` | Per-user installer for Windows 10/11 x64 |
| `SnipasteVeya-0.1.1-win-x64-portable.zip` | Complete portable package; retain the DLLs, resources and WebView2 folders |
| `SHA256SUMS.txt` | SHA-256 checksums for both packages |

Validation passed: TypeScript, the frontend production build, 18 frontend logic tests, Rust checking, 12 Rust tests and the release contract. The real bilingual model fixture passed twice using one cached engine. Cloud success, authentication failure, unsupported images and timeout were tested against a local HTTP mock.

The installer was built and its resource list was checked for models, fixed WebView2 and native DLLs. The portable ZIP was extracted and launched, with Settings displaying 0.1.1. WebView2 processes, DirectML and Visual C++ DLLs were confirmed to load from the extracted package, and a second launch retained a single instance. Both local asset hashes and the portable package's required contents were verified.

The actual test environment was Windows 10 x64 (10.0.19045). Full native capture/pin interactions, multiple displays/mixed DPI, login startup, install/upgrade/uninstall, Windows 11 and real cloud providers were not accepted as tested for this release. Desktop automation screenshots timed out; logic tests do not establish full desktop interaction correctness. The existing v0.1.0 installation was not overwritten during verification.

Window snapping detects top-level windows; selections spanning displays are not supported. Cancelling local OCR releases the UI immediately, while the current ONNX inference finishes and its result is discarded. Cloud OCR requires an actual image-capable model; choosing a provider alone does not upload anything. If another screenshot app occupies F1/F3, close it or choose different shortcuts and save again.

The repository remains private; downloads require GitHub access.
