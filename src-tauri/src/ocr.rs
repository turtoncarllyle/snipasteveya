use crate::settings::{self, CloudProvider};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
#[cfg(feature = "local-ocr")]
use oar_ocr::prelude::{OAROCRBuilder, OAROCR};
use reqwest::Client;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tokio::sync::watch;

const CANCELLED: &str = "已取消 / Cancelled";

struct Job {
    owner: String,
    cancelled: Arc<AtomicBool>,
    sender: watch::Sender<bool>,
}

#[derive(Default)]
pub struct OcrState {
    jobs: Mutex<HashMap<String, Job>>,
    early_cancellations: Mutex<HashSet<String>>,
    client: Client,
    #[cfg(feature = "local-ocr")]
    engine: Mutex<Option<OAROCR>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub engine: String,
    pub confidence: Option<f32>,
}

fn endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.into()
    } else {
        format!("{base}/chat/completions")
    }
}

async fn cloud_ocr(
    client: &Client,
    image_base64: &str,
    provider: &CloudProvider,
) -> Result<String, String> {
    let key = settings::load_key(&provider.id).ok_or_else(|| {
        "请先在设置中保存此服务的 API Key / Save this provider's API key in Settings first"
            .to_string()
    })?;
    request_cloud_ocr(
        client,
        image_base64,
        provider,
        &key,
        Duration::from_secs(45),
    )
    .await
}

async fn request_cloud_ocr(
    client: &Client,
    image_base64: &str,
    provider: &CloudProvider,
    key: &str,
    timeout: Duration,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": provider.model, "temperature": 0,
        "messages": [{"role":"user", "content":[
            {"type":"text","text":"请识别图片中的全部文字，保持原有换行和段落，只返回识别到的文字，不要解释。"},
            {"type":"image_url","image_url":{"url":format!("data:image/png;base64,{image_base64}")}}
        ]}]
    });
    let response = client
        .post(endpoint(&provider.base_url))
        .bearer_auth(key)
        .json(&body)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "识别超时，请重试或切换本地 OCR / Timed out. Retry or switch to local OCR.".into()
            } else {
                format!("无法连接 OCR 服务 / Cannot reach OCR provider: {e}")
            }
        })?;
    let status = response.status();
    let value: serde_json::Value = response.json().await.map_err(|e| {
        format!(
            "服务未返回有效 JSON / Provider returned invalid JSON ({}): {e}",
            status.as_u16()
        )
    })?;
    if !status.is_success() {
        let detail = value
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("Service returned an error");
        let hint = match status.as_u16() {
            401 | 403 => "鉴权失败，请检查 API Key / Authentication failed; check the API key",
            400 | 404 | 422 => {
                "请检查地址、模型及图片输入支持 / Check the URL, model and image-input support"
            }
            429 => "请求过于频繁或额度不足 / Rate limit or quota exceeded",
            _ => "识别服务返回错误 / OCR provider error",
        };
        return Err(format!("{hint} ({}): {detail}", status.as_u16()));
    }
    value.pointer("/choices/0/message/content").and_then(|v| v.as_str()).map(str::to_string)
        .ok_or_else(|| "服务没有返回文字，请确认模型支持图片 / No text returned; check that the model supports images".into())
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::SeqCst) {
        Err(CANCELLED.into())
    } else {
        Ok(())
    }
}

#[cfg(feature = "local-ocr")]
fn local_ocr(
    app: &AppHandle,
    image_base64: &str,
    cancelled: &AtomicBool,
) -> Result<(String, Option<f32>), String> {
    recognize_local(&app.state::<OcrState>().engine, image_base64, cancelled)
}

