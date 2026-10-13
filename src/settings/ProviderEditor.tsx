import { useState, type FormEvent } from "react";
import type { CloudProvider } from "../types";
import type { Translate } from "../native";
import { Feedback } from "../ui/Feedback";
import { invalidProviderFields, type ProviderField } from "./model";

export interface ProviderDraft { value: CloudProvider; initial: CloudProvider; exists: boolean; activate: boolean }
export function ProviderEditor({ draft, pending, error, onChange, onSave, onCancel, onRemove, t }: {
  draft: ProviderDraft; pending: boolean; error?: string; onChange: (value: CloudProvider) => void;
  onSave: () => void; onCancel: () => void; onRemove: () => void; t: Translate;
}) {
  const [invalid, setInvalid] = useState<ProviderField[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = !draft.exists || JSON.stringify(draft.value) !== JSON.stringify(draft.initial);
  const labels: Record<ProviderField, string> = { name: t("服务名称", "Provider name"), baseUrl: "Base URL", model: t("视觉模型", "Vision model"), apiKey: "API Key" };
  const messages: Record<ProviderField, string> = {
    name: t("请输入服务名称", "Enter a provider name"), baseUrl: t("请输入完整的 HTTP(S) 地址", "Enter a complete HTTP(S) URL"),
    model: t("请输入支持图片输入的模型名称", "Enter a model that accepts images"), apiKey: t("请输入 API Key", "Enter an API key"),
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = invalidProviderFields(draft.value);
    setInvalid(errors);
    if (errors.length) event.currentTarget.querySelector<HTMLInputElement>(`#provider-${errors[0]}`)?.focus();
    else onSave();
  };
  return <form className="provider-editor" onSubmit={submit} noValidate aria-label={t("云服务配置", "Cloud provider configuration")}>
    <div className="editor-heading"><h3>{draft.exists ? t("服务配置", "Provider settings") : t("添加服务", "Add provider")}</h3>{dirty && <span>{t("未保存", "Unsaved")}</span>}</div>
    {(["name", "baseUrl", "model", "apiKey"] as ProviderField[]).map(field => <div className="provider-field" key={field}>
      <label htmlFor={`provider-${field}`}>{labels[field]}</label>
      <input id={`provider-${field}`} value={draft.value[field] ?? ""} type={field === "apiKey" ? "password" : field === "baseUrl" ? "url" : "text"}
        autoComplete="off" spellCheck={false} disabled={pending} aria-invalid={invalid.includes(field)} aria-describedby={invalid.includes(field) ? `provider-${field}-error` : undefined}
        placeholder={field === "apiKey" && draft.value.apiKeyConfigured ? t("已保存，留空保持不变", "Saved; leave blank to keep") : field === "baseUrl" ? "https://api.example.com/v1" : undefined}
        onChange={event => { setInvalid(current => current.filter(item => item !== field)); onChange({ ...draft.value, [field]: event.target.value }); }} />
      {invalid.includes(field) && <span id={`provider-${field}-error`} className="field-error">{messages[field]}</span>}
    </div>)}
    <p className="setting-hint">{t("仅在主动识别时发送当前图片。密钥保存在 Windows 凭据管理器。", "Only recognition sends the current image. Keys stay in Windows Credential Manager.")}</p>
    {error && <Feedback error>{error}</Feedback>}
    <div className="editor-actions"><button type="button" disabled={pending} onClick={onCancel}>{t("取消", "Cancel")}</button><button className="primary" disabled={pending} type="submit">{pending ? t("保存中…", "Saving…") : t("保存配置", "Save configuration")}</button></div>
    {draft.exists && draft.value.id !== "deepseek" && <div className="provider-delete">{confirmDelete ? <>
      <p>{t("移除这个服务？正在使用时会切回本地 OCR。", "Remove this provider? If active, OCR will switch to local.")}</p>
      <button className="text-button" type="button" disabled={pending} onClick={() => setConfirmDelete(false)}>{t("保留", "Keep")}</button>
      <button className="text-button danger" type="button" disabled={pending} onClick={onRemove}>{t("确认移除", "Remove provider")}</button>
    </> : <button className="text-button danger" type="button" disabled={pending} onClick={() => setConfirmDelete(true)}>{t("移除此服务", "Remove provider")}</button>}</div>}
  </form>;
}
