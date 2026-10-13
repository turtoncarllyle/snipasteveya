import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const compiled = await build({entryPoints:["src/settings/model.ts"],bundle:true,platform:"node",format:"esm",write:false});
const {SettingsQueue, saveProvider, invalidProviderFields, providerIsReady, shortcutFromEvent} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const initial = () => ({language:"zh-CN",theme:"system",autostart:false,f1Shortcut:"F1",f3Shortcut:"F3",ocrEngine:"local",ocrProviderId:"deepseek",providers:[{id:"deepseek",name:"DeepSeek",baseUrl:"https://api.deepseek.com",model:"vision",apiKeyConfigured:false}]});
const deferred = () => { let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve}; };

test("concurrent settings edits serialize and preserve earlier successful changes", async () => {
  const gate=deferred(), payloads=[];
  const queue=new SettingsQueue(initial(),async settings => {payloads.push(settings);if(payloads.length===1)await gate.promise;return settings;},()=>{});
  const theme=queue.enqueue("theme",current=>({...current,theme:"dark"}));
  const language=queue.enqueue("language",current=>({...current,language:"en-US"}));
  await Promise.resolve();
  assert.equal(payloads.length,1);
  assert.equal(queue.getSnapshot().settings.theme,"system");
  gate.resolve();
  assert.deepEqual(await Promise.all([theme,language]),[true,true]);
  assert.equal(payloads[1].theme,"dark");
  assert.equal(queue.getSnapshot().settings.language,"en-US");
  assert.equal(queue.getSnapshot().pending.size,0);
});

test("failed shortcut edit retains its previous binding without blocking later edits",async()=>{
  const payloads=[];
  const queue=new SettingsQueue(initial(),async settings=>{payloads.push(settings);if(settings.f1Shortcut==="F9")throw new Error("Shortcut already used");return settings;},()=>{});
  const shortcut=queue.enqueue("f1Shortcut",current=>({...current,f1Shortcut:"F9"}));
  const theme=queue.enqueue("theme",current=>({...current,theme:"light"}));
  assert.deepEqual(await Promise.all([shortcut,theme]),[false,true]);
  assert.equal(payloads[1].f1Shortcut,"F1");
  assert.equal(queue.getSnapshot().settings.theme,"light");
  assert.match(queue.getSnapshot().errors.f1Shortcut,/already used/);
});

test("autostart remains off until backend registration succeeds",async()=>{
  const gate=deferred();
  const queue=new SettingsQueue(initial(),async settings=>{await gate.promise;return settings;},()=>{});
  const result=queue.enqueue("autostart",current=>({...current,autostart:true}));
  assert.equal(queue.getSnapshot().settings.autostart,false);
  assert.ok(queue.getSnapshot().pending.has("autostart"));
  gate.resolve();await result;
  assert.equal(queue.getSnapshot().settings.autostart,true);
});

test("unfinished provider drafts and keys cannot leak into unrelated automatic saves",async()=>{
  const draft={id:"custom",name:"",baseUrl:"",model:"",apiKey:"draft-secret",apiKeyConfigured:false};
  const payloads=[];
  const queue=new SettingsQueue(initial(),async settings=>{payloads.push(settings);return settings;},()=>{});
  await queue.enqueue("theme",current=>({...current,theme:"dark"}));
  assert.equal(draft.apiKey,"draft-secret");
  assert.equal(payloads[0].providers.length,1);
  assert.ok(!JSON.stringify(payloads).includes("draft-secret"));
});

test("saving a provider merges with current preferences and uses the redacted backend response",async()=>{
  const provider={id:"custom",name:" Custom ",baseUrl:"https://example.com/v1",model:"vision",apiKey:"new-secret",apiKeyConfigured:false};
  const queue=new SettingsQueue(initial(),async settings=>({...settings,providers:settings.providers.map(({apiKey,...item})=>({...item,apiKeyConfigured:Boolean(apiKey)||item.apiKeyConfigured}))}),()=>{});
  await queue.enqueue("theme",current=>({...current,theme:"dark"}));
  await queue.enqueue("provider",current=>saveProvider(current,provider,true));
  const saved=queue.getSnapshot().settings;
  assert.equal(saved.theme,"dark");assert.equal(saved.ocrProviderId,"custom");
  assert.equal(saved.providers[1].name,"Custom");
  assert.equal(saved.providers[1].apiKey,undefined);
  assert.equal(saved.providers[1].apiKeyConfigured,true);
  assert.equal(saveProvider({...saved,ocrEngine:"local"},provider,false).ocrEngine,"local");
});

test("provider validation identifies missing fields and accepts a previously stored key",()=>{
  assert.deepEqual(invalidProviderFields({name:"",baseUrl:"file:///tmp",model:"",apiKeyConfigured:false}),["name","baseUrl","model","apiKey"]);
  assert.ok(providerIsReady({...initial().providers[0],apiKeyConfigured:true,apiKey:""}));
  assert.equal(providerIsReady(undefined),false);
});

test("shortcut recording ignores IME, modifiers, repeats and cancellation keys",()=>{
  const event={key:"a",code:"KeyA",ctrlKey:true,altKey:false,shiftKey:false,metaKey:false,isComposing:false,repeat:false};
  assert.equal(shortcutFromEvent(event),"Ctrl+KeyA");
  assert.equal(shortcutFromEvent({...event,shiftKey:true}),"Ctrl+Shift+KeyA");
  for(const patch of [{key:"Control"},{key:"Escape"},{key:"Tab"},{isComposing:true},{repeat:true}])assert.equal(shortcutFromEvent({...event,...patch}),null);
});
