import { useEffect, useState } from "react";
import { CaptureOverlay } from "./CaptureOverlay";
import { command, errorText, imageArgs, type Translate } from "../native";
import type { CaptureFrame } from "../types";

export function CaptureWindow({ t }: {t: Translate}) {
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void command<CaptureFrame>("get_capture").then(frame => { if (alive) setFrame(frame); }).catch(error => {
      if (alive) { setError(errorText(error)); void command("show_ready_window"); }
    });
    return () => { alive = false; };
  }, []);
  const finish = () => command<void>("finish_capture", {restoreFocus:true});
  if (!frame) return <div className="window-loading" role="status">{error || t("准备截图…", "Preparing capture…")}{error && <button onClick={() => void finish()}>{t("关闭", "Close")}</button>}</div>;
  return <CaptureOverlay frame={frame} disabled={false} t={t}
    onReady={() => command<void>("show_ready_window")}
    onCopyColor={text => command<void>("copy_text", {text})}
    onCrop={rect => command<string>("crop_capture", {captureId:frame.id, rect})}
    onCopy={async image => { await command("copy_image", imageArgs(image)); await finish(); }}
    onSave={async image => { if (await command<boolean>("save_image", imageArgs(image))) await finish(); }}
    onPin={async image => { await command("pin_image", imageArgs(image)); }}
    onOcr={async image => { await command("open_ocr", imageArgs(image)); }}
    onCancel={finish} />;
}
