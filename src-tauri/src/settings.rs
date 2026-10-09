use crate::desktop::Action;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt as AutoStartManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const SERVICE: &str = "com.turtoncarllyle.snipasteveya";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProvider {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub language: String,
    pub theme: String,
    pub autostart: bool,
    pub f1_shortcut: String,
    pub f3_shortcut: String,
    pub ocr_engine: String,
    pub ocr_provider_id: String,
    pub providers: Vec<CloudProvider>,
    // Only read for migration from v0.1.0; never emitted after normalization.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<CloudProvider>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            theme: "system".into(),
            autostart: false,
            f1_shortcut: "F1".into(),
            f3_shortcut: "F3".into(),
            ocr_engine: "local".into(),
            ocr_provider_id: "deepseek".into(),
            providers: vec![CloudProvider {
                id: "deepseek".into(),
                name: "DeepSeek".into(),
                base_url: "https://api.deepseek.com".into(),
                model: "deepseek-flash".into(),
                api_key: None,
                api_key_configured: false,
            }],
            provider: None,
        }
    }
}

#[derive(Default)]
pub struct SettingsState {
    pub settings: Mutex<Settings>,
    pub notice: Mutex<Option<String>>,
    save_lock: tokio::sync::Mutex<()>,
}

fn config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn credential(id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("provider-{id}")).map_err(|e| e.to_string())
}

pub fn load_key(id: &str) -> Option<String> {
    credential(id).ok()?.get_password().ok()
}

fn normalize(settings: &mut Settings) -> Option<String> {
    let migrated = settings.provider.take().map(|mut legacy| {
        let is_deepseek = reqwest::Url::parse(&legacy.base_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string))
            .as_deref()
            == Some("api.deepseek.com");
        legacy.id = if is_deepseek { "deepseek" } else { "custom" }.into();
        let id = legacy.id.clone();
        settings.providers.retain(|p| p.id != id);
        settings.providers.push(legacy);
        settings.ocr_provider_id = id.clone();
        if settings.ocr_engine != "local" {
            settings.ocr_engine = if is_deepseek {
                "deepseek"
            } else {
                "openai-compatible"
            }
            .into();
        }
        id
    });
    for provider in &mut settings.providers {
        provider.api_key = None;
    }
    migrated
}

fn shortcuts(settings: &Settings) -> Result<[Shortcut; 3], String> {
    let parse = |value: &str| {
        value
            .parse::<Shortcut>()
            .map_err(|_| format!("快捷键格式无效 / Invalid shortcut: {value}"))
    };
    let result = [
        parse(&settings.f1_shortcut)?,
        parse(&settings.f3_shortcut)?,
        parse("Shift+F3")?,
    ];
    if result[0] == result[1] || result[0] == result[2] || result[1] == result[2] {
        return Err("快捷键不能重复，Shift+F3 用于显示或隐藏贴图 / Shortcuts must be distinct; Shift+F3 toggles pins".into());
    }
    Ok(result)
}

fn shortcut_notice(settings: &Settings, unavailable: &[Shortcut]) -> Option<String> {
    if unavailable.is_empty() {
        return None;
    }
    let names = unavailable
        .iter()
        .map(|key| key.into_string().replace("shift+", "Shift+"))
        .collect::<Vec<_>>()
        .join(", ");
    Some(if settings.language == "zh-CN" {
        format!(
            "快捷键 {names} 暂不可用。请修改快捷键，或关闭占用程序后重新保存。其他功能仍可使用。"
        )
    } else {
        format!("Shortcuts unavailable: {names}. Choose different keys or close the conflicting app and save again. Other features remain available.")
    })
}

fn acquire_shortcuts(
    previous: &[Shortcut],
    requested: &[Shortcut; 3],
    acquired: &mut Vec<Shortcut>,
    mut register: impl FnMut(Shortcut) -> Result<bool, ()>,
) -> Result<(), Shortcut> {
    for (index, &shortcut) in requested.iter().enumerate() {
        match register(shortcut) {
            Ok(true) => acquired.push(shortcut),
            Ok(false) => {}
            // A pre-existing conflict does not invalidate unrelated edits.
            Err(()) if previous.get(index) == Some(&shortcut) => {}
            Err(()) => return Err(shortcut),
        }
    }
    Ok(())
}

