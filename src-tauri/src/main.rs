#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{DynamicImage, ImageFormat};
use keyring::Entry;
use reqwest::Client;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, io::Cursor, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt as AutoStartManagerExt;
use tauri_plugin_global_shortcut::{ShortcutEvent, ShortcutState};

#[cfg(feature = "local-ocr")]
use oar_ocr::prelude::OAROCRBuilder;

const APP_SERVICE: &str = "com.turtoncarllyle.snipasteveya";
const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProvider {
    pub name: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub language: String,
    pub theme: String,
    pub autostart: bool,
    pub f1_shortcut: String,
    pub f3_shortcut: String,
    pub ocr_engine: String,
    pub provider: CloudProvider,
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
            provider: CloudProvider {
                name: "DeepSeek".into(),
                base_url: "https://api.deepseek.com".into(),
                model: "deepseek-flash".into(),
                api_key: None,
                api_key_configured: false,
            },
        }
    }
}

#[derive(Default)]
pub struct AppState {
    pub settings: Mutex<Settings>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFrame {
    pub id: String,
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub engine: String,
    pub confidence: Option<f32>,
}

fn app_config_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SETTINGS_FILE))
}

fn png_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(bytes))
}

fn decode_image(base64: &str) -> Result<DynamicImage, String> {
    let bytes = BASE64.decode(base64).map_err(|e| format!("图片数据无效: {e}"))?;
    image::load_from_memory(&bytes).map_err(|e| format!("无法读取图片: {e}"))
}

fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| format!("编码图片失败: {e}"))?;
    Ok(output.into_inner())
}

fn credential_entry() -> Result<Entry, String> {
    Entry::new(APP_SERVICE, "cloud-api-key").map_err(|e| e.to_string())
}

fn load_cloud_key() -> Option<String> {
    credential_entry().ok()?.get_password().ok()
}

fn save_cloud_key(value: Option<&str>) -> Result<(), String> {
    let entry = credential_entry()?;
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(key) => entry.set_password(key).map_err(|e| e.to_string()),
        None => entry.delete_credential().map_err(|e| e.to_string()),
    }
}

fn active_screen() -> Result<Screen, String> {
    #[cfg(windows)]
    {
        let mut point = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
        if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) } != 0 {
            if let Ok(screen) = Screen::from_point(point.x, point.y) {
                return Ok(screen);
            }
        }
    }
    Screen::all().map_err(|e| format!("无法读取显示器: {e}"))?.into_iter().next().ok_or_else(|| "没有可用的显示器".to_string())
}

#[tauri::command]
fn capture_screen() -> Result<CaptureFrame, String> {
    let screen = active_screen()?;
    let display = screen.display_info;
    let image = screen.capture().map_err(|e| format!("截图失败: {e}"))?;
    let width = image.width();
    let height = image.height();
    let mut encoded = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(image)
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|e| format!("编码截图失败: {e}"))?;
    Ok(CaptureFrame {
        id: uuid::Uuid::new_v4().to_string(),
        data_url: png_data_url(&encoded.into_inner()),
        width,
        height,
        x: display.x,
        y: display.y,
    })
}

#[tauri::command]
fn crop_capture(image_base64: String, rect: CropRect, source_width: u32, source_height: u32) -> Result<String, String> {
    let image = decode_image(&image_base64)?;
    let actual_width = image.width().min(source_width.max(1));
    let actual_height = image.height().min(source_height.max(1));
    let x = rect.x.round().clamp(0.0, actual_width.saturating_sub(1) as f64) as u32;
    let y = rect.y.round().clamp(0.0, actual_height.saturating_sub(1) as f64) as u32;
    let width = rect.width.round().max(1.0).min((actual_width - x) as f64) as u32;
    let height = rect.height.round().max(1.0).min((actual_height - y) as f64) as u32;
    Ok(png_data_url(&encode_png(&image.crop_imm(x, y, width, height))?))
}

#[tauri::command]
fn copy_image(image_base64: String) -> Result<(), String> {
    let image = decode_image(&image_base64)?.to_rgba8();
    Clipboard::new().map_err(|e| format!("无法打开剪贴板: {e}"))?.set_image(ImageData {
        width: image.width() as usize,
        height: image.height() as usize,
        bytes: Cow::Owned(image.into_raw()),
    }).map_err(|e| format!("复制图片失败: {e}"))
}

