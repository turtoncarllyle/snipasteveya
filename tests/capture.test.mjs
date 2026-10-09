import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

async function load(file) {
  const compiled = await build({entryPoints:[file], bundle:true, platform:"node", format:"esm", write:false});
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
}
const g = await load("src/capture/geometry.ts");
const a = await load("src/capture/annotations.ts");
const ocr = await load("src/ocr/state.ts");
const image = {width:3840,height:2160};
const mark = (id, tool="rectangle") => ({id,tool,color:"#ff0000",width:3,points:[{x:10,y:20},{x:110,y:80}]});

test("DPI and a monitor left of the primary display do not alter source-image coordinates", () => {
  const screen = {...image,x:-3840,y:-120};
  assert.deepEqual(g.imagePoint({x:960,y:540},screen,{width:1920,height:1080}),{x:1920,y:1080});
  assert.deepEqual(g.screenRect({x:1000,y:500,width:800,height:400},screen,{width:1920,height:1080}),{x:500,y:250,width:400,height:200});
});
test("letterboxing is removed from pointer coordinates", () => {
  const viewport = {width:1000,height:1000};
  const topLeft=g.imagePoint({x:0,y:218.75},image,viewport);
  assert.ok(Math.abs(topLeft.x)<1e-9 && Math.abs(topLeft.y)<1e-9);
  const bottomRight=g.imagePoint({x:1000,y:1000},image,viewport);
  assert.ok(Math.abs(bottomRight.x-3840)<1e-9 && Math.abs(bottomRight.y-2160)<1e-9);
});
test("dragging in reverse produces a positive crop", () => {
  assert.deepEqual(g.between({x:610,y:420},{x:10,y:20}),{x:10,y:20,width:600,height:400});
});
test("moving selection against edges preserves its dimensions", () => {
  assert.deepEqual(g.moveRect({x:30,y:50,width:600,height:400},{x:-500,y:3000},image),{x:0,y:1760,width:600,height:400});
});
test("every resize handle stays in bounds and cannot invert the selection", () => {
  for (const handle of g.handles) for (const point of [{x:-900,y:-900},{x:5000,y:4000}]) {
    const rect = g.resizeRect({x:100,y:100,width:600,height:400},handle,point,image);
    assert.ok(rect.width>=2 && rect.height>=2);
    assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=image.width && rect.y+rect.height<=image.height);
  }
});
test("crop rounding matches Rust and clamps the last pixel", () => {
  assert.deepEqual(g.pixelRect({x:3839.8,y:2159.6,width:10.5,height:4.5},image),{x:3839,y:2159,width:1,height:1});
  assert.deepEqual(g.pixelRect({x:15.6,y:12.4,width:101.5,height:200.4},image),{x:16,y:12,width:102,height:200});
});
test("toolbar follows the selection's bottom-right corner", () => {
  assert.deepEqual(g.toolbarPosition({x:200,y:100,width:600,height:300},{width:438,height:36},{width:1280,height:800}),{x:362,y:408});
});
test("toolbar and tool options flip above a selection at the bottom", () => {
  assert.deepEqual(g.toolbarPosition({x:200,y:650,width:600,height:140},{width:438,height:76},{width:1280,height:800}),{x:362,y:566});
});
test("full-screen and tiny selections keep the complete toolbar visible", () => {
  for (const rect of [{x:0,y:0,width:1280,height:800},{x:0,y:0,width:10,height:10},{x:1270,y:790,width:10,height:10}]) {
    const point=g.toolbarPosition(rect,{width:438,height:76},{width:1280,height:800});
    assert.ok(point.x>=8 && point.y>=8 && point.x+438<=1272 && point.y+76<=792);
  }
});
test("erase, undo and redo restore the exact annotation data", () => {
  const original=[mark("shape"),mark("redaction","mosaic")];
  let state=a.historyReducer(a.emptyHistory,{type:"replace",annotations:original});
  state=a.historyReducer(state,{type:"replace",annotations:[original[0]]});
  state=a.historyReducer(state,{type:"undo"});
  assert.deepEqual(state.present,original);
  state=a.historyReducer(state,{type:"redo"});
  assert.deepEqual(state.present,[original[0]]);
});
test("editing after undo discards the old redo branch", () => {
  let state=a.historyReducer(a.emptyHistory,{type:"replace",annotations:[mark("a")]});
  state=a.historyReducer(state,{type:"undo"});
  state=a.historyReducer(state,{type:"replace",annotations:[mark("b")]});
  assert.equal(state.future.length,0);
  assert.deepEqual(a.historyReducer(state,{type:"redo"}).present,[mark("b")]);
});
test("long editing sessions bound undo history", () => {
  let state=a.emptyHistory;
  for(let i=0;i<80;i++) state=a.historyReducer(state,{type:"replace",annotations:[mark(String(i))]});
  assert.equal(state.past.length,50);
});
test("eraser hits outlines rather than empty shape interiors", () => {
  assert.equal(a.hitAnnotation(mark("rect"),{x:10,y:45},4),true);
  assert.equal(a.hitAnnotation(mark("rect"),{x:55,y:45},4),false);
  assert.equal(a.hitAnnotation(mark("oval","ellipse"),{x:110,y:50},4),true);
  assert.equal(a.hitAnnotation(mark("oval","ellipse"),{x:60,y:50},4),false);
});
test("eraser hits freehand segments, mosaic interiors and measured multiline text", () => {
  assert.equal(a.hitAnnotation({...mark("pen","pen"),points:[{x:0,y:0},{x:100,y:100}]},{x:50,y:51},3),true);
  assert.equal(a.hitAnnotation(mark("mosaic","mosaic"),{x:60,y:50},3),true);
  const text={...mark("text","text"),text:"中文 English\n第二行",fontSize:22,textWidth:160};
  assert.equal(a.hitAnnotation(text,{x:90,y:60},3),true);
  assert.equal(a.hitAnnotation(text,{x:190,y:60},3),false);
});

