import { useEffect, useReducer, useRef, useState } from "react";
import { command, closeWindow, errorText, imageArgs, type Translate } from "../native";
import type { AppSettings, OcrResult, WindowImage } from "../types";
import { CaptureIcon } from "../capture/CaptureIcon";
import { Feedback } from "../ui/Feedback";
import { providerIsReady } from "../settings/model";
import { initialOcrState, ocrReducer } from "./state";

export function OcrWindow({ settings, t }: { settings: AppSettings; t: Translate }) {
  const [state, dispatch] = useReducer(ocrReducer, initialOcrState);
  const [engine, setEngine] = useState(settings.ocrEngine === "local" ? "local" : settings.ocrProviderId);
  const [copyStatus, setCopyStatus] = useState({ text: "", error: false });
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const image = useRef<string | null>(null);
  const currentJob = useRef<string | null>(null);
  const mounted = useRef(false);
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const provider = settings.providers.find(item => item.id === engine);
  const needsConfiguration = engine !== "local" && !providerIsReady(provider);
  const busy = state.status === "running";

  const run = async (source: string, selected: string) => {
    if (currentJob.current || !mounted.current) return;
    if (selected !== "local" && !providerIsReady(latestSettings.current.providers.find(item => item.id === selected))) return;
    const job = crypto.randomUUID();
    currentJob.current = job;
    setCopyStatus({ text: "", error: false }); setLoadError("");
    dispatch({ type: "start", job });
    try {
      const result = await command<OcrResult>("ocr_image", { ...imageArgs(source), jobId: job, providerId: selected === "local" ? null : selected });
      if (mounted.current && currentJob.current === job) dispatch({ type: "success", job, text: result.text, engine: result.engine });
    } catch (error) {
      if (mounted.current && currentJob.current === job) dispatch({ type: "failure", job, error: errorText(error) });
    } finally { if (currentJob.current === job) currentJob.current = null; }
  };
  const cancel = async () => {
    const job = currentJob.current;
    if (!job) return;
    currentJob.current = null;
    dispatch({ type: "cancel", job });
    try { await command("cancel_ocr", { jobId: job }); }
    catch (error) { if (mounted.current) setLoadError(errorText(error)); }
  };
  const copy = async () => {
    if (!state.text) return;
    try { await command("copy_text", { text: state.text }); if (mounted.current) setCopyStatus({ text: t("已复制", "Copied"), error: false }); }
    catch (error) { if (mounted.current) setCopyStatus({ text: errorText(error), error: true }); }
  };
  const handlers = useRef({ close: () => {}, copy: () => {} });
  handlers.current = { close: () => { void cancel().then(() => closeWindow()).catch(error => { if (mounted.current) setLoadError(errorText(error)); }); }, copy: () => void copy() };
  useEffect(() => {
    let alive = true; mounted.current = true;
    void command<WindowImage>("get_window_image").then(async payload => {
      if (!alive) return;
      image.current = payload.dataUrl; setReady(true);
      await command("show_ready_window");
      if (alive) void run(payload.dataUrl, engine);
    }).catch(error => { if (alive) { setLoadError(errorText(error)); void command("show_ready_window").catch(() => {}); } });
    return () => {
      alive = false; mounted.current = false;
      const job = currentJob.current; currentJob.current = null;
      if (job) void command("cancel_ocr", { jobId: job }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); handlers.current.close(); }
      else if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); handlers.current.copy(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (!copyStatus.text || copyStatus.error) return;
    const timer = setTimeout(() => setCopyStatus({ text: "", error: false }), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);
  const error = loadError || state.error;
  const status = busy ? t("正在识别…", "Recognizing…")
    : error || (needsConfiguration ? t("此服务尚未配置完成。", "This provider needs configuration.")
      : state.status === "cancelled" ? t("已取消，可以重新识别。", "Cancelled. You can recognize again.")
      : state.status === "done" ? state.text ? `${state.text.length} ${t("字符 · 可直接编辑", "characters · editable")}` : t("未识别到文字，可更换引擎重试。", "No text found. Try another engine.")
      : t("识别结果可以直接编辑", "You can edit the recognized text"));
  const configure = () => void command("open_settings", { section: "ocr", providerId: provider?.id }).catch(error => setLoadError(errorText(error)));

  return <main className="ocr-window">
    <header className="ocr-header"><h1>{t("文字识别", "Text recognition")}</h1>
      <select aria-label={t("OCR 引擎", "OCR engine")} value={engine} disabled={busy} onChange={event => { setEngine(event.target.value); setLoadError(""); }}>
        <option value="local">{t("本地 OCR", "Local OCR")}</option>
        {settings.providers.map(item => <option key={item.id} value={item.id}>{item.name}{providerIsReady(item) ? "" : t(" · 待配置", " · setup needed")}</option>)}
        {engine !== "local" && !provider && <option value={engine} disabled>{t("服务已移除", "Provider removed")}</option>}
      </select>
    </header>
    <div className="ocr-status">
      <Feedback busy={busy} error={Boolean(error)}>{status}{needsConfiguration && !busy && <button className="text-button" onClick={configure}>{t("配置服务", "Configure provider")}</button>}</Feedback>
      <p className="ocr-source">{engine === "local" ? t("本地处理 · 中英文识别", "On-device · Chinese and English") : t("点击识别时，将当前图片发送到所选服务。", "Recognition sends this image to the selected provider.")}</p>
    </div>
    <textarea className="ocr-text" aria-label={t("识别结果", "Recognized text")} aria-busy={busy} readOnly={busy} value={state.text} spellCheck={false}
      onChange={event => { dispatch({ type: "edit", text: event.target.value }); setCopyStatus({ text: "", error: false }); }} placeholder={busy ? t("正在读取图片中的文字…", "Reading text from the image…") : t("识别结果会显示在这里", "Recognized text will appear here")} />
    <footer className="window-footer"><Feedback error={copyStatus.error}>{copyStatus.text}</Feedback>
      {busy ? <button onClick={() => void cancel()}>{t("取消识别", "Cancel")}</button> : <button disabled={!ready || needsConfiguration} onClick={() => { if (image.current) void run(image.current, engine); }}>{t("重新识别", "Recognize again")}</button>}
      <button className="primary" disabled={!state.text} onClick={() => void copy()} title="Ctrl+Enter"><CaptureIcon name="copy" />{t("复制文字", "Copy text")}<kbd>Ctrl+Enter</kbd></button>
    </footer>
  </main>;
}
