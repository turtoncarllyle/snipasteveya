import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu } from "@tauri-apps/api/menu";
import { closeWindow, command, errorText, imageArgs, type Translate } from "../native";
import type { WindowImage } from "../types";

export function PinWindow({ t }: {t: Translate}) {
  const [image, setImage] = useState<WindowImage | null>(null);
  const [feedback, setFeedback] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const menu = useRef<Menu | null>(null);
  const scale = useRef(1);
  const pendingZoom = useRef<{scale:number; x:number; y:number} | null>(null);
  const zooming = useRef(false);
  const dragging = useRef<{x:number; y:number} | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ copy:() => {}, save:() => {}, ocr:() => {}, reset:() => {} });

  const notify = (message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(""), 1800);
  };
  const action = async (name: string) => {
    if (!image) return;
    try {
      const result = await command(name, imageArgs(image.dataUrl));
      if (name === "copy_image") notify(t("已复制", "Copied"));
      if (name === "save_image" && result) notify(t("已保存", "Saved"));
    } catch (error) { notify(errorText(error)); }
  };
  const zoom = async (next: number, x = 0.5, y = 0.5) => {
    scale.current = Math.max(0.05, Math.min(8, next));
    pendingZoom.current = {scale:scale.current, x, y};
    if (zooming.current) return;
    zooming.current = true;
    try {
      while (pendingZoom.current) {
        const target = pendingZoom.current;
        pendingZoom.current = null;
        const actual = await command<number>("resize_pin", {scale:target.scale, anchorX:target.x, anchorY:target.y});
        if (!pendingZoom.current) scale.current = actual;
        notify(`${Math.round(actual * 100)}%`);
      }
    } catch (error) { notify(errorText(error)); }
    finally { zooming.current = false; }
  };
  handlers.current = {copy:() => void action("copy_image"), save:() => void action("save_image"), ocr:() => void action("open_ocr"), reset:() => void zoom(1)};

  useEffect(() => {
    let alive = true;
    void command<WindowImage>("get_window_image").then(image => {
      if (alive) { scale.current = image.scale; setImage(image); }
    }).catch(error => { if (alive) {setFeedback(errorText(error));void command("show_ready_window");} });
    return () => { alive = false; if (feedbackTimer.current) clearTimeout(feedbackTimer.current); };
  }, []);
  useEffect(() => {
    let disposed = false;
    let created: Menu | null = null;
    // Native menu IDs are application-wide, including other pinned windows.
    const prefix = `${getCurrentWindow().label}-${crypto.randomUUID()}`;
    void Menu.new({items:[
      {id:`${prefix}-copy`, text:t("复制图片", "Copy image"), accelerator:"Ctrl+C", action:() => handlers.current.copy()},
      {id:`${prefix}-ocr`, text:t("识别文字", "Recognize text"), action:() => handlers.current.ocr()},
      {id:`${prefix}-save`, text:t("保存图片…", "Save image…"), accelerator:"Ctrl+S", action:() => handlers.current.save()},
      {item:"Separator"},
      {id:`${prefix}-reset`, text:t("恢复原始大小", "Reset to original size"), accelerator:"Ctrl+0", action:() => handlers.current.reset()},
      {id:`${prefix}-hide`, text:t("隐藏全部贴图", "Hide all pins"), action:() => void command("toggle_pins").catch(error => notify(errorText(error)))},
      {item:"Separator"},
      {id:`${prefix}-close`, text:t("关闭此贴图", "Close this pin"), action:() => void closeWindow()},
    ]}).then(result => {
      if (disposed) { void result.close(); return; }
      created = result; menu.current = result;
    }).catch(error => { if (!disposed) setFeedback(errorText(error)); });
    return () => { disposed = true; menu.current = null; if (created) void created.close(); };
  }, [t]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.ctrlKey && event.key.toLowerCase() === "w") { event.preventDefault(); void closeWindow(); }
      else if (event.ctrlKey && event.key.toLowerCase() === "c") {event.preventDefault();handlers.current.copy();}
      else if (event.ctrlKey && event.key.toLowerCase() === "s") {event.preventDefault();handlers.current.save();}
      else if (event.ctrlKey && event.key === "0") {event.preventDefault();handlers.current.reset();}
      else if (event.key === "+" || event.key === "=") {event.preventDefault();void zoom(scale.current * 1.1);}
      else if (event.key === "-") {event.preventDefault();void zoom(scale.current / 1.1);}
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      void zoom(scale.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX / window.innerWidth, event.clientY / window.innerHeight);
    };
    const element = surface.current;
    window.addEventListener("keydown", keydown);
    element?.addEventListener("wheel", wheel, {passive:false});
    return () => {window.removeEventListener("keydown", keydown); element?.removeEventListener("wheel", wheel);};
  }, []);

  return <div ref={surface} className="pin-surface" aria-label={t("悬浮贴图", "Pinned image")}
    onPointerDown={event => {if(event.button===0) dragging.current={x:event.clientX,y:event.clientY}; if(event.button===1) event.preventDefault();}}
    onPointerMove={event => {const point=dragging.current;if(point && event.buttons===1 && Math.hypot(event.clientX-point.x,event.clientY-point.y)>3){dragging.current=null;void getCurrentWindow().startDragging().catch(error => notify(errorText(error)));}}}
    onPointerUp={() => {dragging.current=null;}} onPointerCancel={() => {dragging.current=null;}}
    onDoubleClick={() => void closeWindow()}
    onAuxClick={event => {if(event.button===1){event.preventDefault();void zoom(1);}}}
    onContextMenu={event => {event.preventDefault();void menu.current?.popup().catch(error => notify(errorText(error)));}}>
    {image && <img src={image.dataUrl} alt={t("贴图；拖动移动，滚轮缩放，右键打开菜单", "Pinned image; drag to move, scroll to zoom, right-click for actions")} draggable={false}
      onLoad={() => void command("show_ready_window").catch(error => notify(errorText(error)))} />}
    {feedback && <div className="pin-feedback" role="status">{feedback}</div>}
  </div>;
}
