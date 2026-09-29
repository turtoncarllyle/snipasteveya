export type AppMode = "idle" | "capture" | "paste" | "settings";
export type OcrEngine = "local" | "deepseek" | "openai-compatible";
export type Theme = "system" | "light" | "dark";

export interface CaptureFrame {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloudProvider {
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  apiKeyConfigured: boolean;
}

export interface AppSettings {
  language: "zh-CN" | "en-US";
  theme: Theme;
  autostart: boolean;
  f1Shortcut: string;
  f3Shortcut: string;
  ocrEngine: OcrEngine;
  provider: CloudProvider;
}

export interface OcrResult {
  text: string;
  engine: OcrEngine;
  confidence?: number;
}

export interface PasteItem {
  id: string;
  dataUrl: string;
  scale: number;
  left: number;
  top: number;
}
