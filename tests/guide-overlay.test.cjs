'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const api=(()=>{try{return require('../guide-overlay.cjs');}catch(error){if(error.code==='MODULE_NOT_FOUND')return {};throw error;}})();
const observedTime=Date.UTC(2026,9,10,12);
const source={purpose:'guide',pid:123,windowId:456,windowRect:{x:100,y:100,width:900,height:600},targetRect:{x:300,y:250,width:100,height:40},observedAt:new Date(observedTime).toISOString(),label:'Einstellungen',text:'Hier öffnen und anschließend das Menü lesen.'};
function fixture({readWindow,loadGate,displays}={}){
  assert.equal(typeof api.createGuideOverlay,'function','guide overlay controller is missing');
  let time=observedTime,timerId=0;
  const windows=[],changes=[],timers=new Map(),reads=[],conversions=[];
  let native={valid:true,pid:123,windowId:456,...source.windowRect,minimized:false,visible:true,app:'chrome',windowTitle:'Testseite'};
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.sent=[];this.webContents={send:(_channel,data)=>this.sent.push(data),setWindowOpenHandler:fn=>this.openHandler=fn,on(){}};windows.push(this);}
    setIgnoreMouseEvents(value,options){this.clickThrough=value;this.forward=options.forward;}
    async loadFile(file){this.file=file;if(loadGate)await loadGate;}
    isDestroyed(){return this.dead===true;}
    setBounds(rect){this.bounds=rect;}
    showInactive(){this.shown=true;}
    destroy(){this.dead=true;this.shown=false;}
    focus(){throw Error('Must not focus a window');}
    show(){throw Error('Must use showInactive');}
  }
  const screens=displays||[{id:1,scaleFactor:1,bounds:{x:0,y:0,width:1920,height:1080},physical:{x:0,y:0,width:1920,height:1080}}];
  const matching=rect=>screens.find(display=>rect.x>=display.physical.x&&rect.y>=display.physical.y&&rect.x+rect.width<=display.physical.x+display.physical.width&&rect.y+rect.height<=display.physical.y+display.physical.height);
  const screen=new EventEmitter();
  screen.getAllDisplays=()=>screens;
  screen.dipToScreenRect=(_window,rect)=>({...screens.find(display=>JSON.stringify(display.bounds)===JSON.stringify(rect)).physical});
  screen.screenToDipRect=(_window,rect)=>{conversions.push({...rect});const display=matching(rect);assert.ok(display,'physical overlay must fit one monitor');return {x:Math.round(display.bounds.x+(rect.x-display.physical.x)/display.scaleFactor),y:Math.round(display.bounds.y+(rect.y-display.physical.y)/display.scaleFactor),width:Math.round(rect.width/display.scaleFactor),height:Math.round(rect.height/display.scaleFactor)};};
  const controller=api.createGuideOverlay({electron:{BrowserWindow:Window,screen},root:path.resolve(__dirname,'..'),readWindow:async value=>{reads.push(value);return readWindow?readWindow(value):native;},now:()=>time,timers:{setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:time+delay});return id;},clearTimeout:id=>timers.delete(id)},onChange:value=>changes.push(value)});
  return {controller,windows,changes,reads,conversions,screen,setNative:value=>native={...native,...value},async advance(ms){time+=ms;const due=[...timers].filter(([_id,timer])=>timer.at<=time);for(const [id,timer]of due){timers.delete(id);await timer.fn();}},timerCount:()=>timers.size};
}

test('guide shows only a fresh identified native window and sends a simulated pointer without focus or input',async()=>{
  const f=fixture();const result=await f.controller.show({...source,snapshotId:'SNAPSHOT_TOKEN'});
  assert.deepEqual(f.reads,[{pid:123,windowId:456},{pid:123,windowId:456}]);
  assert.equal(result.visible,true);assert.equal(result.clickThrough,true);assert.equal(result.simulatedPointer,true);
  assert.equal(result.observedAt,source.observedAt);assert.equal(Date.parse(result.expiresAt),observedTime+15000);
  const window=f.windows[0];assert.equal(window.options.focusable,false);assert.equal(window.options.webPreferences.sandbox,true);assert.equal(window.clickThrough,true);assert.equal(window.forward,true);assert.equal(window.shown,true);
  assert.equal(window.sent[0].type,'guide');assert.ok(window.sent[0].targetRect);assert.equal(window.options.webPreferences.nodeIntegration,false);
  assert.doesNotMatch(JSON.stringify(result)+JSON.stringify(f.changes),/SNAPSHOT_TOKEN|windowId|toolCallId/);
  f.controller.dispose();assert.equal(window.dead,true);assert.equal(f.timerCount(),0);
});

test('rejects stale future missing or malformed source positions before native calls',async()=>{
  for(const invalid of [
    {...source,observedAt:new Date(observedTime-15001).toISOString()},
    {...source,observedAt:new Date(observedTime+1001).toISOString()},
    {...source,observedAt:undefined},
    {...source,windowId:'456; Start-Process calc'},
    {...source,pid:0},
    {...source,windowRect:{...source.windowRect,width:0}},
    {...source,targetRect:{x:20,y:250,width:100,height:40}},
    {...source,shell:'evil'},
  ]){const f=fixture();await assert.rejects(f.controller.show(invalid));assert.equal(f.reads.length,0);assert.equal(f.windows.length,0);f.controller.dispose();}
});

test('rejects changed native identity hidden minimized missing or sensitive windows',async()=>{
  for(const native of [
    {valid:false},{pid:987},{windowId:987},{minimized:true},{visible:false},{x:103},
    {app:'Bitwarden'},{windowTitle:'Anmeldung'},{windowTitle:'Private browsing'},
  ]){const f=fixture();f.setNative(native);await assert.rejects(f.controller.show(source));assert.equal(f.windows.length,0);f.controller.dispose();}
});

