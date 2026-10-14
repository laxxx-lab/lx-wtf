'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {EventEmitter}=require('node:events');
const api=(()=>{try{return require('../workbench.cjs');}catch(error){if(error.code==='MODULE_NOT_FOUND')return {};throw error;}})();

test('project navigation binds exact local project IDs and paths through trusted IPC',async()=>{
 const id='37b9ad63-5a29-48a1-83b2-37984291c46a',calls=[];let locked=false;
 const f=fixture({getSnapshot:()=>({privacyLocked:locked}),onVisual:async(method,payload)=>{calls.push({method,payload});return {ok:true};}});await f.controller.show('console');
 for(const [method,payload] of [['project-snapshot'],['project-pick'],['project-select',{id}],['project-rename',{id,name:'Meine Arbeit'}],['project-list',{id,path:'docs'}],['project-read',{id,path:'README.md'}],['project-command',{id,path:'README.md',text:'Fasse diese Datei zusammen.'}],['project-remove',{id}]])await f.invoke(method,payload);
 assert.equal(calls.length,8);assert.deepEqual(calls[6],{method:'project-command',payload:{id,path:'README.md',text:'Fasse diese Datei zusammen.'}});
 for(const [method,payload]of [['project-select',{id:'anything'}],['project-select',{id,root:'C:/'}],['project-read',{id,path:'../secret.md'}],['project-read',{id,path:'C:/secret.md'}],['project-read',{id,path:'README.md',shell:'cmd.exe'}],['project-command',{id,text:''}],['project-rename',{id,name:'x\u0000'}],['project-pick',{root:'C:/'}]])await assert.rejects(f.invoke(method,payload));
 locked=true;await assert.rejects(f.invoke('project-read',{id,path:'README.md'}),/Datenschutz/);await assert.rejects(f.invoke('project-command',{id,text:'Weiter'}),/Datenschutz/);assert.equal(calls.length,8);f.controller.destroy();
});

test('workspace layout keeps native browser aligned with project sidebar and global composer',async()=>{
 const f=fixture();await f.controller.show({tab:'browser',url:'https://example.com'});
 await f.invoke('workspace-layout',{sidebar:true});assert.equal(f.views[0].bounds.x,254);assert.equal(f.views[0].bounds.height,f.windows[0].getContentBounds().height-326);
 await f.invoke('workspace-layout',{sidebar:false});assert.equal(f.views[0].bounds.x,22);
 for(const payload of [{sidebar:1},{sidebar:true,x:-999},null])await assert.rejects(f.invoke('workspace-layout',payload));f.controller.destroy();
});
test('agent browser control returns actual page metadata and refuses private or arbitrary operations',async()=>{
 let locked=false;const f=fixture({getSnapshot:()=>({privacyLocked:locked})});
 assert.equal(f.controller.browserState.ready,false);assert.equal(f.windows.length,0);
 const page=await f.controller.controlBrowser({action:'navigate',url:'https://example.com'});
 assert.equal(page.ready,true);assert.equal(page.url,'https://example.com/');assert.equal(page.title,'Page');assert.equal(page.visible,true);assert.equal(page.tab,'browser');
 f.controller.hide();assert.equal(f.controller.browserState.visible,false);assert.equal(f.controller.browserState.url,page.url);
 for(const value of [{action:'evaluate',script:'alert(1)'},{action:'state',url:'https://example.com'},{action:'navigate',url:'file:///private'},{action:'navigate',url:'https://user:secret@example.com'},{action:'reload',shell:'cmd'}])await assert.rejects(f.controller.controlBrowser(value));
 locked=true;assert.equal(f.controller.browserState,null);await assert.rejects(f.controller.controlBrowser({action:'state'}),/Datenschutz/);f.controller.destroy();
});

test('failed browser navigation cannot return an opening confirmation',async()=>{
 const f=fixture();await f.controller.show('console');f.views[0].webContents.loadURL=async()=>{throw Error('ERR_NAME_NOT_RESOLVED');};
 await assert.rejects(f.controller.controlBrowser({action:'navigate',url:'https://unreachable.invalid'}),/ERR_NAME_NOT_RESOLVED/);f.controller.destroy();
});

test('privacy during pending agent navigation never reveals the newly loaded browser',async()=>{
 let locked=false,release;const f=fixture({getSnapshot:()=>({privacyLocked:locked})});await f.controller.show('console');f.controller.hide();
 const contents=f.views[0].webContents;contents.loadURL=url=>new Promise(resolve=>{release=()=>{contents.url=url;resolve();};});
 const navigating=f.controller.controlBrowser({action:'navigate',url:'https://example.com'});await new Promise(resolve=>setImmediate(resolve));locked=true;f.controller.publish({type:'privacy-state',locked:true});release();
 await assert.rejects(navigating,/Datenschutz/);assert.equal(f.controller.visible,false);assert.equal(f.controller.activeTab,'console');assert.equal(f.views[0].visible,false);f.controller.destroy();
});

test('privacy lock and unlock cancels an older pending browser opening',async()=>{
 let locked=false,release;const f=fixture({getSnapshot:()=>({privacyLocked:locked})});await f.controller.show('console');f.controller.hide();const contents=f.views[0].webContents;
 contents.loadURL=url=>new Promise(resolve=>{release=()=>{contents.url=url;resolve();};});const navigating=f.controller.controlBrowser({action:'navigate',url:'https://example.com'});await new Promise(resolve=>setImmediate(resolve));
 locked=true;f.controller.publish({type:'privacy-state',locked:true});locked=false;f.controller.publish({type:'privacy-state',locked:false});release();await assert.rejects(navigating,/gestoppt|Datenschutz/);assert.equal(f.controller.visible,false);f.controller.destroy();
});

test('a failed main-frame load is visible to agent status and clears only with a successful navigation',async()=>{
 const f=fixture();await f.controller.controlBrowser({action:'navigate',url:'https://example.com'});const contents=f.views[0].webContents;
 contents.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://example.com',true);assert.equal(f.controller.browserState.ready,false);assert.match(f.controller.browserState.error,/ERR_NAME_NOT_RESOLVED/);
 contents.emit('did-fail-load',{},-105,'child failed','https://example.com',false);assert.match(f.controller.browserState.error,/ERR_NAME_NOT_RESOLVED/);
 contents.emit('did-navigate',{},'https://example.com');assert.equal(f.controller.browserState.ready,true);assert.equal(f.controller.browserState.error,null);f.controller.destroy();
});

test('automatic project metadata loading cannot cancel a workbench window still opening',async()=>{
 for(const agent of [false,true]){
  let resume;const loading=new Promise(resolve=>resume=resolve),id='37b9ad63-5a29-48a1-83b2-37984291c46a';
  const f=fixture({beforeLoadFile:()=>loading,onVisual:async()=>({id,path:'',entries:[]})});const opening=agent?f.controller.present({tab:'console',requestId:'agent'}):f.controller.show('console');
  await f.invoke('project-snapshot');await f.invoke('project-list',{id,path:''});resume();await opening;assert.equal(f.controller.visible,true);assert.equal(f.windows[0].focusCalls,agent?0:1);assert.equal(f.controller.presentation.owner,agent?'agent':'user');f.controller.destroy();
 }
});

