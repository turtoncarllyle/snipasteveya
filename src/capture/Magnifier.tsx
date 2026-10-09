import { useEffect, useRef, useState } from "react";
import { clamp, type Point, type Size } from "./geometry";

export function pixelColor(source: HTMLImageElement, point: Point): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d")!;
  context.drawImage(source,clamp(Math.floor(point.x),0,source.naturalWidth-1),clamp(Math.floor(point.y),0,source.naturalHeight-1),1,1,0,0,1,1);
  return `#${[...context.getImageData(0,0,1,1).data].slice(0,3).map(value => value.toString(16).padStart(2,"0")).join("").toUpperCase()}`;
}

export function Magnifier({source, point, screenPoint, viewport}: {source:HTMLImageElement;point:Point;screenPoint:Point;viewport:Size}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color,setColor] = useState("");
  const x = clamp(screenPoint.x + 24 + 136 > viewport.width ? screenPoint.x - 150 : screenPoint.x + 24,8,viewport.width-144);
  const y = clamp(screenPoint.y + 24 + 158 > viewport.height ? screenPoint.y - 174 : screenPoint.y + 24,8,viewport.height-166);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if(!context) return;
    const px = clamp(Math.floor(point.x),0,source.naturalWidth-1);
    const py = clamp(Math.floor(point.y),0,source.naturalHeight-1);
    context.fillStyle="#20242b";context.fillRect(0,0,17,17);
    context.drawImage(source,px-8,py-8,17,17,0,0,17,17);
    setColor(pixelColor(source,{x:px,y:py}));
  },[source,point]);
  return <div className="snip-magnifier" style={{left:x,top:y}} aria-hidden="true">
    <div className="snip-lens"><canvas ref={canvas} width={17} height={17} /><span /></div>
    <div><i style={{background:color}} />{color}<kbd>C</kbd></div>
  </div>;
}
