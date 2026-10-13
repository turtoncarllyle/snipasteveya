#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
mod ocr;
mod settings;

use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, io::Cursor};
use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn png_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(bytes))
}

fn decode_image(base64: &str) -> Result<DynamicImage, String> {
    let bytes = BASE64
        .decode(base64.trim_start_matches("data:image/png;base64,"))
        .map_err(|e| format!("图片数据无效 / Invalid image: {e}"))?;
    image::load_from_memory(&bytes).map_err(|e| format!("无法读取图片 / Cannot read image: {e}"))
}

fn encode_png(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(output.into_inner())
}

fn crop_image(image: &DynamicImage, rect: CropRect) -> Result<String, String> {
    if ![rect.x, rect.y, rect.width, rect.height]
        .iter()
        .all(|n| n.is_finite())
        || rect.width <= 0.0
        || rect.height <= 0.0
    {
        return Err("选区无效 / Invalid selection".into());
    }
    let x = rect
        .x
        .round()
        .clamp(0.0, image.width().saturating_sub(1) as f64) as u32;
    let y = rect
        .y
        .round()
        .clamp(0.0, image.height().saturating_sub(1) as f64) as u32;
    let width = rect.width.round().max(1.0).min((image.width() - x) as f64) as u32;
    let height = rect
        .height
        .round()
        .max(1.0)
        .min((image.height() - y) as f64) as u32;
    Ok(png_data_url(&encode_png(
        &image.crop_imm(x, y, width, height),
    )?))
}

#[tauri::command]
fn copy_image(image_base64: String) -> Result<(), String> {
    let image = decode_image(&image_base64)?.to_rgba8();
    Clipboard::new()
        .map_err(|e| format!("无法打开剪贴板 / Cannot open clipboard: {e}"))?
        .set_image(ImageData {
            width: image.width() as usize,
            height: image.height() as usize,
            bytes: Cow::Owned(image.into_raw()),
        })
        .map_err(|e| format!("复制失败 / Copy failed: {e}"))
}

fn read_clipboard_image() -> Result<Option<String>, String> {
    let mut clipboard =
        Clipboard::new().map_err(|e| format!("无法打开剪贴板 / Cannot open clipboard: {e}"))?;
    let image = match clipboard.get_image() {
        Ok(image) => image,
        Err(arboard::Error::ContentNotAvailable) => return Ok(None),
        Err(error) => {
            return Err(format!(
                "剪贴板暂不可用，请重试 / Clipboard unavailable, try again: {error}"
            ))
        }
    };
    let rgba = image::RgbaImage::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.into_owned(),
    )
    .ok_or_else(|| "剪贴板图片数据无效 / Invalid clipboard image".to_string())?;
    Ok(Some(png_data_url(&encode_png(&DynamicImage::ImageRgba8(
        rgba,
    ))?)))
}

#[tauri::command]
async fn save_image(window: WebviewWindow, image_base64: String) -> Result<bool, String> {
    let image = decode_image(&image_base64)?;
    let path = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title("保存图片 / Save image")
        .add_filter("PNG", &["png"])
        .set_file_name("SnipasteVeya.png")
        .save_file()
        .await;
    let Some(path) = path else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        image
            .save_with_format(path.path(), ImageFormat::Png)
            .map_err(|e| format!("保存失败 / Save failed: {e}"))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(true)
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    Clipboard::new()
        .map_err(|e| e.to_string())?
        .set_text(text)
        .map_err(|e| format!("复制失败 / Copy failed: {e}"))
}

fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn notify_error(app: &AppHandle, message: String) {
    if let Ok(mut notice) = app.state::<settings::SettingsState>().notice.lock() {
        *notice = Some(message.clone());
    }
    show_settings(app);
    let _ = app.emit_to("main", "app-notice", message);
}

fn tray_menu(app: &AppHandle, settings: &settings::Settings) -> tauri::Result<Menu<tauri::Wry>> {
    let zh = settings.language == "zh-CN";
    let screenshot = MenuItemBuilder::with_id(
        "screenshot",
        format!(
            "{}   {}",
            if zh { "截图" } else { "Capture" },
            settings.f1_shortcut
        ),
    )
    .build(app)?;
    let pin = MenuItemBuilder::with_id(
        "paste",
        format!(
            "{}   {}",
            if zh { "贴图" } else { "Pin image" },
            settings.f3_shortcut
        ),
    )
    .build(app)?;
    let preferences =
        MenuItemBuilder::with_id("settings", if zh { "设置" } else { "Settings" }).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", if zh { "退出" } else { "Quit" }).build(app)?;
    MenuBuilder::new(app)
        .items(&[&screenshot, &pin])
        .separator()
        .items(&[&preferences, &quit])
        .build()
}