test('collaboration snapshot projects health, explicit attention and revision without private source or repair data',()=>{
 const health={state:'degraded',summary:'Mikrofon wartet',checks:[{key:'microphone',state:'degraded',summary:'Keine Frames',deviceId:'PRIVATE'}],repair:{kind:'microphone',reason:'token=SECRET',command:'PRIVATE'}};
 const attention={kind:'window',label:'Editor',observedAt:'2026-10-12T12:00:00Z',selection:'pointer',stale:true,summary:'Frühere Beobachtung',pid:42,hwnd:'PRIVATE',bounds:{x:1},text:'PRIVATE'};
 const result=api.safeSnapshot({voiceHealth:health,attention,jobQueue:{jobs:[{id:'test',status:'queued',revision:2,lastAmendment:'PRIVATE'}]}});
 assert.deepEqual(result.voiceHealth,{state:'degraded',summary:'Mikrofon wartet',checks:[{key:'microphone',state:'degraded',summary:'Keine Frames'}],repair:{kind:'microphone',reason:'token=[redacted]'}});
 assert.deepEqual(result.attention,{kind:'window',label:'Editor',observedAt:'2026-10-12T12:00:00.000Z',selection:'pointer',stale:true,summary:'Frühere Beobachtung'});assert.equal(result.jobQueue.jobs[0].revision,2);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|deviceId|bounds|hwnd|lastAmendment/);
 assert.equal(api.safeSnapshot({privacyLocked:true,attention}).attention,null);assert.equal(api.safeSnapshot({attention:{...attention,observedAt:'bad'}}).attention,null);assert.equal(api.safeSnapshot().voiceHealth,null);
});

test('job amendments require an owned actionable UUID and bounded exact payload while preserving manual ownership',async()=>{
 const id='37b9ad63-5a29-48a1-83b2-37984291c46a',calls=[];let status='queued',locked=false,blocked=false;
 const f=fixture({getSnapshot:()=>({privacyLocked:locked,jobQueue:{blocked,jobs:[{id,status}]}}),onVisual:async(method,payload)=>{calls.push({method,payload});return {ok:true};}});await f.controller.present({tab:'context',requestId:'agent'});
 await f.invoke('job-amend',{id,instruction:'Bitte nur das Foto.'});assert.deepEqual(calls,[{method:'job-amend',payload:{id,instruction:'Bitte nur das Foto.'}}]);assert.equal(f.controller.presentation.owner,'user');assert.equal(f.controller.release('agent').closed,false);
 for(const payload of [{id:'unknown',instruction:'Korrektur'},{id,instruction:''},{id,instruction:'x'.repeat(1201)},{id,instruction:'x\u0000'},{id,instruction:'Weiter',shell:'cmd.exe'},{id:'49b9ad63-5a29-48a1-83b2-37984291c46a',instruction:'Weiter'}])await assert.rejects(f.invoke('job-amend',payload));
 status='outcome-unknown';await assert.rejects(f.invoke('job-amend',{id,instruction:'Weiter'}));status='running';locked=true;await assert.rejects(f.invoke('job-amend',{id,instruction:'Weiter'}));locked=false;blocked=true;await assert.rejects(f.invoke('job-amend',{id,instruction:'Weiter'}));blocked=false;await f.invoke('job-amend',{id,instruction:'Neue Richtung'});assert.equal(calls.length,2);f.controller.destroy();
});

test('browser navigation accepts explicit web URLs and rejects privileged schemes and credentials',()=>{
  assert.equal(typeof api.validateBrowserUrl,'function','URL boundary is missing');
  assert.equal(api.validateBrowserUrl(' https://example.com/a?q=1 '),'https://example.com/a?q=1');
  assert.equal(api.validateBrowserUrl('http://localhost:8080'),'http://localhost:8080/');
  for(const url of ['file:///C:/secret','javascript:alert(1)','data:text/html,hi','about:blank','https://user:pass@example.com','example.com','https://example.com\n/secret'])assert.throws(()=>api.validateBrowserUrl(url));
});
test('task acknowledgement remains separate from task replies and tool-result evidence',async()=>{
 const f=fixture();await f.controller.show('console');f.controller.publish({type:'task-acknowledgement',text:'Okay.'});f.controller.publish({type:'reply',text:'Spotify ist geöffnet.'});const state=await f.invoke('snapshot');assert.equal(state.events.at(-2).type,'acknowledgement');assert.equal(state.events.at(-2).text,'Okay.');assert.equal(state.events.at(-1).type,'reply');assert.equal(state.events.filter(value=>value.type==='tool').length,0);f.controller.destroy();
});
test('an agent presentation opens without focus and closes only its current untouched lease',async()=>{
 const f=fixture();assert.equal(typeof f.controller.present,'function');assert.equal(typeof f.controller.release,'function');
 const presented=await f.controller.present({tab:'console',reason:'Fenster erklären',requestId:'request-1'});assert.equal(presented.shown,true);assert.equal(f.controller.presentation.owner,'agent');assert.equal((await f.invoke('snapshot')).presentation.requestId,'request-1');assert.equal(f.windows[0].focusCalls,0);assert.equal(f.windows[0].inactiveCalls,1);
 assert.equal(f.controller.release().closed,false);assert.equal(f.controller.release('old-request').closed,false);assert.equal(f.controller.visible,true);assert.equal(f.controller.release('request-1').closed,true);assert.equal(f.controller.visible,false);assert.equal(f.controller.presentation.owner,null);f.controller.destroy();
});
test('manual workbench navigation takes ownership and late agent closes or presentations leave it available',async()=>{
 const f=fixture();await f.controller.present({tab:'console',requestId:'request-1'});await f.invoke('tab','context');assert.equal(f.controller.presentation.owner,'user');
 assert.equal(f.controller.release('request-1').closed,false);const result=await f.controller.present({tab:'artcraft',requestId:'request-2'});assert.equal(result.shown,false);assert.equal(f.controller.activeTab,'context');assert.equal(f.controller.visible,true);f.controller.destroy();
});
test('native focus and embedded browser input take user ownership before an agent releases',async()=>{
 for(const event of ['focus','before-input-event','before-mouse-event']){
  const f=fixture();await f.controller.present({tab:'browser',url:'https://example.com',requestId:'agent-browser'});
  if(event==='focus')f.windows[0].emit(event);else f.views[0].webContents.emit(event,{}, {type:event==='before-input-event'?'keyDown':'mouseDown'});
  assert.equal(f.controller.presentation.owner,'user',event);assert.equal(f.controller.release('agent-browser').closed,false,event);assert.equal(f.controller.visible,true,event);f.controller.destroy();
 }
});

test('agent presentation validates its bounded request and generates an ID when omitted',async()=>{
 const f=fixture();
 for(const options of [{tab:'unknown'},{tab:'console',requestId:'with spaces'},{tab:'console',requestId:'x'.repeat(81)},{tab:'console',reason:'x'.repeat(161)},{tab:'console',extra:true},{tab:'console',url:'https://example.com'},{tab:'browser',url:'https://user:pass@example.com'}])await assert.rejects(f.controller.present(options));
 assert.equal(f.windows.length,0);const result=await f.controller.present({tab:'console',reason:'Inhalt zeigen'});assert.equal(result.shown,true);assert.match(result.requestId,/^[A-Za-z0-9_-]{1,80}$/);assert.equal(f.controller.release(result.requestId).closed,true);f.controller.destroy();
});
test('privacy suppresses source text and rejects new agent presentations',async()=>{
 const projected=api.safeSnapshot({privacyLocked:true,currentContent:{kind:'clipboard',text:'PRIVATE',source:{title:'PRIVATE'},observedAt:new Date().toISOString()},presentation:{owner:'agent',requestId:'private',reason:'PRIVATE'}});assert.equal(projected.currentContent,null);
 const f=fixture({getSnapshot:()=>({privacyLocked:true})});await assert.rejects(f.controller.present({tab:'console',requestId:'request'}),/Datenschutz/);assert.equal(f.windows.length,0);f.controller.destroy();
});

