export type CaptureIconName = "capture" | "shapes" | "rectangle" | "ellipse" | "arrow" | "pen" | "highlight" | "mosaic" | "text" | "eraser" | "undo" | "redo" | "ocr" | "cancel" | "pin" | "save" | "copy";

const paths: Record<CaptureIconName, string> = {
  capture: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 7h10v10H7z",
  shapes: "M3 5h12v10H3z M21 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  rectangle: "M3 5h18v14H3z",
  ellipse: "M21 12a9 7 0 1 1-18 0 9 7 0 0 1 18 0",
  arrow: "m3 18 6-6 4 3 8-10 M15 5h6v6",
  pen: "m4 16-1 5 5-1L20 8l-4-4L4 16z M13 7l4 4 M16 4l2-2 4 4-2 2",
  highlight: "m5 14 7-10 8 6-7 9-8-5z M7 16l-3 4h8 M13 4l2-2 8 6-2 3",
  mosaic: "M4 4h16v16H4z M4 12h16 M12 4v16 M4 4h8v8H4z M12 12h8v8h-8z",
  text: "M4 5h16 M12 5v15 M8 20h8",
  eraser: "m3 14 10-10 8 8-8 9H9l-6-7z M8 9l8 8 M13 21h8",
  undo: "M9 5 3 11l6 6 M3 11h10a7 7 0 0 1 7 7",
  redo: "m15 5 6 6-6 6 M21 11H11a7 7 0 0 0-7 7",
  ocr: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 8h10 M12 8v9 M9 17h6",
  cancel: "m6 6 12 12 M18 6 6 18",
  pin: "m14 3 7 7-3 1-4 5-3-3-6 6 M14 3l-1 3-5 4 6 6",
  save: "M5 3h12l4 4v14H3V3h2 M7 3v6h10V3 M7 21v-7h10v7",
  copy: "M8 8h12v13H8z M16 8V3H3v13h5",
};

export function CaptureIcon({name}: {name: CaptureIconName}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} />{name === "mosaic" && <path d="M4 4h8v8H4z M12 12h8v8h-8z" fill="currentColor" stroke="none" />}</svg>;
}