test("keyboard adjustment uses physical pixels and clamps monitor edges", () => {
  const rect={x:0,y:10,width:100,height:80};
  assert.deepEqual(g.nudgeRect(rect,"ArrowLeft","move",image),rect);
  assert.deepEqual(g.nudgeRect(rect,"ArrowRight","move",image),{...rect,x:1});
  assert.deepEqual(g.nudgeRect(rect,"ArrowUp","grow",image),{...rect,y:9,height:81});
  assert.deepEqual(g.nudgeRect(rect,"ArrowLeft","shrink",image),{...rect,x:1,width:99});
  assert.equal(g.nudgeRect({...rect,width:2},"ArrowRight","shrink",image).width,2);
});
test("reselecting clears old annotations and their redo history", () => {
  const edited=a.historyReducer(a.emptyHistory,{type:"replace",annotations:[mark("old") ]});
  const reset=a.historyReducer(edited,{type:"reset"});
  assert.deepEqual(a.historyReducer(reset,{type:"undo"}),a.emptyHistory);
});
test("OCR failures preserve edited text rather than copying the error into results", () => {
  let state=ocr.ocrReducer(ocr.initialOcrState,{type:"edit",text:"已校对的文字 Checked text"});
  state=ocr.ocrReducer(state,{type:"start",job:"a"});
  state=ocr.ocrReducer(state,{type:"failure",job:"a",error:"401 Unauthorized"});
  assert.equal(state.text,"已校对的文字 Checked text");
  assert.equal(state.error,"401 Unauthorized");
});
test("late OCR success after cancellation cannot overwrite a newer request", () => {
  let state=ocr.ocrReducer(ocr.initialOcrState,{type:"start",job:"a"});
  state=ocr.ocrReducer(state,{type:"cancel",job:"a"});
  state=ocr.ocrReducer(state,{type:"start",job:"b"});
  assert.deepEqual(ocr.ocrReducer(state,{type:"success",job:"a",text:"stale",engine:"cloud"}),state);
  state=ocr.ocrReducer(state,{type:"success",job:"b",text:"正确结果",engine:"local"});
  assert.equal(state.text,"正确结果");
  assert.equal(state.status,"done");
});