test('an explicit source is safely projected with ISO time, bounded text and no native identity',()=>{
 const result=api.safeSnapshot({currentContent:{kind:'window',source:{kind:'window',label:'Quelldokument',app:'Editor',windowTitle:'Dokument',pid:42,hwnd:'123',token:'SECRET'},text:'a'.repeat(11999)+'😀'+'tail',observedAt:'2026-10-11T14:00:00+02:00',limitations:['Nur sichtbarer Text','token=SECRET'],truncated:false,untrusted:true}}).currentContent;
 assert.deepEqual(result.source,{label:'Quelldokument',app:'Editor',title:'Dokument'});assert.equal(result.observedAt,'2026-10-11T12:00:00.000Z');assert.equal(result.text,'a'.repeat(11999));assert.equal(result.truncated,true);assert.equal(result.untrusted,true);assert.deepEqual(result.limitations,['Nur sichtbarer Text','token=[redacted]']);assert.doesNotMatch(JSON.stringify(result),/SECRET|hwnd|pid/);
 assert.equal(api.safeSnapshot({currentContent:{kind:'screen',text:'unsupported'}}).currentContent,null);
});

test('snapshot ownership ignores global state and automated reads do not acquire a user lease',async()=>{
 const f=fixture({getSnapshot:()=>({presentation:{owner:'user',requestId:'forged'},appearance:{glass:true,opacity:.2}})});await f.controller.present({tab:'artcraft',requestId:'agent-request'});
 for(const method of ['snapshot','craft-snapshot','graph-snapshot','intel-snapshot'])await f.invoke(method);
 const snapshot=await f.invoke('snapshot');assert.equal(snapshot.presentation.owner,'agent');assert.equal(snapshot.presentation.requestId,'agent-request');assert.deepEqual(snapshot.appearance,{glass:false,opacity:.94});
 await f.invoke('craft-refresh',{preview:false});assert.equal(f.controller.release('agent-request').closed,true);f.controller.destroy();
});

test('manual actions and direct shows prevent a late agent release from closing active work',async()=>{
 for(const [method,payload] of [['command','Weiter'],['action',{name:'status'}],['craft-select',{appId:'light'}],['graph-search',{query:'workbench'}],['job-resume']]){
  const f=fixture();await f.controller.present({tab:'console',requestId:'agent-request'});await f.invoke(method,payload);assert.equal(f.controller.presentation.owner,'user',method);assert.equal(f.controller.release('agent-request').closed,false,method);assert.equal(f.controller.visible,true);f.controller.destroy();
 }
 const f=fixture();await f.controller.present({tab:'console',requestId:'agent-request'});await f.controller.show('graph');assert.equal(f.windows[0].focusCalls,1);assert.equal(f.controller.release('agent-request').closed,false);f.controller.destroy();
});

test('privacy and matching release cancel an agent presentation awaiting the local window',async()=>{
 for(const cancel of ['privacy','release','hide']){
  let resume,locked=false;const gate=new Promise(resolve=>resume=resolve),f=fixture({getSnapshot:()=>({privacyLocked:locked}),beforeLoadFile:()=>gate});
  const pending=f.controller.present({tab:'console',requestId:'pending-request'});assert.equal(f.windows.length,1);
  if(cancel==='privacy')locked=true;else if(cancel==='release')assert.equal(f.controller.release('pending-request').closed,true);else f.controller.hide();
  resume();if(cancel==='privacy')await assert.rejects(pending,/Datenschutz/);else assert.equal((await pending).shown,false);assert.equal(f.controller.visible,false);assert.equal(f.windows[0].focusCalls,0);f.controller.destroy();
 }
});

test('manual tab ownership and privacy changes cancel an agent presentation awaiting navigation',async()=>{
 for(const cancel of ['manual','privacy']){
  let resume,locked=false;const f=fixture({getSnapshot:()=>({privacyLocked:locked})});await f.controller.present({tab:'console',requestId:'first-request'});
  const gate=new Promise(resolve=>resume=resolve),contents=f.views[0].webContents;contents.loadURL=async url=>{await gate;contents.url=url;};
  const pending=f.controller.present({tab:'browser',url:'https://example.com',requestId:'next-request'});await Promise.resolve();
  if(cancel==='manual')await f.invoke('tab','context');else{locked=true;f.controller.publish({type:'privacy-state',locked:true});locked=false;}
  resume();assert.equal((await pending).shown,false);if(cancel==='manual'){assert.equal(f.controller.visible,true);assert.equal(f.controller.activeTab,'context');assert.equal(f.controller.presentation.owner,'user');}else assert.equal(f.controller.visible,false);
  assert.equal(f.controller.release('next-request').closed,false);f.controller.destroy();
 }
});

test('a failed agent navigation clears its presentation without leaving a visible unowned window',async()=>{
 const f=fixture();await f.controller.present({tab:'console',requestId:'first-request'});f.views[0].webContents.loadURL=async()=>{throw Error('Navigation failed');};
 await assert.rejects(f.controller.present({tab:'browser',url:'https://example.com',requestId:'failed-request'}),/Navigation failed/);assert.equal(f.controller.visible,false);assert.equal(f.controller.presentation.owner,null);f.controller.destroy();
});

test('native acrylic reports only successful support and keeps a readable solid fallback',{skip:process.platform!=='win32'},async t=>{
 let currentVersion;t.mock.method(require('node:os'),'release',()=>currentVersion);
 for(const [version,materialFailure,glass] of [['10.0.26100',false,true],['10.0.19045',false,false],['10.0.26100',true,false]]){
  currentVersion=version;const f=fixture({nativeMaterial:true,materialFailure});await f.controller.present({tab:'system',requestId:'appearance-request'});const win=f.windows[0],snapshot=await f.invoke('snapshot');assert.equal(snapshot.appearance.glass,glass);assert.equal(snapshot.appearance.opacity,.94);assert.equal(win.options.transparent,undefined);assert.equal(win.options.opacity,undefined);assert.equal(win.material,glass?'acrylic':undefined);assert.equal(win.backgroundColor,glass?'#00000000':'#060e17');f.controller.destroy();
 }
});

test('only the local workbench top frame may invoke trusted actions',()=>{
  assert.equal(typeof api.trustedSender,'function','sender boundary is missing');
  const url=pathToFileURL(path.join(__dirname,'../ui/workbench.html')).href;
  const frame={url},webContents={mainFrame:frame};
  assert.equal(api.trustedSender({sender:webContents,senderFrame:frame},webContents,url),true);
  assert.equal(api.trustedSender({sender:webContents,senderFrame:{url}},webContents,url),false);
  assert.equal(api.trustedSender({sender:{mainFrame:frame},senderFrame:frame},webContents,url),false);
  frame.url='https://example.com/';
  assert.equal(api.trustedSender({sender:webContents,senderFrame:frame},webContents,url),false);
});

test('snapshot projects observed status without passing authentication, raw settings or camera images',()=>{
  assert.equal(typeof api.safeSnapshot,'function','snapshot projection is missing');
  const result=api.safeSnapshot({connected:false,status:'offline',settings:{token:'SECRET',url:'https://user:pass@host',cameraEnabled:true,modes:[{id:'work',name:'Arbeit',apps:['secret.exe'],instructions:'PRIVATE'}]},session:{id:'secret-id',title:'Aktuell'},camera:{scene:{image:'PRIVATE'}},sample:{cpuPercent:23,gpuPercent:undefined},systemReport:{text:'CPU 23 %',fresh:true,metrics:[{key:'cpu',label:'CPU',value:23,unit:'%',available:true}]}});
  assert.equal(result.sample.cpuPercent,23);
  assert.equal(result.systemReport.text,'CPU 23 %');
  assert.deepEqual(result.modes,[{id:'work',name:'Arbeit'}]);
  assert.equal(result.sessionTitle,'Aktuell');
  assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|secret-id|secret.exe|user:pass/);
});

