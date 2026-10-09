import { useEffect, useState, type KeyboardEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { command, errorText, type Translate } from "../native";
import type { AppSettings, CloudProvider } from "../types";
import { CaptureIcon } from "../capture/CaptureIcon";
import { version } from "../../package.json";

export function SettingsWindow({settings, onSaved, notice, t}: {settings:AppSettings; onSaved:(settings:AppSettings) => void; notice:string; t:Translate}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const provider = draft.providers.find(provider => provider.id === draft.ocrProviderId);
  const update = <K extends keyof AppSettings>(key:K,value:AppSettings[K]) => {setDraft(current => ({...current,[key]:value}));setStatus("");};
  const updateProvider = (patch:Partial<CloudProvider>) => {
    setDraft(current => ({...current, providers:current.providers.map(item => item.id === current.ocrProviderId ? {...item,...patch} : item)}));
    setStatus("");
  };
  const save = async (autostart?:boolean) => {
    if(saving) return;
    setSaving(true);setError("");setStatus("");
    try {
      // Startup uses committed settings; unrelated edits remain in the form.
      const next = autostart === undefined ? draft : {...settings,autostart};
      const saved = await command<AppSettings>("save_settings", {settings:next});
      onSaved(saved);
      setDraft(current => autostart === undefined ? saved : {...current,autostart:saved.autostart});
      setStatus(t("已保存", "Saved"));
    } catch(error) {setError(errorText(error));}
    finally {setSaving(false);}
  };
  const recordShortcut = (event:KeyboardEvent<HTMLInputElement>, key:"f1Shortcut" | "f3Shortcut") => {
    if(event.key === "Tab" || event.key === "Escape") return;
    event.preventDefault();
    if(["Control","Alt","Shift","Meta"].includes(event.key)) return;
    const code = event.code.startsWith("Key") || event.code.startsWith("Digit") ? event.code : event.key;
    update(key,[event.ctrlKey?"Ctrl":"",event.altKey?"Alt":"",event.shiftKey?"Shift":"",event.metaKey?"Super":"",code].filter(Boolean).join("+"));
  };
  const chooseEngine = (value:string) => {
    if(value === "add") {
      const id = crypto.randomUUID();
      setDraft(current => ({...current,ocrEngine:"openai-compatible",ocrProviderId:id,providers:[...current.providers,{id,name:t("自定义服务", "Custom provider"),baseUrl:"",model:"",apiKeyConfigured:false}]}));
    } else {
      setDraft(current => ({...current,ocrEngine:value === "local" ? "local" : value === "deepseek" ? "deepseek" : "openai-compatible",ocrProviderId:value === "local" ? current.ocrProviderId : value}));
    }
    setStatus("");
  };
  useEffect(() => {
    const keydown = (event:globalThis.KeyboardEvent) => {if(event.key === "Escape") void getCurrentWindow().hide();};
    window.addEventListener("keydown",keydown);
    return () => window.removeEventListener("keydown",keydown);
  },[]);
  const invokeAction = async (name:string) => {try {await command(name);}catch(error){setError(errorText(error));}};
  return <main className="settings-window">
    <header className="settings-header"><div><h1>SnipasteVeya</h1><p>{t("截图、贴图、识别文字", "Capture, pin, recognize")}</p></div><span className="version">{version}</span></header>
    <div className="quick-actions">
      <button onClick={() => void invokeAction("start_capture")}><CaptureIcon name="shapes" /><span>{t("截图", "Capture")}</span><kbd>{settings.f1Shortcut}</kbd></button>
      <button onClick={() => void invokeAction("pin_clipboard")}><CaptureIcon name="pin" /><span>{t("贴图", "Pin image")}</span><kbd>{settings.f3Shortcut}</kbd></button>
    </div>
    <div className="settings-body">
      {notice && !error && <div className="inline-error" role="alert">{notice}</div>}
      <section className="settings-section" aria-label={t("常规", "General")}>
        <label className="setting-row"><span>{t("语言", "Language")}</span><select value={draft.language} onChange={event => update("language",event.target.value as AppSettings["language"])}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></label>
        <label className="setting-row"><span>{t("外观", "Appearance")}</span><select value={draft.theme} onChange={event => update("theme",event.target.value as AppSettings["theme"])}><option value="system">{t("跟随系统", "System")}</option><option value="light">{t("浅色", "Light")}</option><option value="dark">{t("深色", "Dark")}</option></select></label>
        <label className="setting-row"><span>{t("开机启动", "Start with Windows")}<small>{t("登录后进入托盘", "Launch quietly in the tray")}</small></span><input className="switch" type="checkbox" checked={settings.autostart} disabled={saving} onChange={event => void save(event.target.checked)} /></label>
      </section>
      <section className="settings-section" aria-label={t("快捷键", "Shortcuts")}>
        <div className="section-label"><h2>{t("快捷键", "Shortcuts")}</h2><button className="text-button" onClick={() => setDraft(current => ({...current,f1Shortcut:"F1",f3Shortcut:"F3"}))}>{t("恢复默认", "Reset")}</button></div>
        <label className="setting-row"><span>{t("截图", "Capture")}</span><input className="shortcut-input" readOnly value={draft.f1Shortcut} title={t("点击后按下新的快捷键", "Click, then press a shortcut")} onKeyDown={event => recordShortcut(event,"f1Shortcut")} /></label>
        <label className="setting-row"><span>{t("贴图", "Pin image")}</span><input className="shortcut-input" readOnly value={draft.f3Shortcut} title={t("点击后按下新的快捷键", "Click, then press a shortcut")} onKeyDown={event => recordShortcut(event,"f3Shortcut")} /></label>
        <p className="setting-hint">Shift+F3 {t("隐藏或显示全部贴图", "hides or shows all pins")}</p>
      </section>
      <section className="settings-section" aria-label="OCR">
        <label className="setting-row"><span>{t("文字识别", "Text recognition")}</span><select value={draft.ocrEngine === "local" ? "local" : draft.ocrProviderId} onChange={event => chooseEngine(event.target.value)}>
          <option value="local">{t("本地 OCR（离线）", "Local OCR (offline)")}</option>{draft.providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="add">{t("添加兼容服务…", "Add compatible provider…")}</option>
        </select></label>
        {draft.ocrEngine === "local" ? <p className="setting-hint">{t("支持中英文，图片留在设备上。", "Chinese and English. Images stay on your device.")}</p> : provider && <div className="provider-fields">
          <label><span>{t("服务名称", "Name")}</span><input value={provider.name} onChange={event => updateProvider({name:event.target.value})} /></label>
          <label><span>Base URL</span><input type="url" placeholder="https://api.example.com/v1" value={provider.baseUrl} onChange={event => updateProvider({baseUrl:event.target.value})} /></label>
          <label><span>{t("视觉模型", "Vision model")}</span><input value={provider.model} placeholder={t("支持图片输入的模型名称", "Model that accepts image input")} onChange={event => updateProvider({model:event.target.value})} /></label>
          <label><span>API Key</span><input type="password" autoComplete="off" value={provider.apiKey ?? ""} placeholder={provider.apiKeyConfigured ? t("已保存；留空保持不变", "Saved; leave blank to keep") : t("输入 API Key", "Enter API key")} onChange={event => updateProvider({apiKey:event.target.value})} /></label>
          <p className="setting-hint">{t("仅在使用此服务识别时发送图片；密钥保存在 Windows 凭据管理器。", "Images are sent only when you use this provider. Keys are stored in Windows Credential Manager.")}</p>
          {provider.id !== "deepseek" && <button className="text-button" onClick={() => {setDraft(current => ({...current,providers:current.providers.filter(item => item.id !== provider.id),ocrEngine:"local",ocrProviderId:"deepseek"}));setStatus("");}}>{t("移除此服务配置", "Remove this configuration")}</button>}
        </div>}
      </section>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
    <footer className="window-footer"><span className="feedback" role="status">{status || t("关闭窗口后继续在托盘运行", "Closing this window keeps the app in the tray")}</span><button className="primary" disabled={saving} onClick={() => void save()}>{saving ? t("保存中…", "Saving…") : t("保存设置", "Save settings")}</button></footer>
  </main>;
}