#[cfg(feature = "local-ocr")]
fn recognize_local(
    cache: &Mutex<Option<OAROCR>>,
    image_base64: &str,
    cancelled: &AtomicBool,
) -> Result<(String, Option<f32>), String> {
    check_cancelled(cancelled)?;
    let bytes = BASE64.decode(image_base64).map_err(|e| e.to_string())?;
    let image = image25::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .to_rgb8();
    let image = if image.width() > 2400 {
        image25::imageops::resize(
            &image,
            2400,
            (image.height() as f64 * 2400.0 / image.width() as f64)
                .round()
                .max(1.0) as u32,
            image25::imageops::FilterType::Lanczos3,
        )
    } else {
        image
    };
    // Reuse sessions and serialize inference rather than loading models per click.
    let mut engine = cache.lock().map_err(|e| e.to_string())?;
    check_cancelled(cancelled)?;
    if engine.is_none() {
        let root = std::env::var_os("OAR_HOME")
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "找不到内置 OCR 模型 / Bundled OCR models unavailable".to_string())?;
        for file in [
            "pp-ocrv5_mobile_det.onnx",
            "pp-ocrv5_mobile_rec.onnx",
            "ppocrv5_dict.txt",
        ] {
            if !root.join(file).is_file() {
                return Err(format!("缺少内置模型，请重新安装完整软件包 / Bundled model missing; reinstall the complete package: {file}"));
            }
        }
        *engine = Some(
            OAROCRBuilder::new(
                root.join("pp-ocrv5_mobile_det.onnx"),
                root.join("pp-ocrv5_mobile_rec.onnx"),
                root.join("ppocrv5_dict.txt"),
            )
            .image_batch_size(1)
            .region_batch_size(8)
            .build()
            .map_err(|e| format!("本地引擎初始化失败 / Local engine initialization failed: {e}"))?,
        );
    }
    check_cancelled(cancelled)?;
    // ONNX's current native inference finishes before the cancellation boundary.
    let result = engine
        .as_ref()
        .unwrap()
        .predict(vec![image])
        .map_err(|e| format!("本地识别失败 / Local OCR failed: {e}"))?
        .into_iter()
        .next()
        .ok_or_else(|| "没有识别结果 / No OCR result".to_string())?;
    check_cancelled(cancelled)?;
    Ok((result.concatenated_text("\n"), result.average_confidence()))
}

#[cfg(not(feature = "local-ocr"))]
fn local_ocr(
    _app: &AppHandle,
    _image_base64: &str,
    _cancelled: &AtomicBool,
) -> Result<(String, Option<f32>), String> {
    Err("此构建不包含本地 OCR / Local OCR is not included in this build".into())
}