function fixture({getSnapshot=()=>({connected:true}),onAction,onVisual,beforeLoadFile,nativeMaterial=false,materialFailure=false,stateFile=null,displays=[{id:1,workArea:{x:0,y:0,width:1920,height:1040}},{id:2,workArea:{x:1920,y:0,width:1920,height:1040}}]}={}){
  const handles=new Map(),windows=[],views=[];
  class Contents extends EventEmitter{
    constructor(){super();this.mainFrame={url:''};this.sent=[];this.url='about:blank';this.navigationHistory={canGoBack:()=>false,canGoForward:()=>false,goBack(){},goForward(){}};}
    send(channel,data){this.sent.push({channel,data});} setWindowOpenHandler(fn){this.openHandler=fn;} getURL(){return this.url;} getTitle(){return 'Page';} isLoading(){return false;} isDestroyed(){return false;} async loadURL(url){this.url=url;} close(){this.closed=true;} reload(){}
  }
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.backgroundColor=options.backgroundColor;this.focusCalls=0;this.inactiveCalls=0;this.webContents=new Contents();this.contentView={addChildView:()=>{},removeChildView:()=>{}};this.shown=false;this.maximized=false;this.normalBounds={x:options.x??100,y:options.y??100,width:options.width,height:options.height};this.bounds={...this.normalBounds};windows.push(this);}
    async loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;await beforeLoadFile?.();this.webContents.emit('did-finish-load');} isDestroyed(){return !!this.dead;} isVisible(){return this.shown;} show(){this.shown=true;this.emit('show');} showInactive(){this.inactiveCalls++;this.show();} hide(){this.shown=false;this.emit('hide');} focus(){this.focusCalls++;} setBackgroundMaterial(material){if(materialFailure)throw Error('Unsupported material');this.material=material;} setBackgroundColor(color){this.backgroundColor=color;} center(){this.centered=true;} getBounds(){return {...this.bounds};} getNormalBounds(){return {...this.normalBounds};} isMaximized(){return this.maximized;} isMinimized(){return this.minimized===true;} restore(){this.minimized=false;this.shown=true;this.bounds={...this.normalBounds};} maximize(){this.maximized=true;const area=this.normalBounds.x>=1920?displays[1]?.workArea:displays[0]?.workArea;this.bounds={...area};this.emit('maximize');this.emit('resize');} unmaximize(){this.maximized=false;this.bounds={...this.normalBounds};this.emit('unmaximize');} setBounds(bounds){this.normalBounds={...bounds};this.bounds={...bounds};this.emit('move');this.emit('resize');} getContentBounds(){return {width:1200,height:800};} destroy(){this.dead=true;this.emit('closed');}
  }
  if(!nativeMaterial)delete Window.prototype.setBackgroundMaterial;
  class View{constructor(options){this.options=options;this.webContents=new Contents();views.push(this);}setVisible(value){this.visible=value;}setBounds(rect){this.bounds=rect;}}
  const browserSession=new EventEmitter();browserSession.setPermissionRequestHandler=fn=>browserSession.permission=fn;browserSession.setPermissionCheckHandler=fn=>browserSession.check=fn;browserSession.webRequest={onBeforeRequest:fn=>browserSession.filter=fn};
  const uiSession={setPermissionRequestHandler:fn=>uiSession.permission=fn,setPermissionCheckHandler:fn=>uiSession.check=fn,setDisplayMediaRequestHandler:fn=>uiSession.display=fn};
  let commands=0,actions=0;
  const controller=api.createWorkbench({electron:{BrowserWindow:Window,WebContentsView:View,screen:{getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0]},desktopCapturer:{getSources:async()=>[{id:'window:123:0',name:'PhotoCraft'}]},session:{fromPartition:part=>part==='lilith-workbench-ui'?uiSession:browserSession},ipcMain:{handle:(name,fn)=>handles.set(name,fn),removeHandler:name=>handles.delete(name)}},root:path.join(__dirname,'..'),stateFile,getSnapshot,onCommand:()=>{commands++;},onAction:payload=>{actions++;return onAction?.(payload);},onVisual});
  return {controller,windows,views,browserSession,uiSession,counts:()=>({commands,actions}),invoke:(method,payload,event)=>handles.get('workbench:invoke')(event||{sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame},method,payload)};
}

test('Artcraft requests are typed, isolated from browser pages and cannot send control credentials',async()=>{
  const seen=[],f=fixture({onVisual:async(method,payload)=>{seen.push({method,payload});return {apps:[]};}});
  await f.controller.show('artcraft');
  await f.invoke('craft-snapshot');await f.invoke('craft-select',{appId:'photo'});await f.invoke('craft-refresh',{preview:true});await f.invoke('craft-open',{appId:'vector'});await f.invoke('craft-command',{appId:'photo',text:'Erstelle eine neue Ebene.'});
  assert.equal(seen.length,5);assert.equal((await f.invoke('snapshot')).tab,'artcraft');assert.equal(f.views[0].visible,false);
  for(const [method,payload]of [['craft-select',{appId:'powershell'}],['craft-open',{appId:'photo',path:'C:\\private'}],['craft-refresh',{preview:'true'}],['craft-command',{appId:'photo',text:'x'.repeat(2001)}],['craft-link',{appId:'photo',tokenFile:'SECRET'}]])await assert.rejects(f.invoke(method,payload));
  await assert.rejects(f.invoke('craft-snapshot',undefined,{sender:f.views[0].webContents,senderFrame:f.views[0].webContents.mainFrame}));assert.equal(seen.length,5);
  f.controller.destroy();
});

test('input requires the live capture owner and rejects stale grants after hide, selection and privacy',async()=>{
 let locked=false,owner={appId:'light',pid:42,windowId:'123'};const calls=[],token='a'.repeat(32),f=fixture({getSnapshot:()=>({privacyLocked:locked}),onVisual:async(method,payload)=>{calls.push({method,payload});if(method==='craft-stream-target')return {...owner};if(method==='craft-input')return {ok:true,frameId:token};return {};}});
 await f.controller.show('artcraft');const arm={appId:'light',kind:'arm',frameWidth:1500,frameHeight:1000};
 await assert.rejects(f.invoke('craft-input',arm));await f.invoke('craft-stream-start',{appId:'light'});
 await new Promise(resolve=>f.uiSession.display({frame:f.windows[0].webContents.mainFrame,videoRequested:true,audioRequested:false},value=>{assert.ok(value);resolve();}));
 await f.invoke('craft-input',arm);await f.invoke('craft-input',{appId:'light',kind:'click',frameId:token,x:.5,y:.5});
 await assert.rejects(f.invoke('craft-input',{appId:'light',kind:'click',frameId:'b'.repeat(32),x:.5,y:.5}));
 locked=true;await assert.rejects(f.invoke('craft-input',{appId:'light',kind:'key',frameId:token,key:'Enter'}));locked=false;
 await f.invoke('craft-select',{appId:'photo'});await assert.rejects(f.invoke('craft-input',{appId:'light',kind:'click',frameId:token,x:.5,y:.5}));
 assert.equal(calls.filter(row=>row.method==='craft-input').length,2);f.controller.destroy();
});