#[tauri::command]
fn read_clipboard_image() -> Result<Option<String>, String> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("无法打开剪贴板: {e}"))?;
    let image = match clipboard.get_image() {
        Ok(image) => image,
        Err(_) => return Ok(None),
    };
    let rgba = image::RgbaImage::from_raw(image.width as u32, image.height as u32, image.bytes.into_owned())
        .ok_or_else(|| "剪贴板图片数据无效".to_string())?;
    Ok(Some(png_data_url(&encode_png(&DynamicImage::ImageRgba8(rgba))?)))
}

#[tauri::command]
fn save_image(image_base64: String) -> Result<String, String> {
    let image = decode_image(&image_base64)?;
    let Some(path) = rfd::FileDialog::new().set_title("保存截图 / Save screenshot").add_filter("PNG image", &["png"]).set_file_name("SnipasteVeya-capture.png").save_file() else {
        return Ok(String::new());
    };
    image.save_with_format(&path, ImageFormat::Png).map_err(|e| format!("保存失败: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    Clipboard::new().map_err(|e| format!("无法打开剪贴板: {e}"))?.set_text(text).map_err(|e| format!("复制文字失败: {e}"))
}

#[tauri::command]
fn load_settings<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<Settings, String> {
    let path = app_config_file(&app)?;
    let mut settings = if path.exists() {
        serde_json::from_str::<Settings>(&std::fs::read_to_string(path).map_err(|e| e.to_string())?).unwrap_or_default()
    } else { Settings::default() };
    settings.provider.api_key = None;
    settings.provider.api_key_configured = load_cloud_key().is_some();
    *state.settings.lock().map_err(|_| "设置锁已损坏".to_string())? = settings.clone();
    Ok(settings)
}

#[tauri::command]
fn save_settings<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>, mut settings: Settings) -> Result<Settings, String> {
    if let Some(key) = settings.provider.api_key.as_deref() { save_cloud_key(Some(key))?; }
    settings.provider.api_key = None;
    settings.provider.api_key_configured = load_cloud_key().is_some();
    let path = app_config_file(&app)?;
    std::fs::write(path, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if settings.autostart { app.autolaunch().enable().map_err(|e| e.to_string())?; } else { app.autolaunch().disable().map_err(|e| e.to_string())?; }
    *state.settings.lock().map_err(|_| "设置锁已损坏".to_string())? = settings.clone();
    let _ = app.emit("settings-updated", settings.clone());
    Ok(settings)
}

async fn cloud_ocr(image_base64: &str, provider: &CloudProvider) -> Result<String, String> {
    let api_key = provider.api_key.clone().filter(|key| !key.trim().is_empty()).or_else(load_cloud_key).ok_or_else(|| "请先在设置中填写 API Key".to_string())?;
    let endpoint = format!("{}/chat/completions", provider.base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": provider.model,
        "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "请识别图片中的全部文字，保持原有换行和段落，只返回识别到的文字，不要解释。"},
            {"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{image_base64}")}}
        ]}]
    });
    let response = Client::new().post(endpoint).bearer_auth(api_key).json(&body).timeout(Duration::from_secs(45)).send().await.map_err(|e| format!("云端 OCR 请求失败: {e}"))?;
    let status = response.status();
    let value: serde_json::Value = response.json().await.map_err(|e| format!("云端 OCR 响应无效: {e}"))?;
    if !status.is_success() {
        let message = value.get("error").and_then(|error| error.get("message")).and_then(serde_json::Value::as_str).unwrap_or("服务返回错误");
        return Err(format!("云端 OCR ({})：{}", status.as_u16(), message));
    }
    value.get("choices").and_then(|choices| choices.get(0)).and_then(|choice| choice.get("message")).and_then(|message| message.get("content")).and_then(serde_json::Value::as_str).map(str::to_string).ok_or_else(|| "云端 OCR 没有返回文字".to_string())
}

