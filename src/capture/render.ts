import type { Annotation } from "./annotations";
import { between } from "./geometry";
import type { Rect } from "../types";

export const annotationFont = (size: number) => `${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取截图 / Unable to read screenshot"));
    image.src = dataUrl;
  });
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, mark: Annotation, source: HTMLImageElement) {
  const [start] = mark.points;
  const end = mark.points[mark.points.length - 1];
  const rect = between(start, end);
  ctx.save();
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = mark.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (mark.tool) {
    case "rectangle": ctx.strokeRect(rect.x, rect.y, rect.width, rect.height); break;
    case "ellipse":
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "arrow": {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const length = Math.min(12 + mark.width * 2, Math.hypot(end.x - start.x, end.y - start.y) / 2);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - length * Math.cos(angle - Math.PI / 6), end.y - length * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x - length * Math.cos(angle + Math.PI / 6), end.y - length * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "pen":
    case "highlight":
      if (mark.tool === "highlight") { ctx.globalAlpha = 0.35; ctx.lineWidth = mark.width * 6; }
      if (mark.points.length === 1) {
        ctx.arc(start.x, start.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(start.x, start.y);
        mark.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
      break;
    case "mosaic": {
      if (rect.width < 1 || rect.height < 1) break;
      const block = Math.max(8, mark.width * 6);
      const pixels = document.createElement("canvas");
      pixels.width = Math.max(1, Math.ceil(rect.width / block));
      pixels.height = Math.max(1, Math.ceil(rect.height / block));
      const pixelContext = pixels.getContext("2d");
      if (!pixelContext) throw new Error("无法创建马赛克画布 / Unable to create mosaic canvas");
      pixelContext.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, pixels.width, pixels.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixels, rect.x, rect.y, rect.width, rect.height);
      break;
    }
    case "text": {
      const size = mark.fontSize ?? 22;
      ctx.font = annotationFont(size);
      ctx.textBaseline = "top";
      (mark.text ?? "").split("\n").forEach((line, index) => ctx.fillText(line, start.x, start.y + index * size * 1.3));
      break;
    }
  }
  ctx.restore();
}

/** Shared by preview and export: no handles, masks or toolbar pixels enter the output. */
export function drawAnnotations(ctx: CanvasRenderingContext2D, marks: Annotation[], source: HTMLImageElement, selection: Rect) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(selection.x, selection.y, selection.width, selection.height);
  ctx.clip();
  marks.forEach(mark => drawAnnotation(ctx, mark, source));
  ctx.restore();
}

export async function composeSelection(cropped: string, source: HTMLImageElement, selection: Rect, marks: Annotation[]): Promise<string> {
  if (marks.length === 0) return cropped;
  const image = await loadImage(cropped);
  const canvas = document.createElement("canvas");
  canvas.width = selection.width;
  canvas.height = selection.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建标注画布 / Unable to create annotation canvas");
  ctx.drawImage(image, 0, 0);
  ctx.translate(-selection.x, -selection.y);
  drawAnnotations(ctx, marks, source, selection);
  return canvas.toDataURL("image/png");
}