test('queue, awareness and teach requests reject extra fields and send bounded typed local actions',async()=>{
 const calls=[],f=fixture({onVisual:async(method,payload)=>{calls.push({method,payload});return {ok:true};}});await f.controller.show('context');
 for(const [method,payload] of [['job-retry',{id:'job-a'}],['job-cancel',{id:'job-a'}],['job-reconcile',{id:'job-a'}],['job-resume'],['awareness-action',{id:'card-a'}],['awareness-dismiss',{id:'card-a'}],['teach-start',{name:'Arbeit'}],['teach-confirm',{index:0,label:'Bild auswählen',verification:'Bild erscheint'}],['teach-save',{verification:'Ergebnis gespeichert'}],['teach-cancel']])await f.invoke(method,payload);
 assert.equal(calls.length,10);
 for(const [method,payload]of [['job-retry',{id:'job-a',command:'cmd.exe'}],['job-resume',{id:'job-a'}],['awareness-action',{id:'x'.repeat(81)}],['teach-start',{name:''}],['teach-confirm',{index:-1,verification:'ok'}],['teach-confirm',{index:0,verification:''}],['teach-save',{verification:'x'.repeat(1501)}],['teach-cancel',{name:'x'}]])await assert.rejects(f.invoke(method,payload));f.controller.destroy();
});

test('workbench projects queue, awareness and teach without raw actions, typed text or credentials',()=>{
 const value=api.safeSnapshot({jobQueue:{held:true,blocked:false,activeJobId:'job-a',jobs:[{id:'job-a',title:'Auftrag',status:'paused',summary:'token=SECRET',reason:'Prüfen',attempts:2,text:'PRIVATE'}]},awareness:{project:{name:'Voice',confidence:'manual'},cards:[{id:'card-a',kind:'build-error',title:'Build',detail:'password=SECRET',actionLabel:'Untersuchen',action:{kind:'shell',command:'PRIVATE'}}]},teach:{active:true,name:'Lehre',steps:[{appId:'light',kind:'text',label:'Text eingeben',verified:false,verification:'cookie=SECRET',text:'PRIVATE'}]}});
 assert.equal(value.jobQueue.held,true);assert.equal(value.awareness.cards[0].actionLabel,'Untersuchen');assert.equal(value.teach.steps[0].kind,'text');assert.doesNotMatch(JSON.stringify(value),/SECRET|PRIVATE|shell/);
});

test('voice timing projection contains only measured summaries and the renderer displays empty state or measured percentiles',()=>{
 const empty=api.safeSnapshot({voiceTiming:{rows:[{turnId:'PRIVATE',stages:{'capture-start':1}}]}});assert.deepEqual(empty.voiceTiming,{summary:{}});
 const value=api.safeSnapshot({voiceTiming:{summary:{firstAudioMs:{count:3,p50:1234,p95:2345},transcribeMs:{count:2,p50:120,p95:150},hermesFirstTokenMs:{count:-1,p50:NaN,p95:10}},rows:[{turnId:'PRIVATE'}]}});
 assert.deepEqual(value.voiceTiming.summary.firstAudioMs,{count:3,p50:1234,p95:2345});assert.equal(value.voiceTiming.summary.hermesFirstTokenMs,undefined);assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);
 const f=rendererFixture(),allText=node=>[node.textContent,...node.children.map(allText)].join(' ');f.receive({type:'snapshot',snapshot:{...empty,tab:'system'}});assert.match(allText(f.element('voice-timing-rows')),/Noch keine Messungen/);f.receive({type:'snapshot',snapshot:{...value,tab:'system'}});assert.match(allText(f.element('voice-timing-rows')),/1234 ms/);assert.match(allText(f.element('voice-timing-rows')),/2345 ms/);assert.match(allText(f.element('voice-timing-rows')),/Transkription/);
});

test('controller retains bounded console history and replaces streamed replies',async()=>{
  assert.equal(typeof api.createWorkbench,'function','controller is missing');
  const f=fixture();await f.controller.show();
  for(let i=0;i<260;i++)f.controller.publish({type:'user',text:'Command '+i});
  f.controller.publish({type:'reply',text:'Partial'});f.controller.publish({type:'reply',text:'Complete'});
  const snapshot=await f.invoke('snapshot');
  assert.ok(snapshot.events.length<=200);
  assert.equal(snapshot.events.at(-1).text,'Complete');
  assert.equal(snapshot.events.filter(event=>event.type==='reply').length,1);
  f.controller.destroy();
});

test('situation snapshot projects local events, scoped tool proof and editable routines without secrets or session IDs',()=>{
  const result=api.safeSnapshot({privacyLocked:true,settings:{cameraEnabled:true,screenEnabled:true,wakeWord:true},context:{enabled:true,project:'Voice',foreground:{app:'Editor',windowTitle:'Project',secret:'HIDDEN'},events:[{type:'build-error',summary:'Bearer TOKEN build failed',source:'build.log',timestamp:123,raw:'HIDDEN'}],logPaths:['C:\\Logs\\build.log']},tasks:[{id:'task-1',sessionId:'SECRETSESSION',title:'Editor öffnen',status:'agent-finished',verification:'verified',toolCount:2,evidence:[{type:'spotify-playback',scope:'tool',detail:'Wiedergabe bestätigt',token:'HIDDEN'}],summary:'password="PRIVATE WORDS"',arguments:'HIDDEN'}],routines:[{id:'work',name:'Arbeit',instructions:'Öffne Editor.\nÖffne Projekt.',verification:'Projekt sichtbar.',token:'HIDDEN'}]});
  assert.equal(result.privacyLocked,true);
  assert.equal(result.context.enabled,false);
  assert.equal(result.context.foreground,null);
  assert.equal(result.camera.enabled,false);
  assert.equal(result.screen.enabled,false);
  assert.equal(result.wake.enabled,false);
  assert.equal(result.context.project,'Voice');
  assert.equal(result.tasks[0].status,'agent-finished');
  assert.equal(result.tasks[0].evidence[0].scope,'tool');
  assert.equal(result.routines[0].instructions,'Öffne Editor.\nÖffne Projekt.');
  assert.doesNotMatch(JSON.stringify(result),/TOKEN|HIDDEN|SECRETSESSION|PRIVATE WORDS/);
});

test('context and safety actions accept only explicit bounded schemas and do not relay handler secrets',async()=>{
  const seen=[],f=fixture({onAction:payload=>{seen.push(payload);return {token:'HIDDEN'};}});await f.controller.show('context');
  for(const name of ['privacy-lock','privacy-unlock','emergency-stop','context-clear','logs-pick'])assert.deepEqual(await f.invoke('action',{name}),{ok:true});
  await f.invoke('action',{name:'context-settings',values:{contextEnabled:true,projectName:'Voice',logPaths:['C:\\Logs\\build.log']}});
  const routine={id:'work',name:'Arbeit',instructions:'Öffne Editor.',verification:'Editorfenster sichtbar.'};
  await f.invoke('action',{name:'routine-save',routine});
  for(const name of ['routine-delete','routine-run'])await f.invoke('action',{name,id:'work'});
  assert.equal(seen.length,9);
  for(const invalid of [
    {name:'privacy-unlock',settings:{cameraEnabled:true}},
    {name:'context-settings',values:{privacyLocked:false}},
    {name:'context-settings',values:{contextEnabled:'true'}},
    {name:'context-settings',values:{projectName:'x'.repeat(81)}},
    {name:'context-settings',values:{logPaths:['x'.repeat(1001)]}},
    {name:'context-settings',values:{logPaths:['C:\\log.txt'],unsafe:'x'}},
    {name:'routine-save',routine:{...routine,verification:''}},
    {name:'routine-save',routine:{...routine,command:'whoami'}},
    {name:'routine-run',id:'../evil'},
    {name:'routine-delete',id:'work',force:true},
  ])await assert.rejects(f.invoke('action',invalid),/Aktion|Ablauf/);
  assert.equal(seen.length,9);
  f.controller.destroy();
});

