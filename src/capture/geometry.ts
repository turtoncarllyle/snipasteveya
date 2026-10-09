import type { Rect } from "../types";

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

export function fitImage(image: Size, viewport: Size) {
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { scale, x: (viewport.width - image.width * scale) / 2, y: (viewport.height - image.height * scale) / 2,
    width: image.width * scale, height: image.height * scale };
}

/** All editing coordinates are source-image pixels, independent of monitor origin or DPI. */
export function imagePoint(point: Point, image: Size, viewport: Size): Point {
  const fit = fitImage(image, viewport);
  return { x: clamp((point.x - fit.x) / fit.scale, 0, image.width), y: clamp((point.y - fit.y) / fit.scale, 0, image.height) };
}

export function between(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function moveRect(rect: Rect, delta: Point, image: Size): Rect {
  return { ...rect, x: clamp(rect.x + delta.x, 0, image.width - rect.width), y: clamp(rect.y + delta.y, 0, image.height - rect.height) };
}

export function resizeRect(rect: Rect, handle: Handle, point: Point, image: Size): Rect {
  const left = handle.includes("w") ? clamp(point.x, 0, rect.x + rect.width - 2) : rect.x;
  const top = handle.includes("n") ? clamp(point.y, 0, rect.y + rect.height - 2) : rect.y;
  const right = handle.includes("e") ? clamp(point.x, rect.x + 2, image.width) : rect.x + rect.width;
  const bottom = handle.includes("s") ? clamp(point.y, rect.y + 2, image.height) : rect.y + rect.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Keyboard adjustments stay in source pixels even on a scaled monitor. */
export function nudgeRect(rect: Rect, key: string, mode: "move" | "grow" | "shrink", image: Size): Rect {
  const direction: Record<string, Point> = {ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
  const delta = direction[key];
  if (!delta) return rect;
  if (mode === "move") return moveRect(rect,delta,image);
  const sign = mode === "grow" ? 1 : -1;
  const handle: Handle = key === "ArrowLeft" ? "w" : key === "ArrowRight" ? "e" : key === "ArrowUp" ? "n" : "s";
  const point = {x:(handle === "w" ? rect.x : rect.x+rect.width)+delta.x*sign,
    y:(handle === "n" ? rect.y : rect.y+rect.height)+delta.y*sign};
  return resizeRect(rect,handle,point,image);
}

/** Match Rust's crop dimensions exactly so annotations cannot drift by a pixel. */
export function pixelRect(rect: Rect, image: Size): Rect {
  const x = clamp(Math.round(rect.x), 0, image.width - 1);
  const y = clamp(Math.round(rect.y), 0, image.height - 1);
  return { x, y, width: clamp(Math.round(rect.width), 1, image.width - x), height: clamp(Math.round(rect.height), 1, image.height - y) };
}

export function screenRect(rect: Rect, image: Size, viewport: Size): Rect {
  const fit = fitImage(image, viewport);
  return { x: fit.x + rect.x * fit.scale, y: fit.y + rect.y * fit.scale, width: rect.width * fit.scale, height: rect.height * fit.scale };
}

/** Prefer below/right aligned; flip above, then fall inside for a full-screen selection. */
export function toolbarPosition(rect: Rect, toolbar: Size, viewport: Size): Point {
  const gap = 8;
  const below = rect.y + rect.height + gap;
  const above = rect.y - toolbar.height - gap;
  const y = below + toolbar.height <= viewport.height - gap ? below : above >= gap ? above : rect.y + rect.height - toolbar.height - gap;
  return { x: clamp(rect.x + rect.width - toolbar.width, gap, viewport.width - toolbar.width - gap),
    y: clamp(y, gap, viewport.height - toolbar.height - gap) };
}
