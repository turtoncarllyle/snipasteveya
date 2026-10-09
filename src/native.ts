import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings } from "./types";

export const isTauri = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
export const command = <T,>(name: string, args?: Record<string, unknown>) => invoke<T>(name, args);
export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export const closeWindow = () => getCurrentWindow().close();
export const imageArgs = (image: string) => ({ imageBase64: image.replace(/^data:image\/png;base64,/, "") });
export const defaultSettings: AppSettings = {
  language: "zh-CN", theme: "system", autostart: false, f1Shortcut: "F1", f3Shortcut: "F3",
  ocrEngine: "local", ocrProviderId: "deepseek",
  providers: [{id:"deepseek", name:"DeepSeek", baseUrl:"https://api.deepseek.com", model:"deepseek-flash", apiKeyConfigured:false}],
};
export type Translate = (zh: string, en: string) => string;