test('fourth tab keeps embedded browser hidden and gesture tab cycling includes context',async()=>{
  const f=fixture();await f.controller.show({tab:'browser',url:'https://example.com'});
  f.controller.cycleTab(1);
  assert.equal((await f.invoke('snapshot')).tab,'context');
  assert.equal(f.views[0].visible,false);
  f.controller.cycleTab(1);assert.equal((await f.invoke('snapshot')).tab,'graph');assert.equal(f.views[0].visible,false);
  f.controller.cycleTab(1);assert.equal((await f.invoke('snapshot')).tab,'intel');assert.equal(f.views[0].visible,false);
  f.controller.cycleTab(1);assert.equal((await f.invoke('snapshot')).tab,'artcraft');
  f.controller.cycleTab(1);assert.equal((await f.invoke('snapshot')).tab,'system');
  f.controller.cycleTab(-1);assert.equal((await f.invoke('snapshot')).tab,'artcraft');
  f.controller.destroy();
});
test('opening the workbench remains visible under a hidden Windows launcher',async()=>{
  const f=fixture();await f.controller.show('context');const window=f.windows[0];window.shown=false;
  window.show=()=>{};window.showInactive=()=>{window.shown=true;};
  await f.controller.show('context');assert.equal(f.controller.visible,true);f.controller.destroy();
});

test('trusted commands enforce typed payloads and embedded browser never receives the bridge',async()=>{
  assert.equal(typeof api.createWorkbench,'function','controller is missing');
  const f=fixture();await f.controller.show('browser');
  await assert.rejects(f.invoke('command','x',{sender:f.views[0].webContents,senderFrame:f.views[0].webContents.mainFrame}));
  await assert.rejects(f.invoke('command',{text:'shell'}));
  await assert.rejects(f.invoke('action',{name:'shell',command:'whoami'}));
  await assert.rejects(f.invoke('action',{name:'status',unexpected:true}));
  await f.invoke('command','Bitte Status prüfen');
  await f.invoke('action',{name:'mode',id:'work'});
  assert.deepEqual(f.counts(),{commands:1,actions:1});
  assert.equal(f.views[0].options.webPreferences.preload,undefined);
  assert.equal(f.views[0].options.webPreferences.sandbox,true);
  assert.deepEqual(f.views[0].webContents.openHandler({url:'https://example.com'}),{action:'deny'});
  let permission=true;f.browserSession.permission(null,'media',value=>permission=value);assert.equal(permission,false);
  const download={cancel(){this.cancelled=true;}};f.browserSession.emit('will-download',{},download);assert.equal(download.cancelled,true);
  f.controller.cycleTab(1);assert.equal(f.views[0].visible,false);
  f.controller.hide();assert.equal(f.controller.visible,false);
  await f.controller.show('browser');assert.equal(f.windows.length,1);
  f.controller.destroy();
});

test('browser rejects forbidden navigation and remains independent when system tabs are selected',async()=>{
  const f=fixture();await f.controller.show('browser');
  assert.equal(f.views[0].visible,false);
  await assert.rejects(f.invoke('browser',{action:'navigate',url:'file:///C:/private'}));
  assert.equal(f.views[0].webContents.getURL(),'about:blank');
  await f.invoke('browser',{action:'navigate',url:'https://example.com'});
  assert.equal(f.views[0].webContents.getURL(),'https://example.com/');
  assert.equal(f.views[0].visible,true);
  await f.invoke('tab','system');assert.equal(f.views[0].visible,false);
  let redirected=false;f.views[0].webContents.emit('will-redirect',{preventDefault:()=>redirected=true},'https://name:secret@example.com');assert.equal(redirected,true);
  let cancelled=false;f.browserSession.filter({resourceType:'mainFrame',url:'file:///C:/private'},value=>cancelled=value.cancel);assert.equal(cancelled,true);
  f.controller.destroy();
});

test('console strips raw arguments and image events and redacts common credential text',()=>{
  assert.equal(api.normalizeConsoleEvent({type:'audio-chunk',data:'PRIVATE'}),null);
  assert.equal(api.normalizeConsoleEvent({type:'camera-scene',scene:{image:'PRIVATE'}}),null);
  const row=api.normalizeConsoleEvent({type:'tool.start',data:{name:'WindowsMCP.GetState',arguments:{token:'PRIVATE'}}});
  assert.equal(row.text,'WindowsMCP.GetState');assert.doesNotMatch(JSON.stringify(row),/PRIVATE/);
  assert.equal(api.normalizeConsoleEvent({type:'error',message:'Bearer privateToken token=secret api_key=private'}).text,'Bearer [redacted] token=[redacted] api_key=[redacted]');
});

test('high-frequency audio and camera-frame payloads do not trigger workbench IPC copies',async()=>{
  let snapshots=0;const f=fixture({getSnapshot:()=>{snapshots++;return {};}});await f.controller.show();
  const before=f.windows[0].webContents.sent.length,reads=snapshots;
  f.controller.publish({type:'audio-chunk',data:'PRIVATE'});
  f.controller.publish({type:'camera-frame',image:'PRIVATE'});
  assert.equal(f.windows[0].webContents.sent.length,before);
  assert.equal(snapshots,reads);
  f.controller.destroy();
});

test('spatial graph gestures only reach a visible, unlocked graph pane',async()=>{
 let locked=false;const f=fixture({getSnapshot:()=>({privacyLocked:locked})}),gesture={kind:'pointer',x:.5,y:.5,pinching:false,generation:1,sequence:1,at:Date.now()};await f.controller.show('graph');f.controller.publish({type:'gesture-update',gesture});assert.equal(f.windows[0].webContents.sent.at(-1).data.type,'gesture-update');
 const before=f.windows[0].webContents.sent.length;locked=true;f.controller.publish({type:'gesture-update',gesture});assert.equal(f.windows[0].webContents.sent.length,before);locked=false;await f.invoke('tab','system');const after=f.windows[0].webContents.sent.length;f.controller.publish({type:'gesture-update',gesture});assert.equal(f.windows[0].webContents.sent.length,after);f.controller.destroy();
});
test('gesture navigation feedback is bounded and the help reserves space above the embedded browser',async()=>{
 const f=fixture();await f.controller.show('browser');f.controller.publish({type:'gesture-state',enabled:true,ready:true,label:'Bereit',navigation:{x:.5,phase:'ready',progress:.8,privateImage:'never-forward'}});
 const event=f.windows[0].webContents.sent.at(-1).data;assert.deepEqual(event.navigation,{x:.5,phase:'ready',progress:.8});
 f.controller.publish({type:'gesture-state',enabled:true,ready:true,navigation:{x:99,phase:'ready',progress:.8}});assert.equal(f.windows[0].webContents.sent.at(-1).data.navigation,null);
 const before=f.views[0].bounds;await f.invoke('gesture-help',{enabled:true});assert.equal(f.views[0].bounds.y,before.y+140);await f.invoke('gesture-help',{enabled:false});assert.equal(f.views[0].bounds.y,before.y);f.controller.destroy();
});