fn refresh_interface(app: &AppHandle, settings: &settings::Settings) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(tray_menu(app, settings)?))?;
        tray.set_tooltip(Some(format!(
            "SnipasteVeya · {} / {}",
            settings.f1_shortcut, settings.f3_shortcut
        )))?;
    }
    for (_, window) in app.webview_windows() {
        apply_window_appearance(&window, settings)?;
    }
    Ok(())
}

fn apply_window_appearance(
    window: &WebviewWindow,
    settings: &settings::Settings,
) -> tauri::Result<()> {
    let theme = match settings.theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    let zh = settings.language == "zh-CN";
    window.set_theme(theme)?;
    if window.label() == "main" {
        window.set_title(if zh {
            "SnipasteVeya · 设置"
        } else {
            "SnipasteVeya · Settings"
        })?;
    } else if window.label().starts_with("ocr-") {
        window.set_title(if zh {
            "SnipasteVeya · 文字识别"
        } else {
            "SnipasteVeya · Text recognition"
        })?;
    }
    Ok(())
}

fn main() {
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if settings::route_shortcut_recording(
                app,
                *shortcut,
                event.state == ShortcutState::Pressed,
            ) {
                return;
            }
            if event.state != ShortcutState::Pressed {
                return;
            }
            if let Some(action) = settings::shortcut_action(app, shortcut) {
                desktop::dispatch(app, action);
            }
        })
        .build();

    tauri::Builder::default()
        .manage(settings::SettingsState::default())
        .manage(desktop::DesktopState::default())
        .manage(ocr::OcrState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_settings(app)
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(shortcut_plugin)
        .invoke_handler(tauri::generate_handler![
            copy_image,
            save_image,
            copy_text,
            settings::load_settings,
            settings::save_settings,
            settings::take_notice,
            settings::set_shortcut_recording,
            settings::take_settings_navigation,
            desktop::start_capture,
            desktop::get_capture,
            desktop::crop_capture,
            desktop::finish_capture,
            desktop::pin_clipboard,
            desktop::pin_image,
            desktop::toggle_pins,
            desktop::get_window_image,
            desktop::show_ready_window,
            desktop::resize_pin,
            desktop::open_ocr,
            desktop::open_settings,
            ocr::ocr_image,
            ocr::cancel_ocr
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                settings::stop_shortcut_recording(window.app_handle());
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "main" => {
                settings::stop_shortcut_recording(window.app_handle());
            }
            WindowEvent::Destroyed => {
                desktop::window_destroyed(window.app_handle(), window.label());
                ocr::cancel_window_jobs(window.app_handle(), window.label());
            }
            _ => {}
        })
        .setup(|app| {
            if let Ok(resource_dir) = app.path().resource_dir() {
                let bundled = resource_dir.join("resources").join("ocr");
                let legacy = resource_dir.join("ocr");
                let root = if bundled.exists() { bundled } else { legacy };
                #[cfg(debug_assertions)]
                let root = if root.exists() {
                    root
                } else {
                    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ocr")
                };
                std::env::set_var("OAR_HOME", root);
            }
            let menu = tray_menu(app.handle(), &settings::Settings::default())?;
            let mut tray = TrayIconBuilder::with_id("main-tray");
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("SnipasteVeya · F1 / F3")
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => desktop::dispatch(tray.app_handle(), desktop::Action::Capture),
                    TrayIconEvent::Click {
                        button: MouseButton::Middle,
                        button_state: MouseButtonState::Up,
                        ..
                    } => desktop::dispatch(tray.app_handle(), desktop::Action::Pin),
                    _ => {}
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "screenshot" => desktop::dispatch(app, desktop::Action::Capture),
                    "paste" => desktop::dispatch(app, desktop::Action::Pin),
                    "settings" => show_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            if let Err(error) = settings::initialize(app.handle()) {
                notify_error(app.handle(), error);
            }
            refresh_interface(app.handle(), &settings::current(app.handle())?)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SnipasteVeya");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crop_round_trip_and_bounds() {
        let image = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            12,
            8,
            image::Rgba([30, 100, 200, 255]),
        ));
        let result = crop_image(
            &image,
            CropRect {
                x: 2.0,
                y: 1.0,
                width: 5.0,
                height: 4.0,
            },
        )
        .unwrap();
        let decoded = decode_image(&result).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (5, 4));
        assert_eq!(decoded.to_rgba8().get_pixel(0, 0).0, [30, 100, 200, 255]);
        let edge = decode_image(
            &crop_image(
                &image,
                CropRect {
                    x: 11.8,
                    y: 7.9,
                    width: 99.0,
                    height: 99.0,
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!((edge.width(), edge.height()), (1, 1));
        assert!(crop_image(
            &image,
            CropRect {
                x: f64::NAN,
                y: 0.0,
                width: 10.0,
                height: 10.0
            }
        )
        .is_err());
    }
}