pub fn current(app: &AppHandle) -> Result<Settings, String> {
    app.state::<SettingsState>()
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|e| e.to_string())
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let path = config_file(app)?;
    let mut settings = if path.exists() {
        serde_json::from_str::<Settings>(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("配置读取失败 / Cannot read settings: {e}"))?
    } else {
        Settings::default()
    };
    if let Some(id) = normalize(&mut settings) {
        if load_key(&id).is_none() {
            if let Ok(key) =
                Entry::new(SERVICE, "cloud-api-key").and_then(|entry| entry.get_password())
            {
                credential(&id)?
                    .set_password(&key)
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    settings.autostart = app.autolaunch().is_enabled().map_err(|e| e.to_string())?;
    for provider in &mut settings.providers {
        provider.api_key_configured = load_key(&provider.id).is_some();
    }
    *app.state::<SettingsState>()
        .settings
        .lock()
        .map_err(|e| e.to_string())? = settings.clone();
    let mut unavailable = Vec::new();
    for shortcut in shortcuts(&settings)? {
        if app.global_shortcut().register(shortcut).is_err() {
            unavailable.push(shortcut);
        }
    }
    match shortcut_notice(&settings, &unavailable) {
        Some(notice) => Err(notice),
        None => Ok(()),
    }
}

pub fn shortcut_action(app: &AppHandle, shortcut: &Shortcut) -> Option<Action> {
    let settings = current(app).ok()?;
    action_for(&shortcuts(&settings).ok()?, shortcut)
}

fn action_for(keys: &[Shortcut; 3], shortcut: &Shortcut) -> Option<Action> {
    if shortcut == &keys[0] {
        Some(Action::Capture)
    } else if shortcut == &keys[1] {
        Some(Action::Pin)
    } else if shortcut == &keys[2] {
        Some(Action::TogglePins)
    } else {
        None
    }
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Settings, String> {
    current(&app)
}

#[tauri::command]
pub fn take_notice(state: tauri::State<'_, SettingsState>) -> Option<String> {
    state.notice.lock().ok()?.take()
}

fn validate(settings: &Settings) -> Result<(), String> {
    shortcuts(settings)?;
    if !["zh-CN", "en-US"].contains(&settings.language.as_str())
        || !["system", "light", "dark"].contains(&settings.theme.as_str())
    {
        return Err("语言或主题无效 / Invalid language or theme".into());
    }
    let mut ids = std::collections::HashSet::new();
    for provider in &settings.providers {
        if provider.id.is_empty()
            || !provider
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
            || !ids.insert(&provider.id)
        {
            return Err("服务标识无效 / Invalid provider ID".into());
        }
        let url = reqwest::Url::parse(&provider.base_url)
            .map_err(|_| "Base URL 无效 / Invalid Base URL".to_string())?;
        if !["http", "https"].contains(&url.scheme())
            || url.host_str().is_none()
            || provider.name.trim().is_empty()
            || provider.model.trim().is_empty()
        {
            return Err(
                "请填写服务名称、HTTP(S) 地址和模型 / Enter a name, HTTP(S) URL and model".into(),
            );
        }
    }
    if settings.ocr_engine != "local"
        && !settings
            .providers
            .iter()
            .any(|p| p.id == settings.ocr_provider_id)
    {
        return Err("请选择 OCR 服务 / Select an OCR provider".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, mut settings: Settings) -> Result<Settings, String> {
    validate(&settings)?;
    let state = app.state::<SettingsState>();
    let _save = state.save_lock.lock().await;
    let old = current(&app)?;
    let old_shortcuts = shortcuts(&old).map(Vec::from).unwrap_or_default();
    let new_shortcuts = shortcuts(&settings)?;
    let mut registered = Vec::new();
    let mut credentials_changed: Vec<(String, Option<String>)> = Vec::new();
    let old_autostart = app.autolaunch().is_enabled().map_err(|e| e.to_string())?;
    let mut autostart_changed = false;
    let result = (|| -> Result<(), String> {
        // Acquire new bindings first, keeping old bindings usable on failure.
        acquire_shortcuts(
            &old_shortcuts,
            &new_shortcuts,
            &mut registered,
            |shortcut| {
                if app.global_shortcut().is_registered(shortcut) {
                    Ok(false)
                } else {
                    app.global_shortcut()
                        .register(shortcut)
                        .map(|()| true)
                        .map_err(|_| ())
                }
            },
        )
        .map_err(|shortcut| shortcut_notice(&settings, &[shortcut]).unwrap())?;
        for provider in &mut settings.providers {
            if let Some(key) = provider.api_key.take().filter(|key| !key.trim().is_empty()) {
                let previous = load_key(&provider.id);
                credential(&provider.id)?
                    .set_password(key.trim())
                    .map_err(|e| e.to_string())?;
                credentials_changed.push((provider.id.clone(), previous));
            }
            provider.api_key_configured = load_key(&provider.id).is_some();
        }
        if settings.autostart != old_autostart {
            autostart_changed = true;
            if settings.autostart {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            }
            .map_err(|e| e.to_string())?;
        }
        let registered_autostart = app.autolaunch().is_enabled().map_err(|e| e.to_string())?;
        if registered_autostart != settings.autostart {
            return Err("启动项注册未生效 / Startup registration did not take effect".into());
        }
        settings.provider = None;
        let path = config_file(&app)?;
        let temporary = path.with_extension("json.tmp");
        std::fs::write(
            &temporary,
            serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(error) = result {
        for shortcut in registered {
            let _ = app.global_shortcut().unregister(shortcut);
        }
        let rollback = if !autostart_changed {
            Ok(())
        } else if old_autostart {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        for (id, previous) in credentials_changed {
            if let Ok(entry) = credential(&id) {
                if let Some(key) = previous {
                    let _ = entry.set_password(&key);
                } else {
                    let _ = entry.delete_credential();
                }
            }
        }
        return Err(match rollback {
            Ok(_) => error,
            Err(rollback) => {
                format!("{error}; 启动项恢复失败 / Startup rollback failed: {rollback}")
            }
        });
    }
    for shortcut in old_shortcuts {
        if !new_shortcuts.contains(&shortcut) {
            let _ = app.global_shortcut().unregister(shortcut);
        }
    }
    *state.settings.lock().map_err(|e| e.to_string())? = settings.clone();
    let unavailable = new_shortcuts
        .into_iter()
        .filter(|shortcut| !app.global_shortcut().is_registered(*shortcut))
        .collect::<Vec<_>>();
    *state.notice.lock().map_err(|e| e.to_string())? = shortcut_notice(&settings, &unavailable);
    let _ = app.emit("settings-updated", &settings);
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcut_routing_uses_identity_including_shift() {
        let keys = shortcuts(&Settings::default()).unwrap();
        assert_eq!(
            action_for(&keys, &"shift+F3".parse().unwrap()),
            Some(Action::TogglePins)
        );
        assert_eq!(action_for(&keys, &"F3".parse().unwrap()), Some(Action::Pin));
        let mut settings = Settings::default();
        settings.f1_shortcut = "F3".into();
        assert!(shortcuts(&settings).is_err());
    }
    #[test]
    fn existing_conflicts_allow_other_settings_and_available_replacements() {
        let previous = shortcuts(&Settings::default()).unwrap();
        let mut acquired = Vec::new();
        // Another screenshot app owns every default key. Saving a language or
        // autostart change must still work, with the conflict warning retained.
        assert!(acquire_shortcuts(&previous, &previous, &mut acquired, |_| Err(())).is_ok());
        assert!(acquired.is_empty());

        let mut requested = previous;
        requested[0] = "Ctrl+Alt+F1".parse().unwrap();
        assert!(
            acquire_shortcuts(&previous, &requested, &mut acquired, |key| {
                if previous.contains(&key) {
                    Err(())
                } else {
                    Ok(true)
                }
            })
            .is_ok()
        );
        assert_eq!(acquired, vec![requested[0]]);
    }
    #[test]
    fn new_conflict_rejects_save_and_keeps_acquired_keys_for_rollback() {
        let previous = shortcuts(&Settings::default()).unwrap();
        let requested = [
            "Ctrl+Alt+F1".parse().unwrap(),
            "Ctrl+Alt+F3".parse().unwrap(),
            previous[2],
        ];
        let mut acquired = Vec::new();
        let result = acquire_shortcuts(&previous, &requested, &mut acquired, |key| {
            if key == requested[1] {
                Err(())
            } else {
                Ok(true)
            }
        });
        assert_eq!(result, Err(requested[1]));
        assert_eq!(acquired, vec![requested[0]]);
    }
    #[test]
    fn legacy_custom_provider_migrates_without_becoming_deepseek() {
        let mut settings: Settings = serde_json::from_value(serde_json::json!({"ocrEngine":"openai-compatible","provider":{"name":"My model","baseUrl":"http://localhost:1234/v1","model":"vision"}})).unwrap();
        assert_eq!(normalize(&mut settings), Some("custom".into()));
        assert_eq!(settings.ocr_provider_id, "custom");
        assert!(settings
            .providers
            .iter()
            .any(|p| p.id == "deepseek" && p.base_url == "https://api.deepseek.com"));
        assert!(settings
            .providers
            .iter()
            .any(|p| p.id == "custom" && p.model == "vision"));
        assert!(settings.provider.is_none());
    }
}