test('renderer hides its empty browser placeholder after a real page loads and restores it for blank',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),nodes=new Map();let receive;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',disabled:false,addEventListener(){},setAttribute(){}});return nodes.get(id);};
  const document={getElementById:element,querySelector:element,querySelectorAll:()=>[],addEventListener(){}};
  const window={workbench:{invoke:async()=>null,on:callback=>receive=callback},matchMedia:()=>({matches:true}),HermesOrb:{OrbRenderer:class{}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/workbench.js'),'utf8'),{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout,clearTimeout});
  receive({type:'browser',url:'',back:false,forward:false,loading:false});
  assert.equal(element('.browser-empty').hidden,false);
  receive({type:'browser',url:'https://example.com/',back:false,forward:false,loading:false});
  assert.equal(element('.browser-empty').hidden,true);
  receive({type:'browser',url:'',back:false,forward:false,loading:false});
  assert.equal(element('.browser-empty').hidden,false);
});

function rendererFixture(){
  const fs=require('node:fs'),vm=require('node:vm'),nodes=new Map(),calls=[];let receive;
  const make=(id='')=>({id,children:[],events:new Map(),dataset:{},style:{},attributes:{},hidden:false,value:'',checked:false,disabled:false,textContent:'',scrollHeight:0,scrollTop:0,clientHeight:0,classList:{toggle(){}},addEventListener(name,fn){this.events.set(name,fn);},setAttribute(name,value){this.attributes[name]=value;},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},focus(){document.activeElement=this;}});
  const element=id=>{if(!nodes.has(id))nodes.set(id,make(id));return nodes.get(id);};
  const tabs=['system','console','browser','context'].map(name=>{const node=element('tab-'+name);node.dataset.tab=name;return node;});
  const document={getElementById:element,querySelector:element,querySelectorAll:selector=>selector==='[data-tab]'?tabs:[],addEventListener(){},createElement:()=>make(),createDocumentFragment:()=>make(),createTextNode:text=>({textContent:text})};
  const window={workbench:{invoke:async(method,payload)=>{calls.push({method,payload});return method==='snapshot'?null:{ok:true};},on:callback=>receive=callback},matchMedia:()=>({matches:true}),HermesOrb:{OrbRenderer:class{}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/workbench.js'),'utf8'),{document,window,Date,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}});
  return {element,calls,receive:event=>receive(event),dispatch:(id,type)=>element(id).events.get(type)?.({preventDefault(){},key:'End'})};
}

test('situation renderer exposes observed tasks without whole-task success and preserves unsaved edits during snapshots',async()=>{
  const f=rendererFixture(),snapshot=api.safeSnapshot({connected:true,context:{enabled:true,project:'Voice',foreground:{app:'Editor',windowTitle:'Projekt',timestamp:Date.now()},events:[],logPaths:[]},tasks:[{id:'a',title:'Mehrteiliger Auftrag',status:'agent-finished',verification:'verified',evidence:[{scope:'tool',type:'spotify-playback',detail:'Musik bestätigt'}]}],routines:[]});
  f.receive({type:'snapshot',snapshot:{...snapshot,tab:'context'}});
  assert.equal(f.element('context').hidden,false);
  assert.equal(f.element('context-app').textContent,'Editor');
  const allText=node=>[node.textContent,...node.children.map(allText)].join(' ');
  assert.match(allText(f.element('task-list')),/Agent beendet/);
  assert.match(allText(f.element('task-list')),/Werkzeugwirkung bestätigt/);
  assert.doesNotMatch(allText(f.element('task-list')),/Auftrag erfolgreich|Auftrag erfüllt/);
  f.element('routine-name').value='Neuer Ablauf';f.element('routine-steps').value='Öffne Editor.';f.element('routine-verification').value='Editor sichtbar.';
  f.receive({type:'snapshot',snapshot:{...snapshot,tab:'context'}});
  assert.equal(f.element('routine-name').value,'Neuer Ablauf');
  await f.dispatch('routine-form','submit');
  assert.equal(f.calls.at(-1).payload.name,'routine-save');
  assert.equal(f.calls.at(-1).payload.routine.verification,'Editor sichtbar.');
  f.receive({type:'snapshot',snapshot:{...snapshot,privacyLocked:true,tab:'context'}});
  assert.equal(f.element('phase').textContent,'PRIVAT');
  assert.equal(f.element('routine-save').disabled,true);
});

test('Lagebild renderer displays queue uncertainty and invokes only explicitly clicked actions',async()=>{
 const f=rendererFixture(),snapshot={...api.safeSnapshot({connected:true,jobQueue:{held:true,blocked:true,jobs:[{id:'job-a',title:'Foto bearbeiten',status:'outcome-unknown',reason:'Verbindung verloren',attempts:1}]},awareness:{project:{name:'Voice',confidence:'manual'},cards:[{id:'card-a',title:'Build fehlgeschlagen',detail:'Ein Test schlägt fehl',actionLabel:'Fehler untersuchen'}]}}),tab:'context'};
 f.receive({type:'snapshot',snapshot});const allText=node=>[node.textContent,...node.children.map(allText)].join(' ');
 assert.match(allText(f.element('job-queue-list')),/Ergebnis unbekannt/);assert.match(allText(f.element('awareness-cards')),/Build fehlgeschlagen/);
 assert.equal(f.calls.filter(call=>call.method==='job-reconcile'||call.method==='awareness-action').length,0);
 const findButton=node=>node.textContent==='Remote-Status prüfen'?node:node.children.map(findButton).find(Boolean),jobButton=findButton(f.element('job-queue-list'));
 await jobButton.events.get('click')();assert.equal(f.calls.at(-1).method,'job-reconcile');
 assert.equal(f.calls.at(-1).payload.id,'job-a');
});

test('busy workbench accepts deliberate queued commands while private and offline controls remain unavailable',async()=>{
 const f=rendererFixture(),snapshot={...api.safeSnapshot({connected:true,busy:true}),tab:'console'};f.receive({type:'snapshot',snapshot});
 assert.equal(f.element('send-command').disabled,false);assert.match(f.element('send-command').textContent,/Vormerken/);
 f.element('command').value='Zweiter Auftrag';await f.dispatch('command-form','submit');assert.equal(f.calls.at(-1).method,'command');
 f.receive({type:'snapshot',snapshot:{...snapshot,privacyLocked:true}});assert.equal(f.element('send-command').disabled,true);
 f.receive({type:'snapshot',snapshot:{...snapshot,connected:false}});assert.equal(f.element('send-command').disabled,true);
});

test('keyboard End selects the last pane and log removal sends only remaining explicit paths',async()=>{
  const f=rendererFixture();f.receive({type:'snapshot',snapshot:{...api.safeSnapshot({context:{enabled:true,logPaths:['C:\\Logs\\one.log','C:\\Logs\\two.log']}}),tab:'system'}});
  await f.dispatch('.tabs','keydown');
  assert.equal(f.calls.at(-1).payload,'artcraft');
  const first=f.element('log-list').children[0];
  await first.children.at(-1).events.get('click')();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).payload)),{name:'context-settings',values:{logPaths:['C:\\Logs\\two.log']}});
});

