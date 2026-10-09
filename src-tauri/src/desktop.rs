use crate::{
    crop_image, decode_image, encode_png, notify_error, png_data_url, read_clipboard_image,
    CropRect,
};
use image::DynamicImage;
use screenshots::Screen;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Action {
    Capture,
    Pin,
    TogglePins,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFrame {
    id: String,
    data_url: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    window_targets: Vec<CropRect>,
    previous_selection: Option<CropRect>,
}

struct CaptureSession {
    frame: CaptureFrame,
    pixels: DynamicImage,
    previous_window: isize,
    restore_focus: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowImage {
    data_url: String,
    width: u32,
    height: u32,
    scale: f64,
}
struct ImageEntry {
    image: WindowImage,
    ready: bool,
}

#[derive(Default)]
pub struct DesktopState {
    capture: Mutex<Option<CaptureSession>>,
    starting: AtomicBool,
    images: Mutex<HashMap<String, ImageEntry>>,
    pins_hidden: AtomicBool,
    last_selection: Mutex<Option<CropRect>>,
}

pub fn dispatch(app: &AppHandle, action: Action) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = match action {
            Action::Capture => start_capture(app.clone()).await,
            Action::Pin => pin_clipboard(app.clone()).await.map(|_| ()),
            Action::TogglePins => toggle_pins(app.clone()),
        };
        if let Err(error) = result {
            notify_error(&app, error);
        }
    });
}

fn cursor() -> (i32, i32) {
    #[cfg(windows)]
    unsafe {
        let mut point = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
        windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point);
        return (point.x, point.y);
    }
    #[cfg(not(windows))]
    {
        (0, 0)
    }
}

fn foreground() -> isize {
    #[cfg(windows)]
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as isize
    }
    #[cfg(not(windows))]
    {
        0
    }
}

fn restore_foreground(handle: isize) {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            IsWindow, IsWindowVisible, SetForegroundWindow,
        };
        let window = handle as windows_sys::Win32::Foundation::HWND;
        if handle != 0 && IsWindow(window) != 0 && IsWindowVisible(window) != 0 {
            SetForegroundWindow(window);
        }
    }
}

fn window_targets(screen: CropRect) -> Vec<CropRect> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::{HWND, LPARAM, RECT},
            Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS},
            System::Threading::GetCurrentProcessId,
            UI::WindowsAndMessaging::*,
        };
        unsafe extern "system" fn visit(window: HWND, data: LPARAM) -> i32 {
            let list = &mut *(data as *mut Vec<CropRect>);
            let mut process = 0;
            GetWindowThreadProcessId(window, &mut process);
            if process == GetCurrentProcessId()
                || IsWindowVisible(window) == 0
                || IsIconic(window) != 0
            {
                return 1;
            }
            let mut cloaked: u32 = 0;
            DwmGetWindowAttribute(
                window,
                DWMWA_CLOAKED as u32,
                &mut cloaked as *mut _ as _,
                std::mem::size_of::<u32>() as u32,
            );
            if cloaked != 0 {
                return 1;
            }
            let mut rect = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if DwmGetWindowAttribute(
                window,
                DWMWA_EXTENDED_FRAME_BOUNDS as u32,
                &mut rect as *mut _ as _,
                std::mem::size_of::<RECT>() as u32,
            ) < 0
            {
                GetWindowRect(window, &mut rect);
            }
            if rect.right > rect.left && rect.bottom > rect.top {
                list.push(CropRect {
                    x: rect.left as f64,
                    y: rect.top as f64,
                    width: (rect.right - rect.left) as f64,
                    height: (rect.bottom - rect.top) as f64,
                });
            }
            1
        }
        let mut windows = Vec::new();
        unsafe {
            EnumWindows(Some(visit), &mut windows as *mut Vec<CropRect> as isize);
        }
        windows
            .into_iter()
            .filter_map(|rect| intersect_relative(rect, screen))
            .collect()
    }
    #[cfg(not(windows))]
    {
        let _ = screen;
        Vec::new()
    }
}

fn intersect_relative(rect: CropRect, screen: CropRect) -> Option<CropRect> {
    let x = rect.x.max(screen.x);
    let y = rect.y.max(screen.y);
    let right = (rect.x + rect.width).min(screen.x + screen.width);
    let bottom = (rect.y + rect.height).min(screen.y + screen.height);
    (right - x >= 2.0 && bottom - y >= 2.0).then_some(CropRect {
        x: x - screen.x,
        y: y - screen.y,
        width: right - x,
        height: bottom - y,
    })
}

