'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url');
const api=(()=>{try{return require('../circle-interest.cjs');}catch(e){if(e.code==='MODULE_NOT_FOUND')return {};throw e;}})();
test('circle selection crops normalized geometry to source pixels, including mixed DPI and negative monitor origins',()=>{
 assert.equal(typeof api.selectionPixels,'function');
 assert.deepEqual(api.selectionPixels({x:.1,y:.2,width:.3,height:.4},{width:2160,height:3840}),{x:216,y:768,width:648,height:1536});
 for(const rect of [{x:-.1,y:0,width:.2,height:.2},{x:.9,y:0,width:.2,height:.2},{x:0,y:0,width:0,height:.2},{x:NaN,y:0,width:.2,height:.2},{x:0,y:0,width:.2,height:.2,image:'injected'}])assert.throws(()=>api.selectionPixels(rect,{width:1920,height:1080}));
});
function fixture(){
 const windows=[],handlers=new Map(),root=path.resolve(__dirname,'..');let permitted=true,crop=null,submitted=null,options=null;
 const image={isEmpty:()=>false,getSize:()=>({width:1920,height:1080}),toDataURL:()=> 'data:image/png;base64,aGVsbG8=',crop:r=>{crop=r;return {getSize:()=>({width:r.width,height:r.height}),resize(){return this;},toJPEG:()=>Buffer.from([255,216,255,224,0,0,0,0])};}};
 class Window extends EventEmitter {constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(_c,value)=>{this.value=value;};windows.push(this);}async loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;}show(){}focus(){}isDestroyed(){return !!this.dead;}destroy(){this.dead=true;this.emit('closed');}}
 const electron={BrowserWindow:Window,screen:new EventEmitter(),desktopCapturer:{getSources:async value=>{options=value;return [{id:'screen:0:0',display_id:'2',thumbnail:image}];}},ipcMain:{handle:(key,fn)=>handlers.set(key,fn),removeHandler:key=>handlers.delete(key)}};
 Object.assign(electron.screen,{getCursorScreenPoint:()=>({x:-100,y:100}),getDisplayNearestPoint:()=>({id:2,bounds:{x:-1920,y:0,width:1920,height:1080},scaleFactor:1})});
 const c=api.createCircleInterest({electron,root,allowed:()=>permitted,context:()=> 'session-1',onQuestion:async value=>{submitted=value;return {ok:true};}});
 return {c,windows,handlers,setAllowed:value=>permitted=value,get crop(){return crop;},get submitted(){return submitted;},get options(){return options;},invoke:(method,value,event)=>handlers.get('circle:invoke')(event||{sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame},method,value)};
}
test('only the local selection frame may submit a crop; cancelled or private selections never submit',async()=>{
 assert.equal(typeof api.createCircleInterest,'function');const f=fixture();await f.c.show();assert.equal(f.windows[0].options.x,-1920);
 await assert.rejects(f.invoke('ask',{region:{x:.1,y:.1,width:.2,height:.2},question:'Was ist das?'},{sender:{},senderFrame:{}}),/Zugriff/);
 const preview=await f.invoke('preview',{region:{x:.1,y:.1,width:.2,height:.2}});await f.invoke('ask',{selectionId:preview.selectionId,question:'Was ist das?'});assert.deepEqual(f.crop,{x:192,y:108,width:384,height:216});assert.equal(f.submitted.sessionId,'session-1');assert.equal(f.submitted.question,'Was ist das?');assert.equal(f.windows[0].dead,true);
 await f.c.show();f.setAllowed(false);await assert.rejects(f.invoke('ask',{region:{x:.1,y:.1,width:.2,height:.2},question:'Was ist das?'},{sender:f.windows[1].webContents,senderFrame:f.windows[1].webContents.mainFrame}));assert.equal(f.windows[1].dead,true);f.c.dispose();assert.equal(f.handlers.size,0);
});
test('the exact preview bytes are analyzed; a superseded preview or unpreviewed region cannot be submitted',async()=>{
 const f=fixture();await f.c.show();const first=await f.invoke('preview',{region:{x:.1,y:.1,width:.2,height:.2}}),second=await f.invoke('preview',{region:{x:.5,y:.3,width:.2,height:.2}});
 await assert.rejects(f.invoke('ask',{selectionId:first.selectionId,question:'Was ist das?'}));await assert.rejects(f.invoke('ask',{region:{x:.1,y:.1,width:.2,height:.2},question:'Was ist das?'}));
 await f.invoke('ask',{selectionId:second.selectionId,question:'Was ist das?'});assert.equal(f.submitted.image,second.image.split(',')[1]);assert.deepEqual(f.submitted.region,{x:960,y:324,width:384,height:216});f.c.dispose();
});
test('wide monitors are captured at source resolution instead of shrinking message text before selection',async()=>{
 const f=fixture();f.c.dispose();
 const windows=[],handlers=new Map();let options;const image={getSize:()=>({width:5120,height:1440}),isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,aGVsbG8='};
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};windows.push(this);}async loadFile(){}show(){}focus(){}isDestroyed(){return false;}destroy(){}}
 const screen=new EventEmitter();Object.assign(screen,{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({id:1,bounds:{x:0,y:0,width:5120,height:1440},scaleFactor:1})});
 const c=api.createCircleInterest({root:path.resolve(__dirname,'..'),electron:{screen,BrowserWindow:Window,desktopCapturer:{getSources:async value=>{options=value;return [{display_id:'1',thumbnail:image}];}},ipcMain:{handle:(k,fn)=>handlers.set(k,fn),removeHandler:k=>handlers.delete(k)}},allowed:()=>true,context:()=> 'session',onQuestion:async()=>{}});await c.show();assert.equal(options.thumbnailSize.width,5120);assert.equal(options.thumbnailSize.height,1440);c.dispose();
});
