import type { AppSettings, CloudProvider } from "../types";

export type SettingsUpdate = (current: AppSettings) => AppSettings;
export interface SettingsSnapshot {
  settings: AppSettings;
  pending: ReadonlySet<string>;
  errors: Readonly<Record<string, string>>;
  saved: boolean;
}

/** Compute each update against the last successful response, never an old form snapshot. */
export class SettingsQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private counts = new Map<string, number>();
  private listeners = new Set<() => void>();
  private snapshot: SettingsSnapshot;

  constructor(settings: AppSettings, private persist: (next: AppSettings) => Promise<AppSettings>, private onSaved: (saved: AppSettings) => void) {
    this.snapshot = { settings, pending: new Set(), errors: {}, saved: false };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SettingsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  synchronize(settings: AppSettings) {
    if (!this.counts.size && settings !== this.snapshot.settings) this.publish({ settings });
  }
  clearErrors(...keys: string[]) {
    this.publish({ errors: { ...this.snapshot.errors, ...Object.fromEntries(keys.map(key => [key, ""])) } });
  }
  enqueue(key: string, update: SettingsUpdate): Promise<boolean> {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.publish({ pending: new Set(this.counts.keys()), errors: { ...this.snapshot.errors, [key]: "" }, saved: false });
    const request = this.tail.then(async () => {
      try {
        const saved = await this.persist(update(this.snapshot.settings));
        this.publish({ settings: saved, errors: { ...this.snapshot.errors, [key]: "" }, saved: true });
        this.onSaved(saved);
        return true;
      } catch (error) {
        this.publish({ errors: { ...this.snapshot.errors, [key]: error instanceof Error ? error.message : String(error) }, saved: false });
        return false;
      } finally {
        const remaining = (this.counts.get(key) ?? 1) - 1;
        if (remaining) this.counts.set(key, remaining); else this.counts.delete(key);
        this.publish({ pending: new Set(this.counts.keys()) });
      }
    });
    this.tail = request;
    return request;
  }
}

export type ProviderField = "name" | "baseUrl" | "model" | "apiKey";
export function invalidProviderFields(provider: CloudProvider): ProviderField[] {
  const invalid: ProviderField[] = [];
  if (!provider.name.trim()) invalid.push("name");
  try {
    const url = new URL(provider.baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) invalid.push("baseUrl");
  } catch { invalid.push("baseUrl"); }
  if (!provider.model.trim()) invalid.push("model");
  if (!provider.apiKeyConfigured && !provider.apiKey?.trim()) invalid.push("apiKey");
  return invalid;
}
export function providerIsReady(provider: CloudProvider | undefined) {
  return Boolean(provider && !invalidProviderFields(provider).length);
}
export function saveProvider(current: AppSettings, draft: CloudProvider, activate: boolean): AppSettings {
  const provider = { ...draft, name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), model: draft.model.trim() };
  const providers = current.providers.some(item => item.id === provider.id)
    ? current.providers.map(item => item.id === provider.id ? provider : item) : [...current.providers, provider];
  return { ...current, providers, ...(activate ? { ocrEngine: provider.id === "deepseek" ? "deepseek" as const : "openai-compatible" as const, ocrProviderId: provider.id } : {}) };
}

export type ShortcutKey = "f1Shortcut" | "f3Shortcut";
export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing" | "repeat">): string | null {
  if (event.isComposing || event.repeat || ["Control", "Alt", "Shift", "Meta", "Tab", "Escape", "Unidentified", "Dead"].includes(event.key)) return null;
  const code = event.code || event.key;
  return [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", event.metaKey ? "Super" : "", code].filter(Boolean).join("+");
}
