# 交互重构验证 / Interaction verification — 2026-10-09

本记录针对本地源码和本次构建，不代表 GitHub v0.1.0 已发布附件的功能或验证范围。
This record covers the local changes and build, not the previously published GitHub v0.1.0 assets.

后续 v0.1.1 的重新构建、打包与验证范围见 [发布记录](release-v0.1.1.md)。
See the [release record](release-v0.1.1.md) for the subsequent v0.1.1 rebuild, packaging and verification scope.

## 已完成 / Completed

环境：Windows 10 x64，系统版本 10.0.19045；Tauri 2 / Rust / React / TypeScript。
Environment: Windows 10 x64, OS build 10.0.19045; Tauri 2 / Rust / React / TypeScript.

| 检查 / Check | 结果 / Result |
| --- | --- |
| TypeScript + Vite production build | 通过 / Passed |
| 前端逻辑 / Frontend logic | 18 项通过，含坐标、边缘工具栏、标注撤销、像素微调、OCR 失败保留结果与迟到结果隔离 / 18 passed, including geometry, toolbar bounds, annotation history, pixel adjustment and OCR result races |
| Rust check / unit tests | 检查通过；全量普通测试 10 项通过，最后快捷键修改后 4 项设置专项测试通过（含新增的 2 项冲突回归测试） / Check passed; the initial full suite passed 10 regular tests, followed by 4 settings tests after the final shortcut change, including 2 new conflict regressions |
| 本地 OCR 真实模型 / Real local OCR models | 单独执行的模型测试通过；同一个引擎连续识别中英文样本两次 / Separate model test passed; two consecutive bilingual recognitions with one cached engine |
| 云端协议模拟 / Mock cloud protocol | 本机 HTTP 服务验证图片消息、中文响应、401、400 和超时 / Loopback HTTP tests cover image messages, Unicode responses, 401, 400 and timeout |
| 发布契约 / Release contract | 通过；应用版本仍为 0.1.0 / Passed; application version remains 0.1.0 |
| Windows x64 release build | 最终源码构建通过，生成 `src-tauri/target/release/snipasteveya.exe`（42,101,760 字节）。这是本地构建，未重新打包安装包或更新 GitHub 附件 / Final source built successfully; this local executable is not a rebuilt installer or an updated GitHub asset |
| 差异检查 / Diff check | `git diff --check` 通过 / Passed |
| 原生启动 / Native startup | 本地 release 可执行文件启动并持续运行，读取到真实设置界面与本地 OCR 默认选项 / The local release executable stayed running; native accessibility exposed Settings and the default local OCR option |
| 单实例 / Single instance | 启动第二个相同可执行文件后，第二个进程退出，原进程保留 / Launching the same executable again exited the second process and retained the original |
| 快捷键冲突 / Shortcut conflicts | 本机同时运行 Snipaste，三个默认键均注册失败；最终构建继续运行并显示精简中文提示，无内部调试信息。保存无关设置与更换可用快捷键的逻辑通过回归测试，未完成界面点击验收 / Snipaste was also running and all three default shortcuts failed to register; the final build stayed running and displayed the concise localized notice without internal debug details. Regression tests cover unrelated settings and available replacement keys; UI save interactions were not verified |

真实 OCR 样本位于 `tests/fixtures/bilingual-ocr.png`，识别结果包含「截图与文字识别 支持中文和英文」、「Hello Windows 10 and 11」和「F1 Capture F3 Pin OCR 2026」。这不是对任意截图准确率的保证。模型通过绝对路径读取，没有调用模型下载流程；没有进行拔网线式的全流程断网验收。

The real fixture contains Chinese, English and numbers. Both recognitions recovered those lines. This is a fixture check, not a general accuracy benchmark. Models were loaded by absolute path without invoking downloads; a full disconnected-desktop acceptance run was not performed.

## 验证边界 / Limits

- 浏览器预览被工具安全检查阻止：无法验证已保存的浏览器权限。未使用其他浏览器绕过该限制。
  Browser preview was blocked because saved browser permissions could not be verified. No alternate browser was used to bypass that check.
- 原生界面的无障碍文本可读取，但工具窗口截图持续报 `FrameArrived timed out` / `window capture timed out`，点击报 `coordinate input geometry is unavailable`。已停止自动点击；没有据此宣称视觉、框选、拖动或缩放实测通过。
  Native accessibility text was readable, but window capture timed out and clicks failed with `coordinate input geometry is unavailable`. Automated input was stopped; these observations do not establish visual, selection, dragging or zoom correctness.
- Windows 原生 F1 → 框选 → Enter → F3、多贴图拖动与缩放、混合 DPI、多显示器、登录启动、安装覆盖与卸载：未在本记录中标记通过。
  Native end-to-end capture/pin interactions, multiple pins, mixed DPI, multiple displays, login startup, upgrades and uninstall are not marked as passed here.
- Windows 11 与真实云端厂商接口未验证；云端模拟测试不等于 DeepSeek 实际模型支持图片或达到某种识别准确率。
  Windows 11 and real cloud providers were not tested. Protocol mocks do not establish a DeepSeek model's image support or accuracy.
- 本地取消立即解除界面等待并跳过已取消的排队任务；已进入 ONNX 的当前推理会运行到返回，再丢弃结果。云端取消丢弃请求 future，不保证远端服务停止计费或处理。
  Local cancellation releases the UI and skips cancelled queued work; in-progress native ONNX inference finishes and its result is discarded. Cloud cancellation drops the client request future and does not guarantee that the remote provider stops processing or billing.
- 窗口吸附只检测顶层窗口；跨屏拼接框选、UI 控件识别、贴图透明度与穿透不属于本次实现。
  Snapping targets top-level windows. Cross-display selections, individual UI element detection, pin opacity and click-through are outside this change.

## 复验命令 / Reproduction

```powershell
npm run typecheck
npm run test:capture
npm run test:contract
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml bundled_models -- --ignored --nocapture
cargo build --release --manifest-path src-tauri/Cargo.toml
```

Rust 命令需要 MSVC 和 Windows SDK 环境；本机使用 `.tooling\msvc\setup_x64.bat` 初始化。
Rust commands require the MSVC and Windows SDK environment; this machine uses `.tooling\msvc\setup_x64.bat`.
