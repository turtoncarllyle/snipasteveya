import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CaptureFrame, Rect } from "../types";
import { emptyHistory, historyReducer, hitAnnotation, type Annotation, type Tool } from "./annotations";
import { between, clamp, contains, fitImage, handles, imagePoint, moveRect, nudgeRect, pixelRect, resizeRect, screenRect, toolbarPosition, type Handle, type Point, type Size } from "./geometry";
import { annotationFont, composeSelection, drawAnnotations } from "./render";
import { CaptureIcon, type CaptureIconName } from "./CaptureIcon";
import { Magnifier, pixelColor } from "./Magnifier";
import "./capture.css";

interface Props {
  frame: CaptureFrame;
  disabled: boolean;
  t: (zh: string, en: string) => string;
  onCrop: (rect: Rect) => Promise<string>;
  onCopy: (image: string) => Promise<void>;
  onPin: (image: string) => Promise<void>;
  onSave: (image: string) => Promise<void>;
  onOcr: (image: string) => Promise<void>;
  onReady: () => Promise<void>;
  onCopyColor: (color: string) => Promise<void>;
  onCancel: () => Promise<void>;
}
type Interaction = {kind: "select" | "move" | "resize"; start: Point; original: Rect | null; handle?: Handle} | {kind: "draw"};
interface TextDraft { point: Point; text: string; color: string; fontSize: number }
type OutputAction = "copy" | "pin" | "save" | "ocr";
const swatches = ["#ef4444", "#f5c542", "#2f91ff", "#2eb875", "#ffffff", "#20242b"];
const toolDefinitions: {tool: Tool; icon: CaptureIconName; zh: string; en: string; shortcut: string}[] = [
  {tool:"rectangle", icon:"shapes", zh:"矩形 / 椭圆", en:"Rectangle / ellipse", shortcut:"1"},
  {tool:"arrow", icon:"arrow", zh:"箭头", en:"Arrow", shortcut:"2"},
  {tool:"pen", icon:"pen", zh:"画笔", en:"Pen", shortcut:"3"},
  {tool:"highlight", icon:"highlight", zh:"荧光笔", en:"Highlighter", shortcut:"4"},
  {tool:"mosaic", icon:"mosaic", zh:"马赛克", en:"Mosaic", shortcut:"5"},
  {tool:"text", icon:"text", zh:"文字", en:"Text", shortcut:"6"},
  {tool:"eraser", icon:"eraser", zh:"橡皮擦：删除标注", en:"Eraser: remove annotation", shortcut:"7"},
];

