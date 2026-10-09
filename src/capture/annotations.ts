import { between, contains, type Point } from "./geometry";

export type Tool = "rectangle" | "ellipse" | "arrow" | "pen" | "highlight" | "mosaic" | "text" | "eraser";
export interface Annotation {
  id: string;
  tool: Exclude<Tool, "eraser">;
  points: Point[];
  color: string;
  width: number;
  text?: string;
  fontSize?: number;
  textWidth?: number;
}
export interface History { past: Annotation[][]; present: Annotation[]; future: Annotation[][] }
export type HistoryAction = { type: "replace"; annotations: Annotation[] } | { type: "undo" | "redo" | "reset" };
export const emptyHistory: History = { past: [], present: [], future: [] };

export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "reset") return emptyHistory;
  if (action.type === "replace") return { past: [...state.past.slice(-49), state.present], present: action.annotations, future: [] };
  if (action.type === "undo" && state.past.length) return {
    past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future],
  };
  if (action.type === "redo" && state.future.length) return {
    past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1),
  };
  return state;
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

export function hitAnnotation(annotation: Annotation, point: Point, tolerance: number): boolean {
  const [start] = annotation.points;
  const end = annotation.points[annotation.points.length - 1];
  const rect = between(start, end);
  const margin = tolerance + annotation.width / 2;
  if (annotation.tool === "text") return contains({x: start.x, y: start.y,
    width: annotation.textWidth ?? 0, height: (annotation.text?.split("\n").length ?? 1) * (annotation.fontSize ?? 22) * 1.3}, point);
  if (annotation.tool === "mosaic") return contains(rect, point);
  if (annotation.tool === "rectangle") {
    return contains({x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2}, point)
      && !contains({x: rect.x + margin, y: rect.y + margin, width: Math.max(0, rect.width - margin * 2), height: Math.max(0, rect.height - margin * 2)}, point);
  }
  if (annotation.tool === "ellipse") {
    const rx = Math.max(1, rect.width / 2), ry = Math.max(1, rect.height / 2);
    return Math.abs(Math.hypot((point.x - rect.x - rx) / rx, (point.y - rect.y - ry) / ry) - 1) * Math.min(rx, ry) <= margin;
  }
  if (annotation.points.length === 1) return Math.hypot(point.x - start.x, point.y - start.y) <= margin;
  const distance = annotation.tool === "highlight" ? margin + annotation.width * 3 : margin;
  return annotation.points.slice(1).some((p, i) => segmentDistance(point, annotation.points[i], p) <= distance);
}
