'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../ui/artcraft-view.js');
let input={};try{input=require('../window-input.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

test('typed input rejects unbounded text, shell fields, invalid coordinates and unknown keys',()=>{
 assert.equal(typeof input.validCraftInput,'function','typed input validation is missing');
 const token='a'.repeat(32),click={appId:'light',kind:'click',frameId:token,x:.5,y:.5};
 assert.equal(input.validCraftInput(click),true);
 assert.equal(input.validCraftInput({appId:'light',kind:'arm',frameWidth:1280,frameHeight:720}),true);
 for(const value of [{...click,x:-.1},{...click,y:NaN},{...click,exe:'cmd.exe'},{...click,kind:'drag'},{...click,frameId:'old'},{appId:'light',kind:'text',frameId:token,text:'a'.repeat(257)},{appId:'light',kind:'text',frameId:token,text:'\u0000'},{appId:'light',kind:'key',frameId:token,key:'Alt+F4'},{appId:'light',kind:'scroll',frameId:token,x:.5,y:.5,delta:2001}])assert.equal(input.validCraftInput(value),false);
});

test('physical negative monitor coordinates and DPI map through the captured native frame into egui points',()=>{
 assert.equal(typeof input.captureGeometry,'function','capture mapping is missing');
 const native={frame:{x:-1600,y:-200,width:1500,height:1000},client:{x:-1592,y:-154,width:1484,height:946},dpi:144};
 const geometry=input.captureGeometry(native,{window:[989.333333,630.666667],pixelsPerPoint:1.5},{frameWidth:1500,frameHeight:1000});
 const point=input.clientPoint(geometry,.5,.5);assert.ok(Math.abs(point.x-494.666667)<.001);assert.ok(Math.abs(point.y-302.666667)<.001);
 assert.throws(()=>input.clientPoint(geometry,.5,.01),/client|Fensterrahmen/);
 assert.throws(()=>input.captureGeometry(native,{window:[989,600],pixelsPerPoint:1.5},{frameWidth:1500,frameHeight:1000}),/Geometrie/);
 assert.throws(()=>input.captureGeometry(native,{window:[989.333333,630.666667],pixelsPerPoint:1.5},{frameWidth:800,frameHeight:800}),/Geometrie/);
});

test('video letterboxing cannot send clicks from its empty borders',()=>{
 assert.equal(typeof api.videoPoint,'function','video mapping is missing');
 const rect={left:100,top:100,width:800,height:600};
 assert.deepEqual(api.videoPoint(rect,1920,1080,500,400),{x:.5,y:.5});
 assert.equal(api.videoPoint(rect,1920,1080,500,120),null);
 assert.deepEqual(api.videoPoint(rect,1080,1920,500,400),{x:.5,y:.5});
 assert.equal(api.videoPoint(rect,1080,1920,110,400),null);
});

test('renderer input drops late grants, hidden panes, privacy and app changes',async()=>{
 assert.equal(typeof api.createInputRequests,'function','guarded input requests are missing');
 for(const change of ['privacy','hidden','selection','stream']){
  let finish,visible=true;const calls=[],c=api.createInputRequests({invoke:(name,payload)=>{calls.push({name,payload});return new Promise(resolve=>finish=resolve);},isVisible:()=>visible});
  c.setContext({appId:'light',active:true});const pending=c.arm(1280,720);
  if(change==='privacy')c.setContext({appId:'light',active:true,privacyLocked:true});
  if(change==='hidden'){visible=false;c.visibilityChanged();}
  if(change==='selection')c.setContext({appId:'photo',active:true});
  if(change==='stream')c.setContext({appId:'light',active:false});
  finish({ok:true,frameId:'a'.repeat(32)});await pending;assert.equal(c.enabled,false);
  await c.send({kind:'click',x:.5,y:.5});assert.equal(calls.length,1);c.dispose();
 }
});

test('mounted input stays view-only until activation and sends only points inside the displayed live frame',async()=>{
 const nodes=new Map(),calls=[];
 const make=()=>({nodeType:1,hidden:false,firstChild:{textContent:''},children:[],attributes:{},value:'',events:new Map(),style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},getAttribute(name){return this.attributes[name];},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},addEventListener(name,fn){this.events.set(name,fn);},remove(){},focus(){doc.activeElement=this;},getBoundingClientRect(){return {left:100,top:100,width:800,height:600};},videoWidth:1920,videoHeight:1080});
 const doc={hidden:false,createElement:make,createElementNS:make,addEventListener(){},removeEventListener(){}};
 const container=make();container.ownerDocument=doc;container.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,make());return nodes.get(selector);};const el=key=>container.querySelector('[data-ac="'+key+'"]');
 const previous=global.WindowStream;global.WindowStream={createVideoStream:({onChange})=>({setContext(value){onChange({active:value.running===true&&value.windowVisible!==false&&!value.privacyLocked,pending:false});},stop(){onChange({active:false,pending:false});},start(){},visibilityChanged(){},dispose(){}})};
 try{
  const view=api.mount({container,invoke:async(method,payload)=>{calls.push({method,payload});return method==='craft-input'?{ok:true,frameId:'a'.repeat(32)}:null;}});
  view.update({selectedAppId:'light',apps:[{id:'light',name:'LightCraft',installed:true,running:true,bridgeState:'ready',inputSupported:true}],windowVisible:true});
  await el('stage').events.get('click')({clientX:500,clientY:400});assert.equal(calls.filter(call=>call.method==='craft-input').length,0);
  await el('input-enable').events.get('click')();assert.equal(calls.at(-1).payload.kind,'arm');
  el('stage').events.get('click')({clientX:500,clientY:120});assert.equal(calls.at(-1).payload.kind,'arm');
  el('stage').events.get('click')({clientX:500,clientY:400});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls.at(-1).payload,{appId:'light',kind:'click',x:.5,y:.5,frameId:'a'.repeat(32)});
  view.update({privacyLocked:true});el('stage').events.get('click')({clientX:500,clientY:400});assert.equal(calls.filter(call=>call.method==='craft-input').length,2);view.dispose();
 }finally{global.WindowStream=previous;}
});
