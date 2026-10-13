import type { ReactNode } from "react";

export function Feedback({ children, error = false, busy = false, className = "" }: { children?: ReactNode; error?: boolean; busy?: boolean; className?: string }) {
  return <div className={`status-message ${error ? "is-error" : ""} ${className}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
    {busy && <span className="spinner" aria-hidden="true" />}{children}
  </div>;
}