test('activity requires an explicit task and tool association and has no guided pointer',async()=>{
  const f=fixture();await assert.rejects(f.controller.show({...source,purpose:'activity'}));
  const result=await f.controller.show({...source,purpose:'activity',taskId:'TASK_TOKEN',toolCallId:'CALL_TOKEN',targetRect:undefined});
  assert.equal(result.purpose,'activity');assert.equal(result.simulatedPointer,false);assert.equal(Date.parse(result.expiresAt),observedTime+10000);
  assert.doesNotMatch(JSON.stringify(result),/TASK_TOKEN|CALL_TOKEN/);f.controller.dispose();
});

test('splits a window across negative-origin monitors and converts every piece using current DPI',async()=>{
  const displays=[{id:1,scaleFactor:1.5,bounds:{x:-1280,y:0,width:1280,height:720},physical:{x:-1920,y:0,width:1920,height:1080}},{id:2,scaleFactor:1,bounds:{x:0,y:0,width:1920,height:1080},physical:{x:0,y:0,width:1920,height:1080}}];
  const f=fixture({displays});f.setNative({x:-300,y:100,width:900,height:600});
  await f.controller.show({...source,windowRect:{x:-300,y:100,width:900,height:600},targetRect:{x:250,y:250,width:100,height:40}});
  assert.equal(f.windows.length,2);assert.equal(f.conversions.length,2);
  assert.ok(f.windows[0].bounds.x<0);assert.equal(f.windows[1].bounds.x,0);
  assert.equal(f.windows.filter(window=>window.sent[0].targetRect).length,1);
  assert.equal(f.windows.filter(window=>window.sent[0].primary).length,1);f.controller.dispose();
});

test('native movement clears the overlay instead of moving a stale pointer',async()=>{
  const f=fixture();await f.controller.show(source);const bounds={...f.windows[0].bounds};
  f.setNative({x:110});await f.advance(400);
  assert.equal(f.controller.snapshot().visible,false);assert.equal(f.windows[0].dead,true);assert.deepEqual(f.windows[0].bounds,bounds);assert.equal(f.timerCount(),0);
});

test('source lifetime expires without refreshing its observation timestamp',async()=>{
  const f=fixture();await f.controller.show({...source,observedAt:new Date(observedTime-14000).toISOString()});
  await f.advance(1000);assert.equal(f.controller.snapshot().visible,false);assert.equal(f.windows[0].dead,true);f.controller.dispose();
});

test('clear during asynchronous verification prevents late overlay resurrection',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({readWindow:async()=>{await gate;return {valid:true,pid:123,windowId:456,...source.windowRect,minimized:false,visible:true,app:'chrome',windowTitle:'Testseite'};}});
  const pending=f.controller.show(source);f.controller.clear();release();await assert.rejects(pending,/gestoppt|ersetzt/);
  assert.equal(f.windows.length,0);assert.equal(f.controller.snapshot().visible,false);f.controller.dispose();
});

test('clear during overlay load and monitor changes tear down every segment',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({loadGate:gate});
  const pending=f.controller.show(source);await Promise.resolve();await Promise.resolve();
  f.controller.clear();release();await assert.rejects(pending,/gestoppt|ersetzt/);assert.ok(f.windows.every(window=>window.dead));
  const current=fixture();await current.controller.show(source);current.screen.emit('display-metrics-changed',{},{});assert.equal(current.controller.snapshot().visible,false);
  current.controller.dispose();assert.equal(current.screen.listenerCount('display-metrics-changed'),0);f.controller.dispose();
});

test('native reader passes validated numeric identifiers as separate bounded PowerShell arguments',async()=>{
  assert.equal(typeof api.readWindowBounds,'function','native window reader is missing');let command;
  const result=await api.readWindowBounds({pid:123,windowId:'456'},{platform:'win32',runFile:async(exe,args,options)=>{command={exe,args,options};return {stdout:JSON.stringify({valid:true,pid:123,windowId:456,...source.windowRect,minimized:false,visible:true,app:'chrome',windowTitle:'Testseite'})};}});
  assert.equal(result.windowId,456);assert.ok(command.args.includes('-File'));assert.ok(!command.args.includes('-Command'));assert.deepEqual(command.args.slice(-4),['-WindowId','456','-ProcessId','123']);assert.equal(command.options.timeout,3000);assert.equal(command.options.windowsHide,true);
  await assert.rejects(api.readWindowBounds({pid:123,windowId:'456; calc'},{platform:'win32',runFile:async()=>{throw Error('must not execute');}}));
});

test('guide renderer uses text nodes and a distinct synthetic pointer without input handlers',()=>{
  const file=path.join(__dirname,'../ui/guide.js');assert.ok(fs.existsSync(file),'guide renderer is missing');
  const nodes=new Map();let receive;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',style:{},attributes:{},setAttribute(key,value){this.attributes[key]=value;}});return nodes.get(id);};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{document:{getElementById:element},window:{guide:{on:callback=>receive=callback}}});
  receive({type:'guide',purpose:'guide',primary:true,width:600,height:400,windowRect:{x:12,y:12,width:500,height:300},targetRect:{x:120,y:80,width:60,height:30},label:'<img src=x onerror=evil()>',text:'Bitte hier öffnen.'});
  assert.equal(element('label').textContent,'<img src=x onerror=evil()>');assert.equal(element('pointer').hidden,false);assert.equal(element('pointer-label').textContent,'Hier klicken');
  receive({type:'guide',purpose:'activity',primary:true,width:600,height:400,windowRect:{x:12,y:12,width:500,height:300},targetRect:null,label:'Editor',text:''});assert.equal(element('pointer').hidden,true);
});