test('companion local privacy controls lock screen capture and expose an independent emergency stop',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),nodes=new Map(),calls=[];let receive,cancelled=0;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',checked:false,disabled:false,options:[],append(value){this.options.push(value);},replaceChildren(){this.options=[];}});return nodes.get(id);};
  const document={getElementById:element,createElement:()=>({})},window={hermes:{on:callback=>receive=callback}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/workstation.js'),'utf8'),{document,window,ScreenCapture:class{cancel(){cancelled++;}}});
  const controls=new window.WorkstationControls({invoke:async(method,value)=>{calls.push({method,value});},notice(){},getSession:()=>null,sendCamera(){},onSettings(){}});
  controls.sync({privacyLocked:false,screenEnabled:true,modes:[]});
  receive({type:'privacy-state',locked:true});
  assert.equal(element('screenEnabled').disabled,true);
  assert.equal(element('screenEnabled').checked,false);
  assert.ok(cancelled>0);
  assert.equal(element('privacy-toggle').textContent,'Entsperren');
  receive({type:'state',privacyLocked:false});
  receive({type:'settings-config',settings:{privacyLocked:false,screenEnabled:true}});
  controls.sync({privacyLocked:false,screenEnabled:true,modes:[]});
  assert.equal(element('screenEnabled').disabled,true);
  assert.equal(element('screenEnabled').checked,false);
  assert.equal(element('privacy-toggle').textContent,'Entsperren');
  await element('privacy-toggle').onclick();
  assert.deepEqual(calls.at(-1),{method:'privacy',value:false});
  await element('emergency-stop').onclick();
  assert.equal(calls.at(-1).method,'emergency-stop');
  await element('context-open').onclick();
  assert.deepEqual(calls.at(-1),{method:'workbench-show',value:'context'});
  receive({type:'privacy-state',locked:false});
  assert.equal(element('screenEnabled').disabled,false);
  assert.equal(element('screenEnabled').checked,false);
});

test('window streams are restricted to the local top frame and visible Artcraft tab',async()=>{
 const f=fixture({onVisual:async(method,payload)=>{if(method==='craft-stream-target')return {appId:payload.appId,pid:42,windowId:'123'};}});
 await f.controller.show('system');await assert.rejects(f.invoke('craft-stream-start',{appId:'photo'}));
 await f.controller.show('artcraft');await f.invoke('craft-stream-start',{appId:'photo'});
 await assert.rejects(f.invoke('craft-stream-start',{appId:'photo',sourceId:'screen:1:0'}));
 await assert.rejects(f.invoke('craft-stream-start',{appId:'photo'},{sender:f.views[0].webContents,senderFrame:f.views[0].webContents.mainFrame}));
 await f.invoke('craft-stream-stop');f.controller.destroy();
});

test('display capture permits one armed local window request while microphones, webcams and browser pages remain denied',async()=>{
 const f=fixture({onVisual:async()=>({appId:'photo',pid:42,windowId:'123'})});await f.controller.show('artcraft');const contents=f.windows[0].webContents;
 const permission=(web,name,details)=>{let result;f.uiSession.permission(web,name,value=>result=value,details);return result;};
 assert.equal(permission(contents,'media',{isMainFrame:true,mediaTypes:[]}),false);await f.invoke('craft-stream-start',{appId:'photo'});
 assert.equal(permission(contents,'media',{isMainFrame:true,mediaTypes:[]}),true);
 for(const types of [['audio'],['video'],['audio','video']])assert.equal(permission(contents,'media',{isMainFrame:true,mediaTypes:types}),false);
 assert.equal(permission(contents,'media',{isMainFrame:false,mediaTypes:[]}),false);assert.equal(permission(f.views[0].webContents,'media',{isMainFrame:true,mediaTypes:[]}),false);
 const request=frame=>new Promise(resolve=>f.uiSession.display({frame,videoRequested:true,audioRequested:false},resolve));
 assert.equal(await request(f.views[0].webContents.mainFrame),null);const granted=await request(contents.mainFrame);assert.equal(granted.video.id,'window:123:0');assert.equal(granted.audio,undefined);
 f.controller.hide();assert.equal(f.uiSession.check(contents,'display-capture'),false);f.controller.destroy();
});

test('workbench persists normal bounds and restores maximization on the second display across reconstruction',async t=>{
 const fs=require('node:fs'),os=require('node:os');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-placement-')),stateFile=path.join(directory,'window.json');t.after(()=>{if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);fs.rmdirSync(directory);});
 const first=fixture({stateFile});await first.controller.show();first.windows[0].setBounds({x:2100,y:90,width:1300,height:800});first.windows[0].maximize();first.controller.hide();
 assert.ok(fs.existsSync(stateFile),'window placement must be saved');let saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));assert.equal(saved.maximized,true);assert.equal(saved.displayId,2);assert.equal(saved.bounds.width,1300);
 // Windows showInactive may reset a hidden maximized window to its normal placement.
 first.windows[0].showInactive=()=>{first.windows[0].shown=true;first.windows[0].maximized=false;};await first.controller.show();assert.equal(first.windows[0].isMaximized(),true);first.controller.destroy();
 const second=fixture({stateFile});await second.controller.show();assert.equal(second.windows[0].centered,undefined);assert.equal(second.windows[0].isMaximized(),true);assert.equal(second.windows[0].getNormalBounds().x,2100);second.windows[0].unmaximize();second.controller.hide();second.controller.destroy();
 const third=fixture({stateFile});await third.controller.show();assert.equal(third.windows[0].isMaximized(),false);assert.equal(third.windows[0].getNormalBounds().x,2100);third.controller.destroy();
});

test('saved placements are clamped to a remaining display and corrupt bounds fall back safely',()=>{
 assert.equal(typeof api.restoreWindowPlacement,'function');const displays=[{id:1,workArea:{x:0,y:0,width:1920,height:1040}}];
 const restored=api.restoreWindowPlacement({bounds:{x:-2500,y:200,width:1240,height:820},displayId:2,workArea:{x:-2560,y:0,width:2560,height:1400},maximized:true},displays);assert.ok(restored.bounds.x>=0);assert.ok(restored.bounds.x+restored.bounds.width<=1920);assert.equal(restored.maximized,true);
 const left=api.restoreWindowPlacement({bounds:{x:-1800,y:50,width:1000,height:700},displayId:3,maximized:false},[{id:3,workArea:{x:-1920,y:0,width:1920,height:1040}}]);assert.equal(left.bounds.x,-1800);
 for(const bad of [null,{bounds:{x:NaN,y:0,width:1240,height:820}},{bounds:{x:0,y:0,width:-3,height:820}},{bounds:{x:0,y:0,width:1e9,height:820}}])assert.equal(api.restoreWindowPlacement(bad,displays),null);
});

test('a maximized window moved to another monitor keeps that monitor even when its normal bounds still point to the first',async t=>{
 const fs=require('node:fs'),os=require('node:os'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-placement-')),stateFile=path.join(directory,'window.json');t.after(()=>{if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);fs.rmdirSync(directory);});
 const displays=[{id:1,workArea:{x:0,y:0,width:1920,height:1040}},{id:2,workArea:{x:1920,y:0,width:1920,height:1040}}],f=fixture({stateFile,displays});await f.controller.show();const w=f.windows[0];w.maximize();w.bounds={...displays[1].workArea};f.controller.hide();
 w.showInactive=()=>{w.shown=true;w.maximized=false;w.bounds={...w.normalBounds};};await f.controller.show();assert.equal(w.isMaximized(),true);assert.ok(w.getBounds().x>=1920);
 f.controller.hide();displays.pop();await f.controller.show();assert.equal(w.isMaximized(),true);assert.equal(w.getBounds().x,0);f.controller.destroy();
});

test('minimizing a maximized workbench preserves its previous maximized state',async t=>{
 const fs=require('node:fs'),os=require('node:os'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-placement-')),stateFile=path.join(directory,'window.json');t.after(()=>{if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);fs.rmdirSync(directory);});
 const f=fixture({stateFile});await f.controller.show();const w=f.windows[0];w.setBounds({x:2100,y:90,width:1300,height:800});w.maximize();w.minimized=true;w.maximized=false;w.bounds={x:-32000,y:-32000,width:1300,height:800};w.emit('minimize');assert.equal(JSON.parse(fs.readFileSync(stateFile,'utf8')).maximized,true);await f.controller.show();assert.equal(w.isMaximized(),true);assert.ok(w.getBounds().x>=1920);f.controller.destroy();
});
