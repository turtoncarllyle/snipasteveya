# 界面与交互重构验证 / UI verification — 2026-10-10

本记录针对工作区中的界面重构。应用版本仍为 `0.1.1`；本记录不代表已发布安装包或 GitHub 附件已经更新。
This record covers the UI changes in the working tree. The application version remains `0.1.1`; it does not describe an updated installer or GitHub asset.

## 改动 / Changes

- 截图：完整工具栏按功能分组，32px 标注按钮，复制为唯一填色主操作，属性按需展开；输出失败保留选区和标注并提供重试。
  Capture: grouped full toolbar, 32px annotation buttons, copy as the primary action, contextual properties, and retry without losing selection or annotations.
- 贴图：图片主体与细边框，分组右键菜单，短暂且不拦截输入的反馈；保留拖动、缩放、多贴图与隐藏全部。
  Pins: image-only surface, thin border, grouped context menu, transient feedback that does not intercept input, and existing move/zoom/multiple-pin behavior.
- OCR：可编辑文字为主体，共用状态区域，取消与重试不清空已有文字；切换服务本身不触发请求，缺少配置时可直达设置。
  OCR: editable text, a shared status area, retained text on cancel/retry, explicit recognition after switching providers, and a direct configuration link.
- 设置：三组单栏，常规项串行自动保存；服务独立草稿；快捷键录制期间抑制已注册的截图/贴图动作；语言、主题和托盘菜单同步。
  Settings: three single-column sections, serialized automatic saves, independent provider drafts, suppressed capture/pin actions during shortcut recording, and synchronized language/theme/tray menus.

## 自动检查 / Automated checks

环境：Windows 10 x64，系统版本 `10.0.19045`，现有 Tauri 2 / Rust / React / TypeScript 工具链，无新增依赖。
Environment: Windows 10 x64 build `10.0.19045`, the existing Tauri 2 / Rust / React / TypeScript toolchain, and no new dependencies.

| 检查 / Check | 结果 / Result |
| --- | --- |
| TypeScript / Vite | 类型检查与生产构建通过 / Type check and production build passed |
| 截图与 OCR 状态 / Capture and OCR state | 18 项通过，含物理像素、DPI 坐标、工具栏边缘、标注撤销、取消与迟到结果 / 18 passed, including physical pixels, DPI coordinates, toolbar bounds, annotation undo, cancellation and late results |
| 设置行为 / Settings behavior | 7 项通过，含连续提交、失败回退、启动项成功前保持原值、草稿隔离、凭据脱敏、配置校验与快捷键过滤 / 7 passed, covering serialization, rollback, confirmed startup state, draft isolation, redacted responses, validation and shortcut filtering |
| Rust | `cargo check --locked --offline` 通过；普通测试 14 项通过，真实模型专项测试 1 项未执行 / Check passed; 14 regular tests passed and 1 real-model fixture test was not run |
| Windows x64 本地构建 / Local build | 最后一次 Rust 修改后重新检查、运行普通测试并构建 release，全部通过；程序位于 `src-tauri\target\release\snipasteveya.exe` / Check, regular tests and the release build passed again after the final Rust changes |
| 云端协议 / Cloud protocol | Rust 本机 HTTP 模拟覆盖图片消息、中英文响应、鉴权错误、不支持图片与超时；不等于真实厂商调用 / Rust loopback mocks cover image messages, Unicode, authentication errors, unsupported images and timeout; these are not live provider calls |
| 发布契约 / Release contract | `npm run test:contract` 通过；未修改版本与资源打包约定 / Passed; version and bundled-resource contracts are unchanged |
| 差异 / Diff | `git diff --check` 通过 / Passed |

最终本地 exe 为 42,116,096 字节，SHA-256：`DF1658331D50F47DADEAA7E8DECED419AB93113DF3105C274330F2CE06495FE7`。该校验仅标识本次本地构建，不是 Release 安装包的校验。
The final local executable is 42,116,096 bytes with the SHA-256 above. This identifies the local build, not a Release installer.

## 原生与视觉验证 / Native and visual verification

- 对照旧版的设置窗口无障碍树，确认原有大段介绍、全局保存按钮和默认快捷键冲突提示。旧版窗口截图重试后仍报 `FrameArrived timed out` / `window capture timed out`，无法取得可靠的重构前效果图。
  The baseline settings accessibility tree exposed the old introduction, global save button and shortcut-conflict notice. Baseline screenshots repeatedly failed with `FrameArrived timed out` / `window capture timed out`, so no reliable before image was obtained.