#[tauri::command]
pub async fn start_capture(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.set_focus();
        return Ok(());
    }
    if app
        .state::<DesktopState>()
        .starting
        .swap(true, Ordering::SeqCst)
    {
        return Ok(());
    }
    let result = begin_capture(&app).await;
    app.state::<DesktopState>()
        .starting
        .store(false, Ordering::SeqCst);
    if result.is_err() {
        app.state::<DesktopState>()
            .capture
            .lock()
            .map_err(|e| e.to_string())?
            .take();
    }
    result
}

async fn begin_capture(app: &AppHandle) -> Result<(), String> {
    let previous_window = foreground();
    let point = cursor();
    let handle = app.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        if let Some(main) = handle.get_webview_window("main") {
            let _ = main.hide();
        }
        // Flush the hide on the UI thread before taking the frozen desktop frame.
        #[cfg(windows)]
        unsafe {
            windows_sys::Win32::Graphics::Dwm::DwmFlush();
        }
        let _ = sender.send(());
    })
    .map_err(|e| e.to_string())?;
    receiver.await.map_err(|e| e.to_string())?;
    let last = *app
        .state::<DesktopState>()
        .last_selection
        .lock()
        .map_err(|e| e.to_string())?;
    let session = tauri::async_runtime::spawn_blocking(move || {
        let screen = match Screen::from_point(point.0, point.1) {
            Ok(screen) => screen,
            Err(_) => Screen::all()
                .map_err(|e| e.to_string())?
                .into_iter()
                .next()
                .ok_or_else(|| "没有可用显示器 / No monitor".to_string())?,
        };
        let pixels = DynamicImage::ImageRgba8(
            screen
                .capture()
                .map_err(|e| format!("截图失败 / Capture failed: {e}"))?,
        );
        let bounds = CropRect {
            x: screen.display_info.x as f64,
            y: screen.display_info.y as f64,
            width: pixels.width() as f64,
            height: pixels.height() as f64,
        };
        let frame = CaptureFrame {
            id: uuid::Uuid::new_v4().to_string(),
            data_url: png_data_url(&encode_png(&pixels)?),
            width: pixels.width(),
            height: pixels.height(),
            x: screen.display_info.x,
            y: screen.display_info.y,
            window_targets: window_targets(bounds),
            previous_selection: last.and_then(|rect| intersect_relative(rect, bounds)),
        };
        Ok::<_, String>(CaptureSession {
            frame,
            pixels,
            previous_window,
            restore_focus: true,
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    let position = PhysicalPosition::new(session.frame.x as f64, session.frame.y as f64);
    *app.state::<DesktopState>()
        .capture
        .lock()
        .map_err(|e| e.to_string())? = Some(session);
    let window = WebviewWindowBuilder::new(
        app,
        "capture",
        WebviewUrl::App("index.html?view=capture".into()),
    )
    .title("SnipasteVeya · 截图 / Capture")
    .visible(false)
    .decorations(false)
    .resizable(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;
    if let Err(error) = window.set_fullscreen_on_monitor(position) {
        let _ = window.close();
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_capture(app: AppHandle) -> Result<CaptureFrame, String> {
    app.state::<DesktopState>()
        .capture
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .map(|s| s.frame.clone())
        .ok_or_else(|| "截图已结束 / Capture has ended".into())
}

#[tauri::command]
pub fn crop_capture(app: AppHandle, capture_id: String, rect: CropRect) -> Result<String, String> {
    let state = app.state::<DesktopState>();
    let capture = state.capture.lock().map_err(|e| e.to_string())?;
    let session = capture
        .as_ref()
        .filter(|s| s.frame.id == capture_id)
        .ok_or_else(|| "截图已结束 / Capture has ended".to_string())?;
    let image = crop_image(&session.pixels, rect)?;
    *state.last_selection.lock().map_err(|e| e.to_string())? = Some(CropRect {
        x: rect.x + session.frame.x as f64,
        y: rect.y + session.frame.y as f64,
        ..rect
    });
    Ok(image)
}

#[tauri::command]
pub fn finish_capture(app: AppHandle, restore_focus: bool) -> Result<(), String> {
    if let Some(session) = app
        .state::<DesktopState>()
        .capture
        .lock()
        .map_err(|e| e.to_string())?
        .as_mut()
    {
        session.restore_focus = restore_focus;
    }
    if let Some(window) = app.get_webview_window("capture") {
        window.hide().map_err(|e| e.to_string())?;
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pin_clipboard(app: AppHandle) -> Result<String, String> {
    let image = tauri::async_runtime::spawn_blocking(read_clipboard_image).await.map_err(|e| e.to_string())??
        .ok_or_else(|| "剪贴板没有图片，请先截图或复制图片 / No clipboard image. Capture or copy an image first.".to_string())?;
    pin_image(app, image).await
}

async fn image_window(app: &AppHandle, image_base64: String, pin: bool) -> Result<String, String> {
    let image = decode_image(&image_base64)?;
    let point = cursor();
    let monitor = app
        .monitor_from_point(point.0 as f64, point.1 as f64)
        .map_err(|e| e.to_string())?
        .or(app.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or_else(|| "没有可用显示器 / No monitor".to_string())?;
    let area = monitor.work_area();
    let scale = 1.0_f64
        .min((area.size.width as f64 - 40.0) / image.width() as f64)
        .min((area.size.height as f64 - 40.0) / image.height() as f64)
        .max(0.01);
    let (width, height) = if pin {
        (
            (image.width() as f64 * scale).round() as u32,
            (image.height() as f64 * scale).round() as u32,
        )
    } else {
        (
            (560.0 * monitor.scale_factor()) as u32,
            (450.0 * monitor.scale_factor()) as u32,
        )
    };
    let x = (point.0 - width as i32 / 2).clamp(
        area.position.x,
        area.position.x + (area.size.width.saturating_sub(width)) as i32,
    );
    let y = (point.1 - height as i32 / 2).clamp(
        area.position.y,
        area.position.y + (area.size.height.saturating_sub(height)) as i32,
    );
    let view = if pin { "pin" } else { "ocr" };
    let label = format!("{view}-{}", uuid::Uuid::new_v4());
    let payload = WindowImage {
        data_url: png_data_url(&encode_png(&image)?),
        width: image.width(),
        height: image.height(),
        scale,
    };
    app.state::<DesktopState>()
        .images
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            label.clone(),
            ImageEntry {
                image: payload,
                ready: false,
            },
        );
    let result = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("index.html?view={view}").into()),
    )
    .title(if pin {
        "SnipasteVeya · 贴图 / Pin"
    } else {
        "SnipasteVeya · OCR"
    })
    .visible(false)
    .decorations(!pin)
    .transparent(pin)
    .shadow(!pin)
    .resizable(!pin)
    .skip_taskbar(pin)
    .always_on_top(pin)
    .inner_size(
        width as f64 / monitor.scale_factor(),
        height as f64 / monitor.scale_factor(),
    )
    .build();
    match result {
        Ok(window) => {
            if let Err(error) = window
                .set_position(PhysicalPosition::new(x, y))
                .and_then(|_| window.set_size(PhysicalSize::new(width.max(1), height.max(1))))
            {
                let _ = window.close();
                app.state::<DesktopState>()
                    .images
                    .lock()
                    .map_err(|e| e.to_string())?
                    .remove(&label);
                return Err(error.to_string());
            }
            Ok(label)
        }
        Err(error) => {
            app.state::<DesktopState>()
                .images
                .lock()
                .map_err(|e| e.to_string())?
                .remove(&label);
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub async fn pin_image(app: AppHandle, image_base64: String) -> Result<String, String> {
    let label = image_window(&app, image_base64, true).await?;
    if app
        .state::<DesktopState>()
        .pins_hidden
        .load(Ordering::SeqCst)
    {
        toggle_pins(app.clone())?;
    }
    finish_capture(app, false)?;
    Ok(label)
}

#[tauri::command]
pub async fn open_ocr(app: AppHandle, image_base64: String) -> Result<String, String> {
    let label = image_window(&app, image_base64, false).await?;
    finish_capture(app, false)?;
    Ok(label)
}

#[tauri::command]
pub fn open_settings(app: AppHandle) {
    crate::show_settings(&app);
}

#[tauri::command]
pub fn get_window_image(app: AppHandle, window: WebviewWindow) -> Result<WindowImage, String> {
    app.state::<DesktopState>()
        .images
        .lock()
        .map_err(|e| e.to_string())?
        .get(window.label())
        .map(|e| e.image.clone())
        .ok_or_else(|| "图片已关闭 / Image closed".into())
}

#[tauri::command]
pub fn show_ready_window(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if let Some(entry) = app
        .state::<DesktopState>()
        .images
        .lock()
        .map_err(|e| e.to_string())?
        .get_mut(window.label())
    {
        entry.ready = true;
    }
    if window.label().starts_with("pin-")
        && app
            .state::<DesktopState>()
            .pins_hidden
            .load(Ordering::SeqCst)
    {
        return Ok(());
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_pins(app: AppHandle) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    let labels: Vec<(String, bool)> = state
        .images
        .lock()
        .map_err(|e| e.to_string())?
        .iter()
        .filter(|(label, _)| label.starts_with("pin-"))
        .map(|(label, entry)| (label.clone(), entry.ready))
        .collect();
    if labels.is_empty() {
        return Ok(());
    }
    let hide = !state.pins_hidden.load(Ordering::SeqCst);
    for (label, ready) in labels {
        if !ready {
            continue;
        }
        if let Some(window) = app.get_webview_window(&label) {
            if hide { window.hide() } else { window.show() }.map_err(|e| e.to_string())?;
        }
    }
    state.pins_hidden.store(hide, Ordering::SeqCst);
    Ok(())
}

fn anchored_position(
    position: (i32, i32),
    old_size: (u32, u32),
    new_size: (u32, u32),
    anchor: (f64, f64),
) -> (i32, i32) {
    (
        position.0
            + ((old_size.0 as f64 - new_size.0 as f64) * anchor.0.clamp(0.0, 1.0)).round() as i32,
        position.1
            + ((old_size.1 as f64 - new_size.1 as f64) * anchor.1.clamp(0.0, 1.0)).round() as i32,
    )
}

#[tauri::command]
pub fn resize_pin(
    app: AppHandle,
    window: WebviewWindow,
    scale: f64,
    anchor_x: f64,
    anchor_y: f64,
) -> Result<f64, String> {
    if !scale.is_finite() || !anchor_x.is_finite() || !anchor_y.is_finite() {
        return Err("Invalid zoom".into());
    }
    let state = app.state::<DesktopState>();
    let mut images = state.images.lock().map_err(|e| e.to_string())?;
    let entry = images
        .get_mut(window.label())
        .filter(|_| window.label().starts_with("pin-"))
        .ok_or_else(|| "贴图已关闭 / Pin closed".to_string())?;
    let scale = scale.clamp(0.05, 8.0);
    let width = (entry.image.width as f64 * scale).round().max(1.0) as u32;
    let height = (entry.image.height as f64 * scale).round().max(1.0) as u32;
    let old = window.inner_size().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let (mut x, mut y) = anchored_position(
        (position.x, position.y),
        (old.width, old.height),
        (width, height),
        (anchor_x, anchor_y),
    );
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let area = monitor.work_area();
        x = x.clamp(
            area.position.x - width as i32 + 1,
            area.position.x + area.size.width as i32 - 1,
        );
        y = y.clamp(
            area.position.y - height as i32 + 1,
            area.position.y + area.size.height as i32 - 1,
        );
    }
    window
        .set_size(PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    entry.image.scale = scale;
    Ok(scale)
}

pub fn window_destroyed(app: &AppHandle, label: &str) {
    let state = app.state::<DesktopState>();
    if label == "capture" {
        if let Ok(mut capture) = state.capture.lock() {
            if let Some(session) = capture.take() {
                if session.restore_focus {
                    restore_foreground(session.previous_window);
                }
            }
        }
    } else if let Ok(mut images) = state.images.lock() {
        images.remove(label);
        if !images.keys().any(|label| label.starts_with("pin-")) {
            state.pins_hidden.store(false, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapping_clips_windows_on_negative_coordinate_monitors() {
        let screen = CropRect {
            x: -1920.0,
            y: -100.0,
            width: 1920.0,
            height: 1080.0,
        };
        assert_eq!(
            intersect_relative(
                CropRect {
                    x: -2100.0,
                    y: 100.0,
                    width: 600.0,
                    height: 400.0
                },
                screen
            ),
            Some(CropRect {
                x: 0.0,
                y: 200.0,
                width: 420.0,
                height: 400.0
            })
        );
        assert!(intersect_relative(
            CropRect {
                x: 100.0,
                y: 0.0,
                width: 600.0,
                height: 400.0
            },
            screen
        )
        .is_none());
    }
    #[test]
    fn zoom_preserves_the_pixel_under_the_cursor() {
        assert_eq!(
            anchored_position((-1200, 200), (800, 400), (1600, 800), (0.25, 0.5)),
            (-1400, 0)
        );
        assert_eq!(
            anchored_position((50, 80), (200, 100), (100, 50), (0.0, 0.0)),
            (50, 80)
        );
    }
}
