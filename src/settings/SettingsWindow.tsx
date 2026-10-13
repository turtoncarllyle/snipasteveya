import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { command, errorText, isTauri, type Translate } from "../native";
import type { AppSettings, SettingsNavigation } from "../types";
import { CaptureIcon } from "../capture/CaptureIcon";
import { Feedback } from "../ui/Feedback";
import { SettingRow } from "./SettingRow";
import { ProviderEditor, type ProviderDraft } from "./ProviderEditor";
import { providerIsReady, saveProvider, SettingsQueue, type ShortcutKey } from "./model";
import { useShortcutRecorder } from "./useShortcutRecorder";
import { version } from "../../package.json";

export function SettingsWindow({ settings, onSaved, notice, t }: { settings: AppSettings; onSaved: (settings: AppSettings) => void; notice: string; t: Translate }) {
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const [queue] = useState(() => new SettingsQueue(settings, next => command<AppSettings>("save_settings", { settings: next }), saved => savedCallback.current(saved)));
  const { settings: current, pending, errors, saved } = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const [editor, setEditor] = useState<ProviderDraft | null>(null);
  const [actionError, setActionError] = useState("");
  const [recordErrors, setRecordErrors] = useState<Partial<Record<ShortcutKey, string>>>({});
  const engineSelect = useRef<HTMLSelectElement>(null);
  const recorder = useShortcutRecorder((key, value) => {
    setRecordErrors(previous => ({ ...previous, [key]: "" }));
    void queue.enqueue(key, latest => ({ ...latest, [key]: value }));
  }, (key, message) => setRecordErrors(previous => ({ ...previous, [key]: message })));
  useEffect(() => { queue.synchronize(settings); }, [queue, settings]);

  const openEditor = (id?: string, activate = true) => {
    const existing = current.providers.find(provider => provider.id === id);
    if (editor) {
      if (editor.value.id === id) return;
      if (!editor.exists || JSON.stringify(editor.value) !== JSON.stringify(editor.initial)) {
        setActionError(t("请先保存或取消当前服务的修改。", "Save or cancel the current provider changes first."));
        return;
      }
    }
    const value = existing ? { ...existing, apiKey: "" } : { id: crypto.randomUUID(), name: "", baseUrl: "", model: "", apiKey: "", apiKeyConfigured: false };
    setActionError("");
    queue.clearErrors("provider");
    setEditor({ value, initial: value, exists: Boolean(existing), activate });
  };
  const navigationHandler = useRef((_target: SettingsNavigation) => {});
  navigationHandler.current = target => {
    if (target.providerId) openEditor(target.providerId, current.ocrProviderId === target.providerId && current.ocrEngine !== "local");
    requestAnimationFrame(() => { engineSelect.current?.scrollIntoView({ block: "center" }); engineSelect.current?.focus({ preventScroll: true }); });
  };
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const navigate = () => {
      if (!alive) return;
      void command<SettingsNavigation | null>("take_settings_navigation").then(target => {
        if (alive && target) navigationHandler.current(target);
      }).catch(error => { if (alive) setActionError(errorText(error)); });
    };
    const listener = listen("settings-navigate", navigate);
    void listener.then(navigate).catch(error => { if (alive) setActionError(errorText(error)); });
    return () => { alive = false; void listener.then(unlisten => unlisten()).catch(() => {}); };
  }, []);
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing && isTauri()) { event.preventDefault(); void getCurrentWindow().hide().catch(error => setActionError(errorText(error))); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void queue.enqueue(key, latest => ({ ...latest, [key]: value }));
  const chooseEngine = (value: string) => {
    if (value === "add") { openEditor(); return; }
    if (value !== "local" && !providerIsReady(current.providers.find(provider => provider.id === value))) { openEditor(value); return; }
    setEditor(previous => previous ? { ...previous, activate: false } : null);
    void queue.enqueue("ocrEngine", latest => ({ ...latest, ocrEngine: value === "local" ? "local" : value === "deepseek" ? "deepseek" : "openai-compatible", ocrProviderId: value === "local" ? latest.ocrProviderId : value }));
  };
  const persistProvider = async () => {
    if (!editor || pending.has("provider")) return;
    if (await queue.enqueue("provider", latest => saveProvider(latest, editor.value, editor.activate))) setEditor(null);
  };
  const removeProvider = async () => {
    if (!editor || pending.has("provider")) return;
    const id = editor.value.id;
    if (await queue.enqueue("provider", latest => ({ ...latest, providers: latest.providers.filter(provider => provider.id !== id),
      ...(latest.ocrProviderId === id ? { ocrEngine: "local" as const, ocrProviderId: "deepseek" } : {}) }))) setEditor(null);
  };
  const invokeAction = async (name: string) => { setActionError(""); recorder.stop(); try { await command(name); } catch (error) { setActionError(errorText(error)); } };
  const resetShortcuts = async () => {
    recorder.stop(); setRecordErrors({});
    if (await queue.enqueue("shortcuts", latest => ({ ...latest, f1Shortcut: "F1", f3Shortcut: "F3" }))) queue.clearErrors("f1Shortcut", "f3Shortcut");
  };
  const selectedProvider = current.providers.find(provider => provider.id === current.ocrProviderId);
  const hasErrors = Object.values(errors).some(Boolean);

  return <main className="settings-window">
    <header className="settings-header"><h1>{t("设置", "Settings")}</h1><span className="app-name">SnipasteVeya</span></header>
    <div className="quick-actions">
      <button onClick={() => void invokeAction("start_capture")}><CaptureIcon name="capture" /><span>{t("截图", "Capture")}</span><kbd>{current.f1Shortcut}</kbd></button>
      <button onClick={() => void invokeAction("pin_clipboard")}><CaptureIcon name="pin" /><span>{t("贴图", "Pin image")}</span><kbd>{current.f3Shortcut}</kbd></button>
    </div>
    <div className="settings-body">
      {actionError && <Feedback error>{actionError}</Feedback>}
      <section className="settings-section" aria-labelledby="general-heading">
        <h2 id="general-heading">{t("常规", "General")}</h2>
        <SettingRow id="language" label={t("语言", "Language")} error={errors.language}>
          <select id="language" value={current.language} disabled={pending.has("language")} onChange={event => update("language", event.target.value as AppSettings["language"])}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select>
        </SettingRow>
        <SettingRow id="theme" label={t("外观", "Appearance")} error={errors.theme}>
          <select id="theme" value={current.theme} disabled={pending.has("theme")} onChange={event => update("theme", event.target.value as AppSettings["theme"])}><option value="system">{t("跟随系统", "System")}</option><option value="light">{t("浅色", "Light")}</option><option value="dark">{t("深色", "Dark")}</option></select>
        </SettingRow>
        <SettingRow id="autostart" label={t("开机启动", "Start with Windows")} hint={t("登录后在托盘运行", "Launch quietly in the tray")} error={errors.autostart}>
          <input id="autostart" className="switch" type="checkbox" role="switch" checked={current.autostart} disabled={pending.has("autostart")} aria-busy={pending.has("autostart")} onChange={event => update("autostart", event.target.checked)} />
        </SettingRow>
      </section>
      <section className="settings-section" aria-labelledby="shortcuts-heading">
        <div className="section-label"><h2 id="shortcuts-heading">{t("快捷键", "Shortcuts")}</h2><button className="text-button" disabled={pending.has("shortcuts") || pending.has("f1Shortcut") || pending.has("f3Shortcut")} onClick={() => void resetShortcuts()}>{t("恢复默认", "Reset")}</button></div>
        {(["f1Shortcut", "f3Shortcut"] as ShortcutKey[]).map(key => <SettingRow key={key} id={key} label={key === "f1Shortcut" ? t("截图", "Capture") : t("贴图", "Pin image")} error={recordErrors[key] || errors[key]}>
          <input id={key} className={`shortcut-input ${recorder.recording === key ? "is-recording" : ""}`} readOnly disabled={pending.has(key) || pending.has("shortcuts")}
            value={recorder.recording === key ? recorder.ready ? t("请按下快捷键…", "Press a shortcut…") : t("准备中…", "Preparing…") : current[key]}
            aria-describedby={recordErrors[key] || errors[key] ? `${key}-error` : "shortcut-hint"} title={t("点击后按下新快捷键；Esc 取消", "Click and press a shortcut; Esc cancels")}
            onFocus={() => void recorder.start(key)} onClick={() => void recorder.start(key)} onBlur={recorder.stop} onKeyDown={recorder.onKeyDown} />
        </SettingRow>)}
        {(notice || errors.shortcuts) && <Feedback error>{errors.shortcuts || notice}</Feedback>}
        <p id="shortcut-hint" className="setting-hint"><kbd>Shift+F3</kbd> {t("隐藏或显示全部贴图", "hides or shows all pins")}</p>
      </section>
      <section className="settings-section" aria-labelledby="ocr-heading">
        <h2 id="ocr-heading">{t("文字识别", "Text recognition")}</h2>
        <SettingRow id="ocr-engine" label={t("识别引擎", "OCR engine")} error={errors.ocrEngine}>
          <select ref={engineSelect} id="ocr-engine" value={current.ocrEngine === "local" ? "local" : current.ocrProviderId} disabled={pending.has("ocrEngine") || pending.has("provider")} onChange={event => chooseEngine(event.target.value)}>
            <option value="local">{t("本地 OCR · 离线", "Local OCR · offline")}</option>
            {current.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}{providerIsReady(provider) ? "" : t(" · 待配置", " · setup needed")}</option>)}
            <option value="add">{t("添加兼容服务…", "Add compatible provider…")}</option>
          </select>
        </SettingRow>
        <div className="engine-description"><p className="setting-hint">{current.ocrEngine === "local" ? t("支持中英文，图片留在设备上。", "Chinese and English. Images stay on your device.") : t("主动识别时发送图片到所选服务。", "Recognition sends the image to this provider.")}</p>
          {current.ocrEngine !== "local" && selectedProvider && <button className="text-button" onClick={() => openEditor(selectedProvider.id, false)}>{t("配置服务", "Configure")}</button>}
        </div>
        {editor && <ProviderEditor key={editor.value.id} draft={editor} pending={pending.has("provider")} error={errors.provider} t={t}
          onChange={value => setEditor(previous => previous ? { ...previous, value } : null)} onSave={() => void persistProvider()} onCancel={() => {setEditor(null);setActionError("");queue.clearErrors("provider");}} onRemove={() => void removeProvider()} />}
      </section>
    </div>
    <footer className="settings-footer"><Feedback busy={pending.size > 0}>{pending.size ? t("正在保存…", "Saving…") : hasErrors ? t("部分修改未保存", "Some changes were not saved") : saved ? t("已自动保存", "Changes saved") : t("设置自动保存", "Settings save automatically")}</Feedback><span className="version">v{version}</span></footer>
  </main>;
}