export function CaptureOverlay({frame, disabled, t, onCrop, onCopy, onPin, onSave, onOcr, onCancel, onReady, onCopyColor}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const [viewport, setViewport] = useState<Size>({width: window.innerWidth, height: window.innerHeight});
  const [toolbarSize, setToolbarSize] = useState<Size>({width: 438, height: 36});
  const [selection, setSelection] = useState<Rect | null>(null);
  const [draggingSelection, setDraggingSelection] = useState(false);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [color, setColor] = useState(swatches[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [fontSize, setFontSize] = useState(22);
  const [history, dispatch] = useReducer(historyReducer, emptyHistory);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pointer, setPointer] = useState<Point | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [feedback, setFeedback] = useState("");
  const fit = fitImage(frame, viewport);
  const selected = selection && selection.width >= 2 && selection.height >= 2 ? pixelRect(selection, frame) : null;
  const box = selected ? screenRect(selected, frame, viewport) : null;
  const toolbar = box ? toolbarPosition(box, toolbarSize, viewport) : {x: 0, y: 0};
  const locked = disabled || busy;
  const hoverTarget = !selected && pointer && !draggingSelection ? frame.windowTargets.find(rect => contains(rect,pointer)) ?? {x:0,y:0,width:frame.width,height:frame.height} : null;
  const hoverBox = hoverTarget ? screenRect(hoverTarget,frame,viewport) : null;
  const cancel = useCallback(() => {
    alive.current = false;
    void onCancel();
  }, [onCancel]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const resize = () => setViewport({width: surface.clientWidth, height: surface.clientHeight});
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const resize = () => setToolbarSize({width: element.offsetWidth, height: element.offsetHeight});
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [Boolean(selected)]);
  useLayoutEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, frame.width, frame.height);
    if (source && selection) drawAnnotations(ctx, draft ? [...history.present, draft] : history.present, source, pixelRect(selection, frame));
  }, [source, history.present, draft, selection, frame.width, frame.height]);

  const commitText = useCallback((): Annotation[] => {
    if (!textDraft) return history.present;
    setTextDraft(null);
    if (!textDraft.text.trim()) return history.present;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.font = annotationFont(textDraft.fontSize);
    const textWidth = Math.max(...textDraft.text.split("\n").map(line => ctx?.measureText(line).width ?? line.length * textDraft.fontSize));
    const mark: Annotation = {id: crypto.randomUUID(), tool:"text", points:[textDraft.point], width:1,
      text: textDraft.text, color:textDraft.color, fontSize:textDraft.fontSize, textWidth};
    const next = [...history.present, mark];
    dispatch({type:"replace", annotations:next});
    return next;
  }, [history.present, textDraft]);

  const chooseTool = useCallback((next: Tool) => {
    commitText();
    setTool(current => current === next || (next === "rectangle" && current === "ellipse") ? null : next);
    if (next === "highlight") setColor("#f5c542");
  }, [commitText]);

  const output = useCallback(async (action: OutputAction) => {
    if (!selected || !source || busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const marks = commitText();
      const cropped = await onCrop(selected);
      if (!alive.current) return;
      const image = await composeSelection(cropped, source, selected, marks);
      if (!alive.current) return;
      await ({copy:onCopy, pin:onPin, save:onSave, ocr:onOcr}[action])(image);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }, [selected, source, disabled, commitText, onCrop, onCopy, onPin, onSave, onOcr]);

  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    keyHandler.current = event => {
      if (disabled || event.defaultPrevented || event.isComposing) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
      if (event.key === "Alt") {event.preventDefault();setAltHeld(true);return;}
      if (busyRef.current || interaction.current) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === "a") {event.preventDefault();setTool(null);setSelection({x:0,y:0,width:frame.width,height:frame.height});return;}
      if (!event.ctrlKey && key === "r" && frame.previousSelection) {event.preventDefault();setTool(null);setSelection(frame.previousSelection);return;}
      if (selected && !tool && event.key.startsWith("Arrow")) {
        event.preventDefault();
        setSelection(nudgeRect(selected,event.key,event.ctrlKey?"grow":event.shiftKey?"shrink":"move",frame));
        return;
      }
      if (key === "c" && !event.ctrlKey && pointer && source && (!selected || altHeld)) {
        event.preventDefault();void onCopyColor(pixelColor(source,pointer)).then(() => setFeedback(t("颜色已复制", "Color copied"))).catch(error => setError(String(error)));return;
      }
      if (event.key === "Enter") { event.preventDefault(); void output("copy"); return; }
      if (!(event.ctrlKey || event.metaKey) || !selected) return;
      if (key === "z" || key === "y") {
        event.preventDefault();
        commitText();
        dispatch({type: key === "y" || event.shiftKey ? "redo" : "undo"});
      } else if (key === "c" || key === "s" || key === "t") {
        event.preventDefault();
        void output(key === "c" ? "copy" : key === "s" ? "save" : "pin");
      } else {
        const item = toolDefinitions.find(item => item.shortcut === key);
        if (item) { event.preventDefault(); chooseTool(item.tool); }
      }
    };
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyHandler.current(event);
    const keyup = (event: KeyboardEvent) => {if(event.key === "Alt")setAltHeld(false);};
    const blur = () => setAltHeld(false);
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup",keyup);
    window.addEventListener("blur",blur);
    return () => {window.removeEventListener("keydown", handler);window.removeEventListener("keyup",keyup);window.removeEventListener("blur",blur);};
  }, []);

  const pointFor = (event: ReactPointerEvent): Point => {
    const bounds = surfaceRef.current!.getBoundingClientRect();
    return imagePoint({x:event.clientX - bounds.left, y:event.clientY - bounds.top}, frame, viewport);
  };
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || locked) return;
    const point = pointFor(event);
    const marks = commitText();
    setError("");
    if (!selected || !contains(selected, point)) {
      setTool(null);
      interaction.current = {kind:"select", start:point, original:selection};
      setSelection({x:point.x, y:point.y, width:0, height:0});
      setDraggingSelection(true);
    } else if (!tool) {
      interaction.current = {kind:"move", start:point, original:selected};
      setDraggingSelection(true);
    } else if (tool === "text") {
      setTextDraft({point, text:"", color, fontSize:fontSize / fit.scale});
      return;
    } else if (tool === "eraser") {
      const hit = [...marks].reverse().find(mark => hitAnnotation(mark, point, 6 / fit.scale));
      if (hit) dispatch({type:"replace", annotations:marks.filter(mark => mark.id !== hit.id)});
      return;
    } else {
      draftRef.current = {id:crypto.randomUUID(), tool, points:[point], color, width:lineWidth / fit.scale};
      setDraft(draftRef.current);
      interaction.current = {kind:"draw"};
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, handle: Handle) => {
    if (!selected || locked || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    commitText();
    interaction.current = {kind:"resize", handle, start:pointFor(event), original:selected};
    surfaceRef.current!.setPointerCapture(event.pointerId);
    setDraggingSelection(true);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = interaction.current;
    const point = pointFor(event);
    setPointer(point);
    if (!drag) return;
    if (drag.kind === "select") setSelection(between(drag.start, point));
    else if (drag.kind === "move" && drag.original) setSelection(moveRect(drag.original, {x:point.x-drag.start.x, y:point.y-drag.start.y}, frame));
    else if (drag.kind === "resize" && drag.original) setSelection(resizeRect(drag.original, drag.handle!, point, frame));
    else if (drag.kind === "draw" && draftRef.current && selected) {
      const mark = draftRef.current;
      const bounded = {x:clamp(point.x,selected.x,selected.x+selected.width), y:clamp(point.y,selected.y,selected.y+selected.height)};
      const path = mark.tool === "pen" || mark.tool === "highlight";
      const last = mark.points[mark.points.length-1];
      if (path && Math.hypot(last.x-bounded.x,last.y-bounded.y) < 0.8 / fit.scale) return;
      draftRef.current = {...mark, points:path ? [...mark.points,bounded] : [mark.points[0],bounded]};
      setDraft(draftRef.current);
    }
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = interaction.current;
    if (!drag) return;
    if (!cancelled) move(event);
    if (!cancelled && drag.kind === "select" && Math.hypot(pointFor(event).x-drag.start.x,pointFor(event).y-drag.start.y)*fit.scale < 3) {
      setSelection(frame.windowTargets.find(rect => contains(rect,drag.start)) ?? {x:0,y:0,width:frame.width,height:frame.height});
    }
    if (cancelled && drag.kind !== "draw") setSelection(drag.original);
    if (!cancelled && draftRef.current) {
      const mark = draftRef.current;
      if (["pen","highlight"].includes(mark.tool) || mark.points.length > 1 && Math.hypot(mark.points[0].x-mark.points[1].x,mark.points[0].y-mark.points[1].y) >= 2) {
        dispatch({type:"replace", annotations:[...history.present, mark]});
      }
    }
    draftRef.current = null;
    setDraft(null);
    interaction.current = null;
    setDraggingSelection(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const textPosition = textDraft ? {x:fit.x+textDraft.point.x*fit.scale, y:fit.y+textDraft.point.y*fit.scale} : null;
  const hasOptions = tool && tool !== "eraser";
  return <main className="snip-capture" aria-label={t("截图", "Screenshot")}>
    <div ref={surfaceRef} className={`snip-surface ${tool ? `snip-tool-${tool}` : selected ? "snip-can-move" : ""}`}
      onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event,true)}
      onDoubleClick={() => {if(selected && !tool && !locked)void output("copy");}}
      onContextMenu={event => {event.preventDefault(); if (locked) return; if (tool || textDraft) {commitText();setTool(null);} else if(selected){setSelection(null);dispatch({type:"reset"});} else cancel();}}>
      <img className="snip-desktop" src={frame.dataUrl} alt="" draggable={false} onLoad={event => {setSource(event.currentTarget);void onReady().catch(error => setError(String(error)));}} onError={() => {setError(t("截图读取失败，请取消后重新截图。", "Unable to read screenshot. Cancel and capture again."));void onReady();}} />
      <canvas ref={canvasRef} width={frame.width} height={frame.height} className="snip-annotations" style={{left:fit.x,top:fit.y,width:fit.width,height:fit.height}} />
      {box ? <>
        <div className="snip-shade" style={{left:0,top:0,width:"100%",height:box.y}} />
        <div className="snip-shade" style={{left:0,top:box.y,width:box.x,height:box.height}} />
        <div className="snip-shade" style={{left:box.x+box.width,top:box.y,right:0,height:box.height}} />
        <div className="snip-shade" style={{left:0,top:box.y+box.height,width:"100%",bottom:0}} />
        <div className="snip-selection" style={{left:box.x,top:box.y,width:box.width,height:box.height}}>
          {handles.map(handle => <button key={handle} type="button" className={`snip-handle snip-handle-${handle}`} aria-label={t(`调整选区 ${handle}`,`Resize selection ${handle}`)} disabled={locked} onPointerDown={event => startResize(event,handle)} />)}
        </div>
        <div className="snip-dimensions" style={{left:clamp(box.x,0,viewport.width-150),top:box.y>=30?box.y-29:box.y+7}}>{selected!.width} × {selected!.height}<span>px</span></div>
      </> : <><div className="snip-shade snip-shade-full" />{hoverBox && <div className="snip-hover-target" style={{left:hoverBox.x,top:hoverBox.y,width:hoverBox.width,height:hoverBox.height}} />}</>}
    </div>
    {box && <div ref={toolbarRef} className="snip-tools" style={{left:toolbar.x,top:toolbar.y,visibility:draggingSelection?"hidden":"visible"}}>
      <div className="snip-toolbar" role="toolbar" aria-label={t("截图工具栏","Screenshot toolbar")}>
        {toolDefinitions.map(item => <button key={item.tool} type="button" className="snip-button" disabled={locked} aria-pressed={tool===item.tool || item.tool==="rectangle" && tool==="ellipse"}
          title={`${t(item.zh,item.en)} (Ctrl+${item.shortcut})`} aria-label={t(item.zh,item.en)} aria-keyshortcuts={`Control+${item.shortcut}`} onClick={() => chooseTool(item.tool)}><CaptureIcon name={item.tool==="rectangle" && tool==="ellipse"?"ellipse":item.icon} /></button>)}
        <span className="snip-divider" />
        <button type="button" className="snip-button" disabled={locked||!history.past.length} title={t("撤销 (Ctrl+Z)","Undo (Ctrl+Z)")} aria-label={t("撤销","Undo")} onClick={() => {commitText();dispatch({type:"undo"});}}><CaptureIcon name="undo" /></button>
        <button type="button" className="snip-button" disabled={locked||!history.future.length} title={t("重做 (Ctrl+Y)","Redo (Ctrl+Y)")} aria-label={t("重做","Redo")} onClick={() => {commitText();dispatch({type:"redo"});}}><CaptureIcon name="redo" /></button>
        <span className="snip-divider" />
        <button type="button" className="snip-button" disabled={locked} title={t("识别文字 (OCR)","Recognize text (OCR)")} aria-label="OCR" onClick={() => void output("ocr")}><CaptureIcon name="ocr" /></button>
        <button type="button" className="snip-button" disabled={disabled} title={t("取消 (Esc)","Cancel (Esc)")} aria-label={t("取消","Cancel")} onClick={cancel}><CaptureIcon name="cancel" /></button>
        <span className="snip-divider" />
        <button type="button" className="snip-button" disabled={locked} title={t("贴图 (Ctrl+T)","Pin image (Ctrl+T)")} aria-label={t("贴图","Pin image")} onClick={() => void output("pin")}><CaptureIcon name="pin" /></button>
        <button type="button" className="snip-button" disabled={locked} title={t("保存 (Ctrl+S)","Save (Ctrl+S)")} aria-label={t("保存","Save")} onClick={() => void output("save")}><CaptureIcon name="save" /></button>
        <button type="button" className="snip-button snip-copy" disabled={locked} title={t("复制并完成 (Enter)","Copy and finish (Enter)")} aria-label={t("复制并完成","Copy and finish")} onClick={() => void output("copy")}><CaptureIcon name="copy" /></button>
      </div>
      {hasOptions && <div className="snip-options" aria-label={t("标注样式","Annotation style")}>
        {(tool==="rectangle"||tool==="ellipse") && <><button type="button" className="snip-button" aria-label={t("矩形","Rectangle")} title={t("矩形","Rectangle")} aria-pressed={tool==="rectangle"} disabled={locked} onClick={() => setTool("rectangle")}><CaptureIcon name="rectangle" /></button><button type="button" className="snip-button" aria-label={t("椭圆","Ellipse")} title={t("椭圆","Ellipse")} aria-pressed={tool==="ellipse"} disabled={locked} onClick={() => setTool("ellipse")}><CaptureIcon name="ellipse" /></button><span className="snip-divider" /></>}
        {tool!=="mosaic" && swatches.map(swatch => <button key={swatch} type="button" className="snip-swatch" style={{"--swatch":swatch} as React.CSSProperties} aria-label={`${t("颜色","Color")} ${swatch}`} aria-pressed={color===swatch} disabled={locked} onClick={() => {setColor(swatch);setTextDraft(current => current ? {...current,color:swatch} : null);}} />)}
        {tool==="text" ? <select aria-label={t("字号","Font size")} value={fontSize} disabled={locked} onChange={event => {const size=Number(event.target.value);setFontSize(size);setTextDraft(current => current ? {...current,fontSize:size/fit.scale} : null);}}>{[16,22,32,44].map(size => <option key={size} value={size}>{size} px</option>)}</select>
          : <div className="snip-widths" role="group" aria-label={t(tool==="mosaic"?"马赛克大小":"线条粗细",tool==="mosaic"?"Mosaic size":"Stroke width")}>{[1,3,6].map(width => <button key={width} type="button" className="snip-button" aria-pressed={lineWidth===width} aria-label={`${t("大小","Size")} ${width}`} title={`${width} px`} disabled={locked} onClick={() => setLineWidth(width)}><span style={{width:width+2,height:width+2}} /></button>)}</div>}
      </div>}
    </div>}
    {textDraft && textPosition && <textarea className="snip-text-input" autoFocus aria-label={t("输入标注文字","Annotation text")} placeholder={t("输入文字…","Type text…")} value={textDraft.text}
      style={{left:textPosition.x,top:textPosition.y,color:textDraft.color,fontSize:textDraft.fontSize*fit.scale,width:Math.max(30,Math.min(320,box!.x+box!.width-textPosition.x)),maxHeight:Math.max(24,box!.y+box!.height-textPosition.y)}}
      onChange={event => setTextDraft({...textDraft,text:event.target.value})} onKeyDown={event => {event.stopPropagation();if(event.nativeEvent.isComposing)return;if(event.key==="Escape"){event.preventDefault();setTextDraft(null);}else if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();commitText();}}} />}
    {source && pointer && !tool && (!selected || draggingSelection || altHeld) && <Magnifier source={source} point={pointer} screenPoint={{x:fit.x+pointer.x*fit.scale,y:fit.y+pointer.y*fit.scale}} viewport={viewport} />}
    {!selected && !draggingSelection && <div className="snip-start-hint">{t("点击选窗口，拖动框选 · Esc 取消","Click a window or drag to select · Esc to cancel")}</div>}
    {(error || busy || feedback) && <div className="snip-feedback" role={error?"alert":"status"}>{error || (busy?t("正在处理…","Processing…"):feedback)}</div>}
  </main>;
}
