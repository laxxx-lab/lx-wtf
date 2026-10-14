'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{EventEmitter}=require('node:events');
test('Home Assistant owns login and camera playback; missing entities cannot be reported as opened',async()=>{
 const {createHomeDisplay,homeDisplayUrl}=require('../home-display.cjs');for(const value of ['file:///private','https://user:pass@example.com','https://example.com/?token=private','https://example.com/path'])assert.throws(()=>homeDisplayUrl(value));
 const events=[],nodes=[],ha={hass:{states:{}},dispatchEvent:event=>events.push(event)},context=vm.createContext({document:{querySelector:()=>ha,querySelectorAll:()=>nodes},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});let latest;
 class Window extends EventEmitter{constructor(options){super();this.options=options;latest=this;this.webContents=new EventEmitter();Object.assign(this.webContents,{session:{setPermissionRequestHandler(){}},getURL:()=>this.url,setAudioMuted(){},setWindowOpenHandler(){},executeJavaScript:script=>Promise.resolve(vm.runInContext(script,context))});}isDestroyed(){return this.destroyed===true;}isVisible(){return this.visible===true;}async loadURL(url){this.url=url;}showInactive(){this.visible=true;}destroy(){this.destroyed=true;this.emit('closed');}}
 const home=createHomeDisplay({BrowserWindow:Window,screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1000,height:800}})},url:'http://192.0.2.10:8123'});
 const absent=await home.openCamera('camera.absent');assert.equal(absent.connected,true);assert.equal(absent.cameraOpened,false);assert.match(absent.error,/nicht vorhanden/);assert.equal(events.length,0);assert.equal(latest.options.webPreferences.nodeIntegration,false);assert.match(latest.options.webPreferences.partition,/^persist:lilith-home-/);
 ha.hass.states['camera.door']={};const opened=await home.openCamera('camera.door');assert.equal(opened.cameraOpened,true);assert.equal(events.length,1);assert.equal(events[0].detail.entityId,'camera.door');
 const video={tagName:'VIDEO',readyState:4,paused:false},camera=id=>({tagName:'MORE-INFO-CAMERA',stateObj:{entity_id:id},shadowRoot:{querySelectorAll:()=>[video]}});nodes.push(video,camera('camera.other'));assert.equal((await home.cameraState()).playing,false,'Unrelated dashboard videos cannot confirm the selected camera');nodes.push(camera('camera.door'));assert.equal((await home.cameraState()).playing,true);
 let denied=false;latest.webContents.emit('will-navigate',{preventDefault:()=>denied=true},'https://example.com/');assert.equal(denied,true);home.hide();assert.equal(latest.isDestroyed(),true);
 Window.prototype.loadURL=async function(url){this.url=url+'auth/authorize';throw Object.assign(Error('Login redirect'),{code:'ERR_ABORTED'});};
 const login=await home.open();assert.equal(login.shown,true,'Normal same-origin login navigation remains visible');home.hide();
 Window.prototype.loadURL=async function(){this.url='https://example.com/';throw Object.assign(Error('External abort'),{code:'ERR_ABORTED'});};await assert.rejects(home.open(),/External abort/);
});
test('Windows privacy closes passive cards synchronously before awaiting remote shutdown',()=>{
 const fs=require('node:fs'),path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),start=source.indexOf('const safety=new LocalSafety'),end=source.indexOf('async function setPrivacy',start),block=source.slice(start,end);
 assert.match(block,/onChange:value=>\{\s*if\(value\.locked\)activityCardsWindow\?\.hide\(\)/);
 const {LocalSafety}=require('../local-safety.cjs');let closed=false,release;const safety=new LocalSafety({onChange:value=>{if(value.locked)closed=true;},quiesce:()=>new Promise(resolve=>release=resolve)});const pending=safety.lock();assert.equal(closed,true);release();return pending;
});
