import { useEffect, useReducer, useRef, useState } from "react";
import { command, closeWindow, errorText, imageArgs, type Translate } from "../native";
import type { AppSettings, OcrResult, WindowImage } from "../types";
import { CaptureIcon } from "../capture/CaptureIcon";
import { initialOcrState, ocrReducer } from "./state";

export function OcrWindow({settings, t}: {settings:AppSettings; t:Translate}) {
  const [state, dispatch] = useReducer(ocrReducer, initialOcrState);
  const [engine, setEngine] = useState(settings.ocrEngine === "local" ? "local" : settings.ocrProviderId);
  const [copyStatus, setCopyStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const image = useRef<string | null>(null);
  const currentJob = useRef<string | null>(null);
  const run = async (source: string, provider: string) => {
    if (currentJob.current) return;
    const job = crypto.randomUUID();
    currentJob.current = job;
    setCopyStatus("");
    dispatch({type:"start", job});
    try {
      const result = await command<OcrResult>("ocr_image", {...imageArgs(source),jobId:job,providerId:provider === "local" ? null : provider});
      if (currentJob.current === job) dispatch({type:"success",job,text:result.text,engine:result.engine});
    } catch (error) {
      if (currentJob.current === job) dispatch({type:"failure",job,error:errorText(error)});
    } finally { if (currentJob.current === job) currentJob.current = null; }
  };
  const cancel = async () => {
    const job = currentJob.current;
    if (!job) return;
    currentJob.current = null;
    dispatch({type:"cancel",job});
    try { await command("cancel_ocr", {jobId:job}); }
    catch (error) { setLoadError(errorText(error)); }
  };
  const copy = async () => {
    if (!state.text) return;
    try { await command("copy_text", {text:state.text}); setCopyStatus(t("已复制", "Copied")); }
    catch (error) { setCopyStatus(errorText(error)); }
  };
  const handlers = useRef({close:() => {}, copy:() => {}});
  handlers.current = {close:() => {void cancel().finally(() => closeWindow());}, copy:() => void copy()};
  useEffect(() => {
    let alive = true;
    void command<WindowImage>("get_window_image").then(async payload => {
      if (!alive) return;
      image.current = payload.dataUrl;
      setReady(true);
      await command("show_ready_window");
      if (alive) void run(payload.dataUrl, engine);
    }).catch(error => {if(alive){setLoadError(errorText(error));void command("show_ready_window");}});
    return () => {
      alive = false;
      const job = currentJob.current;
      currentJob.current = null;
      if (job) void command("cancel_ocr", {jobId:job}).catch(() => {});
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {event.preventDefault();handlers.current.close();}
      else if (event.ctrlKey && event.key === "Enter") {event.preventDefault();handlers.current.copy();}
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  const busy = state.status === "running";
  return <main className="ocr-window">
    <header className="ocr-header"><h1>{t("识别文字", "Recognize text")}</h1>
      <select aria-label={t("OCR 引擎", "OCR engine")} value={engine} disabled={busy} onChange={event => setEngine(event.target.value)}>
        <option value="local">{t("本地 OCR", "Local OCR")}</option>
        {settings.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
      </select>
    </header>
    <div className="ocr-status" role="status">{busy ? <><span className="spinner" />{t("正在识别…", "Recognizing…")}</> : state.status === "cancelled" ? t("已取消，图片和已有文字已保留", "Cancelled. Image and existing text are preserved.") : state.status === "done" ? state.text ? `${state.engine === "local" ? t("本地 OCR", "Local OCR") : state.engine} · ${state.text.length} ${t("字符", "characters")}` : t("没有识别到文字，可以切换引擎重试", "No text found. Try another engine.") : t("识别结果可以直接编辑", "You can edit the recognized text")}</div>
    <textarea className="ocr-text" aria-label={t("识别结果", "Recognized text")} value={state.text} spellCheck={false}
      onChange={event => {dispatch({type:"edit",text:event.target.value});setCopyStatus("");}} placeholder={t("识别结果会显示在这里", "Recognized text will appear here")} />
    {(state.error || loadError) && <div className="inline-error" role="alert">{state.error || loadError}</div>}
    {engine !== "local" && <p className="cloud-note">{t("使用此引擎识别时，会将当前图片发送到所选服务。", "Recognition sends this image to the selected provider.")}</p>}
    <footer className="window-footer"><span className="feedback" role="status">{copyStatus}</span>
      {busy ? <button onClick={() => void cancel()}>{t("取消识别", "Cancel")}</button> : <button disabled={!ready} onClick={() => {if(image.current) void run(image.current,engine);}}>{t("重新识别", "Recognize again")}</button>}
      <button className="primary" disabled={!state.text} title="Ctrl+Enter" onClick={() => void copy()}><CaptureIcon name="copy" />{t("复制文字", "Copy text")}</button>
    </footer>
  </main>;
}
