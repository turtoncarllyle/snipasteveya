import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Tool } from "./annotations";
import { CaptureIcon, type CaptureIconName } from "./CaptureIcon";
import type { Translate } from "../native";
import { clamp } from "./geometry";

export type OutputAction = "copy" | "pin" | "save" | "ocr";
export const swatches = ["#ef4444", "#f5c542", "#2f91ff", "#2eb875", "#ffffff", "#20242b"];
export const toolDefinitions: { tool: Tool; icon: CaptureIconName; zh: string; en: string; shortcut: string }[] = [
  { tool: "rectangle", icon: "shapes", zh: "矩形 / 椭圆", en: "Rectangle / ellipse", shortcut: "1" },
  { tool: "arrow", icon: "arrow", zh: "箭头", en: "Arrow", shortcut: "2" },
  { tool: "pen", icon: "pen", zh: "画笔", en: "Pen", shortcut: "3" },
  { tool: "highlight", icon: "highlight", zh: "荧光笔", en: "Highlighter", shortcut: "4" },
  { tool: "mosaic", icon: "mosaic", zh: "马赛克", en: "Mosaic", shortcut: "5" },
  { tool: "text", icon: "text", zh: "文字", en: "Text", shortcut: "6" },
  { tool: "eraser", icon: "eraser", zh: "删除标注", en: "Erase annotation", shortcut: "7" },
];

function ToolbarButton({ label, icon, shortcut, children, pressed, disabled, primary, onClick }: {
  label: string; icon: CaptureIconName; shortcut?: string; children?: ReactNode; pressed?: boolean; disabled?: boolean; primary?: boolean; onClick: () => void;
}) {
  const id = useId();
  const [tooltip, setTooltip] = useState<CSSProperties | null>(null);
  const show = (element: HTMLButtonElement) => {
    const bounds = element.getBoundingClientRect();
    setTooltip({ left: clamp(bounds.x + bounds.width / 2, 110, window.innerWidth - 110), top: bounds.top >= 42 ? bounds.top - 38 : bounds.bottom + 8 });
  };
  return <button type="button" className={`snip-button ${children ? "snip-labelled" : ""} ${primary ? "snip-copy" : ""}`}
    aria-label={label} aria-pressed={pressed} aria-describedby={tooltip ? id : undefined} aria-keyshortcuts={shortcut?.replace("Ctrl", "Control")}
    disabled={disabled} onClick={onClick} onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setTooltip(null)}
    onFocus={event => show(event.currentTarget)} onBlur={() => setTooltip(null)}>
    <CaptureIcon name={icon} />{children}
    {tooltip && <span id={id} role="tooltip" className="snip-tooltip" style={tooltip}>{label}{shortcut && <kbd>{shortcut}</kbd>}</span>}
  </button>;
}

function navigateToolbar(event: KeyboardEvent<HTMLDivElement>) {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === "Enter" || event.key === " ") { event.stopPropagation(); return; }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault(); event.stopPropagation();
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