#[cfg(feature = "local-ocr")]
fn local_ocr(image_base64: &str) -> Result<(String, Option<f32>), String> {
    let bytes = BASE64.decode(image_base64).map_err(|e| format!("图片数据无效: {e}"))?;
    let image = image25::load_from_memory(&bytes).map_err(|e| format!("无法读取图片: {e}"))?.to_rgb8();
    let image = if image.width() > 2400 { image25::imageops::resize(&image, 2400, (image.height() as f64 * 2400.0 / image.width() as f64) as u32, image25::imageops::FilterType::Lanczos3) } else { image };
    let ocr = OAROCRBuilder::new("pp-ocrv5_mobile_det.onnx", "pp-ocrv5_mobile_rec.onnx", "ppocrv5_dict.txt").image_batch_size(1).region_batch_size(8).build().map_err(|e| format!("本地 OCR 引擎初始化失败: {e}"))?;
    let result = ocr.predict(vec![image]).map_err(|e| format!("本地 OCR 失败: {e}"))?.into_iter().next().ok_or_else(|| "本地 OCR 没有结果".to_string())?;
    Ok((result.concatenated_text("\n"), result.average_confidence()))
}

#[cfg(not(feature = "local-ocr"))]
fn local_ocr(_image_base64: &str) -> Result<(String, Option<f32>), String> {
    Err("本地 OCR 引擎未编译".to_string())
}

#[tauri::command]
async fn ocr_image(image_base64: String, engine: String, provider: CloudProvider) -> Result<OcrResult, String> {
    if engine == "local" {
        let (text, confidence) = tauri::async_runtime::spawn_blocking(move || local_ocr(&image_base64)).await.map_err(|e| e.to_string())??;
        return Ok(OcrResult { text, engine, confidence });
    }
    let text = cloud_ocr(&image_base64, &provider).await?;
    Ok(OcrResult { text, engine, confidence: None })
}

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
}

fn main() {
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new().with_shortcuts(["F1", "F3", "SHIFT+F3"]).expect("invalid default shortcuts").with_handler(|app, shortcut, event: ShortcutEvent| {
        if event.state != ShortcutState::Pressed { return; }
        let name = shortcut.into_string();
        show_main(app);
        let _ = app.emit(if name == "F1" { "shortcut-f1" } else if name == "SHIFT+F3" { "shortcut-shift-f3" } else { "shortcut-f3" }, ());
    }).build();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(shortcut_plugin)
        .invoke_handler(tauri::generate_handler![capture_screen, crop_capture, copy_image, read_clipboard_image, save_image, copy_text, load_settings, save_settings, ocr_image])
        .setup(|app| {
            if let Ok(resource_dir) = app.path().resource_dir() {
                let ocr_dir = resource_dir.join("ocr");
                let _ = std::fs::create_dir_all(&ocr_dir);
                std::env::set_var("OAR_HOME", ocr_dir);
            }
            let screenshot_item = MenuItemBuilder::with_id("screenshot", "截图 / Screenshot").build(app)?;
            let paste_item = MenuItemBuilder::with_id("paste", "贴图 / Pin image").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "设置 / Settings").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出 / Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&screenshot_item, &paste_item, &settings_item, &quit_item]).build()?;
            let mut tray = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.menu(&menu).tooltip("SnipasteVeya").on_menu_event(|app, event| match event.id().as_ref() {
                "screenshot" => { let _ = app.emit("shortcut-f1", ()); show_main(app); }
                "paste" => { let _ = app.emit("shortcut-f3", ()); show_main(app); }
                "settings" => { let _ = app.emit("open-settings", ()); show_main(app); }
                "quit" => app.exit(0),
                _ => {}
            }).build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SnipasteVeya");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_round_trip_keeps_crop_dimensions() {
        let mut image = image::RgbaImage::new(12, 8);
        for pixel in image.pixels_mut() { *pixel = image::Rgba([30, 100, 200, 255]); }
        let data = BASE64.encode(encode_png(&DynamicImage::ImageRgba8(image)).expect("png"));
        let cropped = crop_capture(data, CropRect { x: 2.0, y: 1.0, width: 5.0, height: 4.0 }, 12, 8).expect("crop");
        let bytes = BASE64.decode(cropped.trim_start_matches("data:image/png;base64,")).expect("base64");
        let result = image::load_from_memory(&bytes).expect("decode");
        assert_eq!((result.width(), result.height()), (5, 4));
    }

    #[test]
    fn default_settings_keep_local_ocr_and_shortcuts() {
        let settings = Settings::default();
        assert_eq!(settings.ocr_engine, "local");
        assert_eq!(settings.f1_shortcut, "F1");
        assert_eq!(settings.f3_shortcut, "F3");
        assert!(!settings.autostart);
    }
}
