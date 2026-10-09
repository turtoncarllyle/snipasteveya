import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { command, defaultSettings, errorText, isTauri } from "./native";
import type { AppSettings } from "./types";
import { CaptureWindow } from "./capture/CaptureWindow";
import { PinWindow } from "./pin/PinWindow";
import { OcrWindow } from "./ocr/OcrWindow";
import { SettingsWindow } from "./settings/SettingsWindow";

const view = new URLSearchParams(window.location.search).get("view") ?? "settings";
document.documentElement.dataset.view = view;

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(!isTauri());
  const [notice, setNotice] = useState("");
  const t = useCallback((zh:string,en:string) => settings.language === "zh-CN" ? zh : en,[settings.language]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const listeners = [
      listen<AppSettings>("settings-updated",event => {if(!disposed)setSettings(event.payload);}),
      listen<string>("app-notice",event => {if(!disposed)setNotice(event.payload);}),
    ];
    void command<AppSettings>("load_settings").then(settings => {if(!disposed)setSettings(settings);})
      .catch(error => {if(!disposed)setNotice(errorText(error));}).finally(() => {if(!disposed)setLoaded(true);});
    if(view === "settings") void command<string | null>("take_notice").then(notice => {if(!disposed && notice)setNotice(notice);});
    return () => {disposed=true;void Promise.all(listeners).then(unlisten => unlisten.forEach(fn => fn()));};
  }, []);
  return <div className={`app-shell theme-${settings.theme}`}>
    {!loaded ? <div className="window-loading">{t("正在加载…", "Loading…")}</div> :
      view === "capture" ? <CaptureWindow t={t} /> : view === "pin" ? <PinWindow t={t} /> :
      view === "ocr" ? <OcrWindow settings={settings} t={t} /> :
      <SettingsWindow settings={settings} onSaved={saved => {
        setSettings(saved);
        void command<string | null>("take_notice").then(notice => setNotice(notice ?? ""))
          .catch(error => setNotice(errorText(error)));
      }} notice={notice} t={t} />}
  </div>;
}