export function CaptureToolbar({ tool, locked, canUndo, canRedo, onTool, onUndo, onRedo, onOutput, onCancel, t }: {
  tool: Tool | null; locked: boolean; canUndo: boolean; canRedo: boolean; onTool: (tool: Tool) => void; onUndo: () => void; onRedo: () => void;
  onOutput: (action: OutputAction) => void; onCancel: () => void; t: Translate;
}) {
  return <div className="snip-toolbar" role="toolbar" aria-label={t("截图工具栏", "Screenshot toolbar")} onKeyDown={navigateToolbar}>
    <div className="snip-tool-group" role="group" aria-label={t("标注", "Annotate")}>
      {toolDefinitions.map(item => <ToolbarButton key={item.tool} icon={item.tool === "rectangle" && tool === "ellipse" ? "ellipse" : item.icon}
        label={t(item.zh, item.en)} shortcut={`Ctrl+${item.shortcut}`} disabled={locked} pressed={tool === item.tool || item.tool === "rectangle" && tool === "ellipse"} onClick={() => onTool(item.tool)} />)}
    </div>
    <div className="snip-tool-group" role="group" aria-label={t("编辑", "Edit")}>
      <ToolbarButton icon="undo" label={t("撤销", "Undo")} shortcut="Ctrl+Z" disabled={locked || !canUndo} onClick={onUndo} />
      <ToolbarButton icon="redo" label={t("重做", "Redo")} shortcut="Ctrl+Y" disabled={locked || !canRedo} onClick={onRedo} />
    </div>
    <div className="snip-tool-group" role="group" aria-label={t("使用截图", "Use capture")}>
      <ToolbarButton icon="ocr" label={t("识别文字", "Recognize text")} disabled={locked} onClick={() => onOutput("ocr")}>OCR</ToolbarButton>
      <ToolbarButton icon="pin" label={t("贴图", "Pin image")} shortcut="Ctrl+T" disabled={locked} onClick={() => onOutput("pin")}>{t("贴图", "Pin")}</ToolbarButton>
      <ToolbarButton icon="save" label={t("保存图片", "Save image")} shortcut="Ctrl+S" disabled={locked} onClick={() => onOutput("save")} />
    </div>
    <div className="snip-tool-group" role="group" aria-label={t("完成", "Finish")}>
      <ToolbarButton icon="cancel" label={t("取消", "Cancel")} shortcut="Escape" onClick={onCancel} />
      <ToolbarButton icon="copy" label={t("复制并完成", "Copy and finish")} shortcut="Enter" disabled={locked} primary onClick={() => onOutput("copy")}>{t("复制", "Copy")}<kbd>Enter</kbd></ToolbarButton>
    </div>
  </div>;
}

export function ToolOptions({ tool, color, lineWidth, fontSize, locked, onTool, onColor, onWidth, onFontSize, t }: {
  tool: Tool | null; color: string; lineWidth: number; fontSize: number; locked: boolean;
  onTool: (tool: Tool) => void; onColor: (color: string) => void; onWidth: (width: number) => void; onFontSize: (size: number) => void; t: Translate;
}) {
  if (!tool || tool === "eraser") return null;
  return <div className="snip-options" role="group" aria-label={t("标注样式", "Annotation style")} onKeyDown={event => {if(event.key === "Enter" || event.key === " ") event.stopPropagation();}}>
    {(tool === "rectangle" || tool === "ellipse") && <div className="snip-option-group">
      <ToolbarButton icon="rectangle" label={t("矩形", "Rectangle")} disabled={locked} pressed={tool === "rectangle"} onClick={() => onTool("rectangle")} />
      <ToolbarButton icon="ellipse" label={t("椭圆", "Ellipse")} disabled={locked} pressed={tool === "ellipse"} onClick={() => onTool("ellipse")} />
    </div>}
    {tool !== "mosaic" && <div className="snip-option-group">{swatches.map(swatch => <button type="button" key={swatch} className="snip-swatch" style={{ "--swatch": swatch } as CSSProperties}
      aria-label={`${t("颜色", "Color")} ${swatch}`} aria-pressed={color === swatch} disabled={locked} onClick={() => onColor(swatch)} />)}</div>}
    {tool === "text" ? <label className="snip-font-label">{t("字号", "Size")}<select aria-label={t("字号", "Font size")} value={fontSize} disabled={locked} onChange={event => onFontSize(Number(event.target.value))}>
      {[16, 22, 32, 44].map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
      : <div className="snip-widths" role="group" aria-label={t(tool === "mosaic" ? "马赛克大小" : "线条粗细", tool === "mosaic" ? "Mosaic size" : "Stroke width")}>
        {[1, 3, 6].map(width => <button type="button" key={width} className="snip-button" aria-pressed={lineWidth === width} aria-label={`${width} px`} title={`${width} px`} disabled={locked} onClick={() => onWidth(width)}><span style={{ width: width + 2, height: width + 2 }} /></button>)}
      </div>}
  </div>;
}
