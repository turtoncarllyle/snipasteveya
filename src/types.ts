export type OcrEngine = "local" | "deepseek" | "openai-compatible";
export type Theme = "system" | "light" | "dark";

export interface CaptureFrame {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  x: number;
  y: number;
  windowTargets: Rect[];
  previousSelection: Rect | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloudProvider {
  id: string;
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
  ocrProviderId: string;
  providers: CloudProvider[];
}

export interface OcrResult {
  text: string;
  engine: string;
  confidence?: number;
}

export interface WindowImage {
  dataUrl: string;
  width: number;
  height: number;
  scale: number;
}
