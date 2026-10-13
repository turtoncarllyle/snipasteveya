import type { ReactNode } from "react";
import { Feedback } from "../ui/Feedback";

export function SettingRow({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return <div className="setting-item">
    <div className="setting-row"><label htmlFor={id}>{label}{hint && <small>{hint}</small>}</label>{children}</div>
    {error && <Feedback error className="field-error"><span id={`${id}-error`}>{error}</span></Feedback>}
  </div>;
}