#[tauri::command]
pub async fn ocr_image(
    app: AppHandle,
    window: WebviewWindow,
    job_id: String,
    image_base64: String,
    provider_id: Option<String>,
) -> Result<OcrResult, String> {
    let state = app.state::<OcrState>();
    let key = format!("{}:{job_id}", window.label());
    let cancelled = Arc::new(AtomicBool::new(false));
    let (sender, mut receiver) = watch::channel(false);
    {
        let mut jobs = state.jobs.lock().map_err(|e| e.to_string())?;
        // Same lock order as cancel_ocr: cancellation cannot fall between the
        // early-cancellation check and inserting the active job.
        if state
            .early_cancellations
            .lock()
            .map_err(|e| e.to_string())?
            .remove(&key)
            || app.get_webview_window(window.label()).is_none()
        {
            return Err(CANCELLED.into());
        }
        if jobs.contains_key(&key) {
            return Err("Duplicate OCR job".into());
        }
        jobs.insert(
            key.clone(),
            Job {
                owner: window.label().into(),
                cancelled: cancelled.clone(),
                sender,
            },
        );
    }
    let image_base64 = image_base64
        .trim_start_matches("data:image/png;base64,")
        .to_string();
    let work = async {
        if let Some(provider_id) = provider_id {
            let settings = settings::current(&app)?;
            let provider = settings
                .providers
                .iter()
                .find(|p| p.id == provider_id)
                .ok_or_else(|| "OCR 服务已移除 / Provider no longer exists".to_string())?;
            let text = cloud_ocr(&state.client, &image_base64, provider).await?;
            Ok(OcrResult {
                text,
                engine: provider.name.clone(),
                confidence: None,
            })
        } else {
            let app = app.clone();
            let (text, confidence) = tauri::async_runtime::spawn_blocking(move || {
                local_ocr(&app, &image_base64, &cancelled)
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(OcrResult {
                text,
                engine: "local".into(),
                confidence,
            })
        }
    };
    let result =
        tokio::select! { result = work => result, _ = receiver.changed() => Err(CANCELLED.into()) };
    state.jobs.lock().map_err(|e| e.to_string())?.remove(&key);
    result
}

#[tauri::command]
pub fn cancel_ocr(app: AppHandle, window: WebviewWindow, job_id: String) -> Result<(), String> {
    let state = app.state::<OcrState>();
    let key = format!("{}:{job_id}", window.label());
    let jobs = state.jobs.lock().map_err(|e| e.to_string())?;
    if let Some(job) = jobs.get(&key) {
        job.cancelled.store(true, Ordering::SeqCst);
        let _ = job.sender.send(true);
    } else {
        let mut early = state
            .early_cancellations
            .lock()
            .map_err(|e| e.to_string())?;
        if early.len() > 128 {
            early.clear();
        }
        early.insert(key);
    }
    Ok(())
}

pub fn cancel_window_jobs(app: &AppHandle, owner: &str) {
    if let Ok(jobs) = app.state::<OcrState>().jobs.lock() {
        for job in jobs.values().filter(|job| job.owner == owner) {
            job.cancelled.store(true, Ordering::SeqCst);
            let _ = job.sender.send(true);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chat_endpoint_handles_version_and_full_endpoint() {
        assert_eq!(
            endpoint("https://example.com/v1/"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("https://example.com/chat/completions"),
            "https://example.com/chat/completions"
        );
    }
    #[test]
    fn queued_cancelled_local_jobs_never_start_inference() {
        assert!(check_cancelled(&AtomicBool::new(false)).is_ok());
        assert_eq!(
            check_cancelled(&AtomicBool::new(true)),
            Err(CANCELLED.into())
        );
    }
    fn mock_provider(
        status: &str,
        body: &str,
        delay: Duration,
    ) -> (CloudProvider, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0; 2048];
            loop {
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                let text = String::from_utf8_lossy(&request);
                if let Some(end) = text.find("\r\n\r\n") {
                    let size: usize = text[..end]
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length: ")
                                .and_then(|value| value.parse().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + size {
                        break;
                    }
                }
            }
            std::thread::sleep(delay);
            let _ = stream.write_all(response.as_bytes());
            String::from_utf8(request).unwrap()
        });
        (
            CloudProvider {
                id: "test".into(),
                name: "Test".into(),
                base_url: format!("http://{address}/v1"),
                model: "test-vision".into(),
                api_key: None,
                api_key_configured: false,
            },
            worker,
        )
    }
    #[tokio::test]
    async fn cloud_protocol_sends_image_and_preserves_unicode() {
        let (provider, server) = mock_provider(
            "200 OK",
            r#"{"choices":[{"message":{"content":"中文 English"}}]}"#,
            Duration::ZERO,
        );
        let text = request_cloud_ocr(
            &Client::new(),
            "dGVzdA==",
            &provider,
            "test-key",
            Duration::from_secs(3),
        )
        .await
        .unwrap();
        assert_eq!(text, "中文 English");
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        let body: serde_json::Value =
            serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(body["model"], "test-vision");
        assert_eq!(
            body["messages"][0]["content"][1]["image_url"]["url"],
            "data:image/png;base64,dGVzdA=="
        );
    }
    #[tokio::test]
    async fn cloud_auth_and_image_errors_remain_errors() {
        for (status, message) in [
            ("401 Unauthorized", "Authentication failed"),
            ("400 Bad Request", "image-input support"),
        ] {
            let (provider, server) = mock_provider(
                status,
                r#"{"error":{"message":"mock provider error"}}"#,
                Duration::ZERO,
            );
            let error = request_cloud_ocr(
                &Client::new(),
                "dGVzdA==",
                &provider,
                "test-key",
                Duration::from_secs(3),
            )
            .await
            .unwrap_err();
            assert!(error.contains(message), "{error}");
            server.join().unwrap();
        }
    }
    #[tokio::test]
    async fn cloud_timeout_returns_actionable_error() {
        let (provider, server) = mock_provider("200 OK", "{}", Duration::from_millis(300));
        let error = request_cloud_ocr(
            &Client::new(),
            "dGVzdA==",
            &provider,
            "test-key",
            Duration::from_millis(100),
        )
        .await
        .unwrap_err();
        assert!(error.contains("Timed out"), "{error}");
        server.join().unwrap();
    }
    #[cfg(feature = "local-ocr")]
    #[test]
    #[ignore = "Runs bundled ONNX models; cargo test bundled_models -- --ignored --nocapture"]
    fn bundled_models_read_chinese_and_english_without_downloads() {
        std::env::set_var(
            "OAR_HOME",
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/ocr"),
        );
        let cache = Mutex::new(None);
        let image = BASE64.encode(include_bytes!("../../tests/fixtures/bilingual-ocr.png"));
        for attempt in 1..=2 {
            let start = std::time::Instant::now();
            let (text, _) = recognize_local(&cache, &image, &AtomicBool::new(false)).unwrap();
            println!("Local OCR attempt {attempt}: {:?}; {text}", start.elapsed());
            assert!(text.contains("中文"), "Chinese text missing: {text}");
            assert!(
                text.contains("Hello Windows"),
                "English text missing: {text}"
            );
            assert!(text.contains("2026"), "Numbers missing: {text}");
        }
    }
}