- 新版本地 release 程序实际启动并保持响应。真实无障碍树显示截图/F1、贴图/F3、常规/快捷键/文字识别三组、本地 OCR 默认项、底部“设置自动保存”和版本号，未出现旧版全局保存按钮；原生标题更新为中文“SnipasteVeya · 设置”。
  The local release build launched and remained responsive. Its native accessibility tree exposed the F1/F3 actions, three settings sections, default local OCR, automatic-save footer and version, with no former global save button. The native title was localized to Chinese.
- 新版外观设置的自动点击失败，错误为 `coordinate input geometry is unavailable`；新版截图及重新选择/激活窗口后的重试同样超时。停止自动输入，未把无障碍结构核对当作视觉或操作验收，也没有生成模拟效果图作为证据。
  Clicking the appearance setting failed with `coordinate input geometry is unavailable`. Capturing the new window and retrying after reselection/activation also timed out. Automated input was stopped. Accessibility verification is not visual or interaction acceptance, and no mockup was used as evidence.
- 浏览器预览因无法验证已保存的浏览器权限而被工具安全检查阻止；未用其他浏览器绕过该限制。
  Browser preview was blocked because saved browser permissions could not be verified. No alternate browser was used to bypass this restriction.
- 本机另有 Snipaste 运行，占用默认快捷键；保留该用户进程。快捷键冲突回退与录制路由经过逻辑测试，不能据此标记原生 F1/F3 链路已验收。
  The user's existing Snipaste instance owns the default shortcuts and was kept running. Logic tests cover conflict rollback and recording routes; these do not establish native F1/F3 acceptance.

## 尚未覆盖 / Not covered

- 中英文、明暗主题、520×600 与最小窗口尺寸的渲染效果，以及 100%–200% DPI 的视觉比对。设置最小尺寸为 440×480，OCR 最小尺寸为 440×320（逻辑像素），布局使用滚动与按组换行；这只是实现约束，并非视觉验收结果。
  Rendered Chinese/English, light/dark, default/minimum window sizes and 100%–200% DPI comparisons. Settings have a 440×480 logical minimum and OCR has a 440×320 minimum; scrolling and grouped wrapping are implemented but not visually certified.
- 原生 F1 → 框选 → Enter → F3、工具栏贴图、标注、边缘定位、多贴图拖动/缩放、取消；多屏负坐标和混合 DPI 的桌面操作。
  Native capture → select → copy → pin, toolbar pinning, annotations, edge positioning, multiple pins, drag/zoom/cancel, negative-coordinate monitors and mixed-DPI desktop interaction.
- 云端真实识别、原生 OCR 窗口的重试/取消/关闭竞态、服务切换无上传、配置导航与草稿隐藏后恢复。对应状态与合并逻辑已测试，完整 UI 链路尚未验收。
  Live cloud recognition and native OCR retry/cancel/close races, no-upload switching, configuration navigation and draft retention on hide. State and merge logic were tested; complete UI flows are unverified.
- 开机启动注册与真实登录启动、安装/覆盖安装/卸载、重新打包、GitHub 上传与附件校验；Windows 11。
  Native startup registration and login launch, install/upgrade/uninstall, repackaging, GitHub upload/asset checksums, and Windows 11.

## 复验 / Reproduce

```powershell
npm run typecheck
npm run build
npm run test:capture
npm run test:settings
npm run test:contract
```

在已初始化 MSVC 与 Windows SDK 的终端执行：
In a terminal initialized with MSVC and the Windows SDK:

```powershell
cargo check --locked --offline --manifest-path src-tauri\Cargo.toml
cargo test --locked --offline --manifest-path src-tauri\Cargo.toml
cargo build --release --locked --offline --manifest-path src-tauri\Cargo.toml
```

本机使用 `.tooling\msvc\setup_x64.bat` 初始化。编译后的程序需要同目录中的 DLL、`resources` 和 `WebView2`；不能只复制 exe 到其他目录运行。
This machine initializes MSVC with `.tooling\msvc\setup_x64.bat`. The built executable requires its adjacent DLLs, `resources` and `WebView2`; do not copy the executable alone.
