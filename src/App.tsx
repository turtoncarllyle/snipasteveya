import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  AppMode,
  AppSettings,
  CaptureFrame,
  OcrEngine,
  OcrResult,
  PasteItem,
  Rect,
} from "./types";

const defaultSettings: AppSettings = {
  language: "zh-CN",
  theme: "system",
  autostart: false,
  f1Shortcut: "F1",
  f3Shortcut: "F3",
  ocrEngine: "local",
  provider: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
      apiKey: undefined,
    apiKeyConfigured: false,
  },
};

const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error("请在 Tauri 应用中运行此功能");
  }
  return invoke<T>(name, args);
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

function Icon({ name }: { name: "copy" | "pin" | "ocr" | "save" | "settings" | "close" | "back" | "play" }) {
  const paths: Record<string, string> = {
    copy: "M8 8h10v10H8z M6 16H4V4h12v2",
    pin: "m8 4 8 8-3 1 3 3-2 2-3-3-1 3-8-8z",
    ocr: "M4 7V5a1 1 0 0 1 1-1h2 M17 4h2a1 1 0 0 1 1 1v2 M20 17v2a1 1 0 0 1-1 1h-2 M7 20H5a1 1 0 0 1-1-1v-2 M7 12h10 M12 7v10",
    save: "M5 4h11l3 3v13H5z M8 4v5h8V4 M8 16h8",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.4 1.4-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L9 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H7v-2h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L8.4 9l1.4-1.4.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.2 9l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2h-.2a1.7 1.7 0 0 0-1.6 1z",
    close: "M6 6l12 12M18 6 6 18",
    back: "m15 18-6-6 6-6",
    play: "m8 5 10 7-10 7z",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

function App() {
  const [mode, setMode] = useState<AppMode>("idle");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [pasteItems, setPasteItems] = useState<PasteItem[]>([]);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const ocrRequest = useRef(0);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; left: number; top: number } | null>(null);

  const t = useCallback((zh: string, en: string) => (settings.language === "zh-CN" ? zh : en), [settings.language]);
  const themeClass = useMemo(() => `theme-${settings.theme}`, [settings.theme]);

  const showWindow = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().show();
      await getCurrentWindow().setFocus();
    } catch {
      // Browser preview does not expose a native window.
    }
  }, []);

  const hideWindow = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().hide();
    } catch {
      // Browser preview.
    }
  }, []);

  const startCapture = useCallback(async () => {
    try {
      const result = await command<CaptureFrame>("capture_screen");
      setFrame(result);
      setSelection(null);
      setMode("capture");
      await showWindow();
      if (isTauri()) await getCurrentWindow().setFullscreen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [showWindow]);

  const cancelCapture = useCallback(async () => {
    setMode("idle");
    setSelection(null);
    if (isTauri()) {
      try {
        await getCurrentWindow().setFullscreen(false);
      } catch {
        // Ignore when already leaving fullscreen.
      }
    }
    await hideWindow();
  }, [hideWindow]);

  const getSelectedImage = useCallback(async (): Promise<string | null> => {
    if (!frame) return null;
    if (!selection || selection.width < 2 || selection.height < 2) return frame.dataUrl;
    return command<string>("crop_capture", {
      imageBase64: dataUrlToBase64(frame.dataUrl),
      rect: selection,
      sourceWidth: frame.width,
      sourceHeight: frame.height,
    });
  }, [frame, selection]);

  const copySelection = useCallback(async () => {
    try {
      const image = await getSelectedImage();
      if (!image) return;
      await command("copy_image", { imageBase64: dataUrlToBase64(image) });
      setNotice(t("已复制截图", "Screenshot copied"));
      setTimeout(() => setNotice(""), 1800);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [getSelectedImage, t]);

  const saveSelection = useCallback(async () => {
    try {
      const image = await getSelectedImage();
      if (!image) return;
      const saved = await command<string>("save_image", { imageBase64: dataUrlToBase64(image) });
      if (saved) {
        setNotice(t("截图已保存", "Screenshot saved"));
        setTimeout(() => setNotice(""), 1800);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [getSelectedImage, t]);

  const runOcr = useCallback(async (image: string | null = null) => {
    const selected = image ?? (await getSelectedImage());
    if (!selected) return;
    const requestId = ++ocrRequest.current;
    setOcrBusy(true);
    setOcrOpen(true);
    try {
      const result = await command<OcrResult>("ocr_image", {
        imageBase64: dataUrlToBase64(selected),
        engine: settings.ocrEngine,
        provider: settings.provider,
      });
      if (requestId === ocrRequest.current) setOcr(result);
    } catch (error) {
      if (requestId === ocrRequest.current) setOcr({ text: error instanceof Error ? error.message : String(error), engine: settings.ocrEngine });
    } finally {
      if (requestId === ocrRequest.current) setOcrBusy(false);
    }
  }, [getSelectedImage, settings.ocrEngine, settings.provider]);

  const pinImage = useCallback(async (image: string) => {
    const offset = pasteItems.length * 24;
    setPasteItems((items) => [...items, { id: crypto.randomUUID(), dataUrl: image, scale: 1, left: 80 + offset, top: 80 + offset }]);
    setFrame(null);
    setSelection(null);
    setMode("paste");
    if (isTauri()) {
      try { await getCurrentWindow().setFullscreen(false); } catch { /* already windowed */ }
    }
    await showWindow();
  }, [pasteItems.length, showWindow]);

  const openPaste = useCallback(async () => {
    try {
      const image = await command<string | null>("read_clipboard_image");
      if (!image) {
        setNotice(t("剪贴板没有图片", "No image in clipboard"));
        setTimeout(() => setNotice(""), 1800);
        return;
      }
      await pinImage(image);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [pinImage, t]);

  const pinSelection = useCallback(async () => {
    try {
      const image = await getSelectedImage();
      if (image) await pinImage(image);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [getSelectedImage, pinImage]);

  const saveSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    try {
      await command("save_settings", { settings: next });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 1800);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const listeners: Promise<UnlistenFn>[] = [
      listen("shortcut-f1", () => void startCapture()),
      listen("shortcut-f3", () => void openPaste()),
      listen("shortcut-shift-f3", () => {
        setMode((current) => {
          if (current === "paste") { void hideWindow(); return "idle"; }
          void openPaste();
          return "paste";
        });
      }),
      listen("open-settings", () => { setMode("settings"); void showWindow(); }),
      listen<AppSettings>("settings-updated", (event) => {
        if (!disposed) setSettings(event.payload);
      }),
    ];
    void command<AppSettings>("load_settings").then((loaded) => {
      if (!disposed) setSettings(loaded);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      void Promise.all(listeners).then((unlisteners) => unlisteners.forEach((unlisten) => unlisten()));
    };
  }, [hideWindow, openPaste, showWindow, startCapture]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (ocrOpen) {
          setOcrOpen(false);
          ++ocrRequest.current;
        } else if (mode === "capture") {
          void cancelCapture();
        } else if (mode === "paste") {
          setMode("idle");
          void hideWindow();
        }
      }
      if (mode === "capture" && event.key === "Enter") {
        event.preventDefault();
        void copySelection();
      }
      if (mode === "paste" && event.shiftKey && event.key === "F3") {
        event.preventDefault();
        setMode("idle");
        void hideWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelCapture, copySelection, hideWindow, mode, ocrOpen]);

  const updateSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!captureRef.current || !frame) return;
    const bounds = captureRef.current.getBoundingClientRect();
    const imageRatio = Math.min(bounds.width / frame.width, bounds.height / frame.height);
    const renderedWidth = frame.width * imageRatio;
    const renderedHeight = frame.height * imageRatio;
    const offsetX = (bounds.width - renderedWidth) / 2;
    const offsetY = (bounds.height - renderedHeight) / 2;
    const x = Math.max(0, Math.min(frame.width, (event.clientX - bounds.left - offsetX) / imageRatio));
    const y = Math.max(0, Math.min(frame.height, (event.clientY - bounds.top - offsetY) / imageRatio));
    const start = selectionStart.current;
    if (!start) return;
    setSelection({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.max(1, Math.abs(x - start.x)), height: Math.max(1, Math.abs(y - start.y)) });
  };

  const startSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!captureRef.current || !frame) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const bounds = captureRef.current.getBoundingClientRect();
    const ratio = Math.min(bounds.width / frame.width, bounds.height / frame.height);
    const ox = (bounds.width - frame.width * ratio) / 2;
    const oy = (bounds.height - frame.height * ratio) / 2;
    const x = Math.max(0, Math.min(frame.width, (event.clientX - bounds.left - ox) / ratio));
    const y = Math.max(0, Math.min(frame.height, (event.clientY - bounds.top - oy) / ratio));
    selectionStart.current = { x, y };
    setSelection({ x, y, width: 1, height: 1 });
  };

  const finishSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    selectionStart.current = null;
  };

  const selectionStyle = frame && selection ? (() => {
    const bounds = captureRef.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    const ratio = Math.min(bounds.width / frame.width, bounds.height / frame.height);
    return {
      left: `${(bounds.width - frame.width * ratio) / 2 + selection.x * ratio}px`,
      top: `${(bounds.height - frame.height * ratio) / 2 + selection.y * ratio}px`,
      width: `${selection.width * ratio}px`,
      height: `${selection.height * ratio}px`,
    };
  })() : undefined;

  const content = mode === "capture" && frame ? (
    <main className="capture-mode">
      <div
        className="capture-surface"
        ref={captureRef}
        onPointerDown={startSelection}
        onPointerMove={(event) => selection && updateSelection(event)}
        onPointerUp={finishSelection}
      >
        <img src={frame.dataUrl} className="capture-image" alt="capture preview" draggable={false} />
        <div className="capture-shade" />
        {selection && <div className="selection-box" style={selectionStyle}><span>{Math.round(selection.width)} × {Math.round(selection.height)}</span></div>}
      </div>
      <div className="capture-toolbar">
        <button className="tool-button primary" onClick={() => void copySelection()}><Icon name="copy" />{t("复制", "Copy")}</button>
        <button className="tool-button" onClick={() => void pinSelection()}><Icon name="pin" />{t("贴图", "Pin")}</button>
        <button className="tool-button" onClick={() => void runOcr()}><Icon name="ocr" />OCR</button>
        <button className="tool-button subtle" onClick={() => void saveSelection()}><Icon name="save" />{t("保存", "Save")}</button>
        <span className="toolbar-hint">{t("Enter 复制 · Esc 取消", "Enter copy · Esc cancel")}</span>
        <button className="icon-button" aria-label={t("取消", "Cancel")} onClick={() => void cancelCapture()}><Icon name="close" /></button>
      </div>
    </main>
  ) : mode === "paste" ? (
    <main className="paste-mode">
      <div className="paste-header"><span className="eyebrow">{t("贴图", "PINNED IMAGE")}</span><span className="paste-shortcut">F3 {t("继续贴图", "pin again")} · Esc {t("关闭", "close")}</span></div>
      <div className="paste-canvas">
        {pasteItems.map((item) => (
          <div
            key={item.id}
            className="paste-card"
            style={{ left: item.left, top: item.top, transform: `scale(${item.scale})` }}
            onPointerDown={(event) => {
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
              dragRef.current = { id: item.id, x: event.clientX, y: event.clientY, left: item.left, top: item.top };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.id !== item.id) return;
              setPasteItems((items) => items.map((current) => current.id === item.id ? { ...current, left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y } : current));
            }}
            onPointerUp={() => { dragRef.current = null; }}
            onWheel={(event) => {
              event.preventDefault();
              const amount = event.deltaY > 0 ? -0.08 : 0.08;
              setPasteItems((items) => items.map((current) => current.id === item.id ? { ...current, scale: Math.min(4, Math.max(0.25, current.scale + amount)) } : current));
            }}
          >
            <img src={item.dataUrl} alt={t("贴图", "Pinned image")} draggable={false} />
            <div className="paste-card-actions">
              <button onClick={() => void command("copy_image", { imageBase64: dataUrlToBase64(item.dataUrl) })} aria-label={t("复制", "Copy")}><Icon name="copy" /></button>
              <button onClick={() => void runOcr(item.dataUrl)} aria-label="OCR"><Icon name="ocr" /></button>
              <button onClick={() => setPasteItems((items) => items.filter((current) => current.id !== item.id))} aria-label={t("关闭", "Close")}><Icon name="close" /></button>
            </div>
          </div>
        ))}
        {pasteItems.length === 0 && <div className="empty-state"><Icon name="pin" /><p>{t("剪贴板中没有图片", "No image in clipboard")}</p></div>}
      </div>
    </main>
  ) : (
    <main className="home-mode">
      <header className="app-header">
        <div className="brand-mark">S</div>
        <div><strong>SnipasteVeya</strong><span>{t("轻量截图 · 贴图 · OCR", "Focused screenshot · pin · OCR")}</span></div>
        <button className="icon-button header-settings" onClick={() => { setMode("settings"); void showWindow(); }} aria-label={t("设置", "Settings")}><Icon name="settings" /></button>
      </header>
      <section className="hero-panel">
        <div className="hero-copy"><span className="eyebrow">{t("从这里开始", "START HERE")}</span><h1>{t("把屏幕变成可用的文字。", "Turn the screen into useful text.")}</h1><p>{t("只保留 F1、F3 和 OCR。按下快捷键即可开始。", "Only F1, F3 and OCR. Press a shortcut and get to work.")}</p></div>
        <div className="shortcut-stack">
          <button className="shortcut-card" onClick={() => void startCapture()}><kbd>F1</kbd><span><strong>{t("截图", "Screenshot")}</strong><small>{t("框选并复制屏幕内容", "Select and copy a region")}</small></span><Icon name="back" /></button>
          <button className="shortcut-card" onClick={() => void openPaste()}><kbd>F3</kbd><span><strong>{t("贴图", "Pin image")}</strong><small>{t("把剪贴板图片置顶", "Pin the clipboard image")}</small></span><Icon name="back" /></button>
        </div>
      </section>
      <footer className="home-footer"><span>{t("本地 OCR 默认开启，截图不会自动上传。", "Local OCR is on by default. Screenshots never upload automatically.")}</span><span className="status-dot">{t("就绪", "Ready")}</span></footer>
    </main>
  );

  return (
    <div className={`app-shell ${themeClass}`}>
      {content}
      {mode === "settings" && <SettingsPanel settings={settings} onChange={saveSettings} onClose={() => { setMode("idle"); void hideWindow(); }} t={t} saved={settingsSaved} />}
      {ocrOpen && <OcrDialog result={ocr} busy={ocrBusy} t={t} onClose={() => { setOcrOpen(false); ++ocrRequest.current; }} onCopy={(text) => void command("copy_text", { text })} onRetry={() => void runOcr()} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function SettingsPanel({ settings, onChange, onClose, t, saved }: { settings: AppSettings; onChange: (settings: AppSettings) => void; onClose: () => void; t: (zh: string, en: string) => string; saved: boolean }) {
  const [draft, setDraft] = useState(settings);
  const [providerApiKey, setProviderApiKey] = useState("");
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateProvider = (key: "name" | "baseUrl" | "model", value: string) => setDraft((current) => ({ ...current, provider: { ...current.provider, [key]: value } }));
  return <div className="settings-overlay"><section className="settings-panel">
    <header className="panel-header"><div><span className="eyebrow">SETTINGS</span><h2>{t("设置", "Settings")}</h2></div><button className="icon-button" onClick={onClose} aria-label={t("关闭", "Close")}><Icon name="close" /></button></header>
    <div className="settings-content">
      <label className="setting-row"><span><strong>{t("语言", "Language")}</strong><small>{t("界面和提示语言", "Interface language")}</small></span><select value={draft.language} onChange={(event) => update("language", event.target.value as AppSettings["language"])}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></label>
      <label className="setting-row"><span><strong>{t("主题", "Theme")}</strong><small>{t("跟随系统或固定明暗模式", "System or fixed light/dark")}</small></span><select value={draft.theme} onChange={(event) => update("theme", event.target.value as AppSettings["theme"])}><option value="system">{t("跟随系统", "System")}</option><option value="light">{t("浅色", "Light")}</option><option value="dark">{t("深色", "Dark")}</option></select></label>
      <label className="setting-row"><span><strong>{t("开机自动启动", "Start with Windows")}</strong><small>{t("启动后进入托盘，不打开主窗口", "Start in the tray")}</small></span><input type="checkbox" checked={draft.autostart} onChange={(event) => update("autostart", event.target.checked)} /></label>
      <div className="setting-group"><div><strong>{t("OCR 引擎", "OCR engine")}</strong><small>{t("本地引擎不会上传截图；云端仅按需调用", "Local stays offline; cloud runs on demand")}</small></div><div className="engine-options">{(["local", "deepseek", "openai-compatible"] as OcrEngine[]).map((engine) => <button key={engine} className={draft.ocrEngine === engine ? "engine-option selected" : "engine-option"} onClick={() => update("ocrEngine", engine)}><span>{engine === "local" ? "Local OCR" : engine === "deepseek" ? "DeepSeek" : "OpenAI compatible"}</span><small>{engine === "local" ? "PP-OCRv5 · offline" : engine === "deepseek" ? "deepseek-flash" : "Custom endpoint"}</small></button>)}</div></div>
      {draft.ocrEngine !== "local" && <div className="cloud-fields"><label><span>{t("名称", "Name")}</span><input value={draft.provider.name} onChange={(event) => updateProvider("name", event.target.value)} /></label><label><span>Base URL</span><input value={draft.provider.baseUrl} onChange={(event) => updateProvider("baseUrl", event.target.value)} /></label><label><span>Model</span><input value={draft.provider.model} onChange={(event) => updateProvider("model", event.target.value)} /></label><label><span>API Key</span><input type="password" value={providerApiKey} placeholder={draft.provider.apiKeyConfigured ? t("已保存，留空保持不变", "Saved; leave blank to keep") : t("输入后保存到 Windows 凭据", "Stored in Windows Credential Manager")} onChange={(event) => setProviderApiKey(event.target.value)} /></label></div>}
    </div>
    <footer className="panel-footer"><span className="save-hint">{saved ? t("已保存", "Saved") : t("设置会保存到当前用户", "Saved for this Windows user")}</span><button className="button primary" onClick={() => onChange({ ...draft, provider: { ...draft.provider, apiKey: providerApiKey || undefined } })}>{t("保存设置", "Save settings")}</button></footer>
  </section></div>;
}

function OcrDialog({ result, busy, t, onClose, onCopy, onRetry }: { result: OcrResult | null; busy: boolean; t: (zh: string, en: string) => string; onClose: () => void; onCopy: (text: string) => void; onRetry: () => void }) {
  const [text, setText] = useState("");
  useEffect(() => setText(result?.text ?? ""), [result?.text]);
  return <div className="dialog-backdrop"><section className="ocr-dialog"><header className="panel-header"><div><span className="eyebrow">OCR</span><h2>{t("识别结果", "Recognized text")}</h2></div><button className="icon-button" onClick={onClose} aria-label={t("关闭", "Close")}><Icon name="close" /></button></header><div className="ocr-body">{busy ? <div className="loading-state"><span className="spinner" /><p>{t("正在识别图片…", "Reading image…")}</p></div> : <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={t("没有识别到文字", "No text found")} />}</div><footer className="panel-footer"><button className="button ghost" onClick={onRetry} disabled={busy}>{t("重试", "Retry")}</button><button className="button primary" onClick={() => onCopy(text)} disabled={busy || !text}><Icon name="copy" />{t("复制文字", "Copy text")}</button></footer></section></div>;
}

export default App;
