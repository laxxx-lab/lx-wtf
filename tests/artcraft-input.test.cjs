'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createArtcraft}=require('../artcraft.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'craft-input-')),installRoot=path.join(root,'installed'),cacheRoot=path.join(root,'cache'),exePath=path.join(installRoot,'apps/LightCraft/lightcraft.exe');fs.mkdirSync(path.dirname(exePath),{recursive:true});fs.writeFileSync(exePath,'fixture');
 let data={processes:[{pid:42,mainWindowHandle:123,executablePath:exePath,controlPort:7979}],listeners:[{pid:42,port:7979,localAddress:'127.0.0.1'}]},native={pid:42,windowId:'123',executablePath:exePath,visible:true,minimized:false,enabled:true,popupWindowId:'123',dpi:144,frame:{x:-1600,y:50,width:1500,height:1000},client:{x:-1592,y:96,width:1484,height:946}},inspect={window:[1484/1.5,946/1.5],pixelsPerPoint:1.5,ui:{dialog:null},fileDialogs:[]},allowed=true,release;
 let captureTarget={appId:'light',pid:42,windowId:'123'},captureGeneration=1;const calls=[],controller=createArtcraft({installRoot,cacheRoot,initialAppId:'light',canInput:()=>allowed,readProcesses:async()=>data,readWindow:async()=>native,transport:async(c,r)=>{calls.push(r);if(r.method==='ui.inspect'){if(release)await release;return inspect;}return null;}}),m={...controller,input:payload=>controller.input(payload,{captureTarget,captureGeneration,getCaptureGeneration:()=>captureGeneration})};
 t.after(()=>{m.dispose();fs.rmSync(root,{recursive:true,force:true});});
 return {m,calls,arm:()=>m.input({appId:'light',kind:'arm',frameWidth:1500,frameHeight:1000}),setCapture:value=>captureTarget=value,advanceCapture:()=>captureGeneration++,setData:value=>data=value,setNative:value=>native={...native,...value},setInspect:value=>inspect={...inspect,...value},setAllowed:value=>allowed=value,pause:promise=>release=promise,data:()=>data};
}
test('verified LightCraft live API maps captured points and sends bounded click, text, key and scroll',async t=>{
 const f=fixture(t);assert.equal(typeof f.m.input,'function','live input is missing');const grant=await f.arm();assert.match(grant.frameId,/^[a-f0-9]{32}$/);assert.equal(grant.appId,'light');
 await f.m.input({appId:'light',kind:'click',frameId:grant.frameId,x:.5,y:.5});const click=f.calls.at(-1);assert.equal(click.method,'ui.click');assert.ok(Math.abs(click.params.x-1484/3)<.001);assert.ok(Math.abs(click.params.y-454/1.5)<.001);
 await f.m.input({appId:'light',kind:'text',frameId:grant.frameId,text:'Hallo'});assert.deepEqual(f.calls.at(-1),{method:'ui.text',params:{text:'Hallo'}});
 await f.m.input({appId:'light',kind:'key',frameId:grant.frameId,key:'Enter'});assert.deepEqual(f.calls.at(-1),{method:'ui.key',params:{key:'Enter'}});
 await f.m.input({appId:'light',kind:'scroll',frameId:grant.frameId,x:.5,y:.5,delta:120});assert.deepEqual(f.calls.slice(-2).map(r=>r.method),['ui.move','ui.scroll']);assert.equal(f.calls.at(-1).params.dy,-120);
});
test('wrong PID, wrong executable, native modal, minimized window and lost GUI listener never dispatch input',async t=>{
 for(const mutate of [f=>f.setNative({pid:99}),f=>f.setNative({executablePath:'C:\\Windows\\cmd.exe'}),f=>f.setNative({enabled:false,popupWindowId:'456'}),f=>f.setNative({minimized:true}),f=>{const d=f.data();d.listeners[0].pid=99;}]){
  const f=fixture(t);assert.equal(typeof f.m.input,'function');const grant=await f.arm();mutate(f);const before=f.calls.length;await assert.rejects(f.m.input({appId:'light',kind:'click',frameId:grant.frameId,x:.5,y:.5}));assert.ok(!f.calls.slice(before).some(r=>r.method==='ui.click'));
 }
});
test('geometry, app dialogs and selection changes invalidate the grant instead of replaying stale input',async t=>{
 for(const mutate of [f=>f.setNative({client:{x:-1592,y:96,width:1400,height:900}}),f=>f.setInspect({ui:{dialog:{kind:'export'}}}),f=>f.m.select('photo'),f=>f.m.stop(),f=>f.setAllowed(false)]){
  const f=fixture(t);assert.equal(typeof f.m.input,'function');const grant=await f.arm();await mutate(f);const before=f.calls.length;await assert.rejects(f.m.input({appId:'light',kind:'text',frameId:grant.frameId,text:'private'}));assert.ok(!f.calls.slice(before).some(r=>r.method==='ui.text'));
 }
});
test('privacy and late selection reject an arm resolving after the visible context changed',async t=>{
 for(const change of [f=>f.m.stop(),f=>f.m.select('photo'),f=>f.setAllowed(false)]){
  const f=fixture(t);assert.equal(typeof f.m.input,'function');let release;f.pause(new Promise(resolve=>release=resolve));const pending=f.arm();await new Promise(resolve=>setImmediate(resolve));await change(f);release();await assert.rejects(pending);assert.ok(!f.calls.some(r=>r.method==='ui.click'));
 }
});
test('capture owner and generation stay bound even when a same-app replacement would otherwise pass native ownership',async t=>{
 const f=fixture(t);f.setCapture({appId:'light',pid:99,windowId:'456'});await assert.rejects(f.arm());assert.equal(f.calls.length,0);
 const g=fixture(t);let release;g.pause(new Promise(resolve=>release=resolve));const pending=g.arm();await new Promise(resolve=>setImmediate(resolve));g.advanceCapture();release();await assert.rejects(pending);assert.ok(!g.calls.some(r=>r.method==='ui.click'));
 const h=fixture(t),grant=await h.arm();h.advanceCapture();await assert.rejects(h.m.input({appId:'light',kind:'key',frameId:grant.frameId,key:'Enter'}));assert.ok(!h.calls.some(r=>r.method==='ui.key'));
});
