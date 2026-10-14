'use strict';
// Isolated native renderer and stacking check; no gateway or sensor access.
const {app,BrowserWindow,ipcMain,screen,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createSettingsWindowView}=require('../settings-window.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/windows-orb-presence-qa');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));
app.on('window-all-closed',()=>{});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const seed={connected:false,busy:false,status:'ready',session:{id:'qa',title:'QA'},sessions:[],settings:{orbTheme:'classic',wakeWord:false,cameraEnabled:false,screenEnabled:false,gesturesEnabled:false,standbyActive:false},camera:{profiles:[]},tasks:[],background:{jobs:[]},sample:{},referenceVoiceReady:false,voiceReady:false,sttReady:false};
let view,orb,other;
for(const name of new Set([...fs.readFileSync(path.join(root,'preload.cjs'),'utf8').matchAll(/'([a-z][a-z-]+)'/g)].map(match=>match[1])))ipcMain.handle('companion:'+name,async()=>name==='snapshot'?seed:name==='audio-outputs'?{devices:[],defaults:{}}:name==='camera-profiles'?{profileNames:[]}:{});
app.whenReady().then(async()=>{const proof={ok:false};try{
 session.defaultSession.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
 const source=fs.readFileSync(path.join(root,'main.cjs'),'utf8'),start=source.indexOf('function keepOrbOnTop(){'),end=source.indexOf('\nfunction expand(',start);
 assert.ok(start>=0&&end>start);const nativeRaise=new Function('win','settingsWindowView',source.slice(start,end)+'\nkeepOrbOnTop();');
 orb=new BrowserWindow({show:false,width:228,height:276,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,webPreferences:{preload:path.join(root,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 view=createSettingsWindowView(orb,screen,()=>{});await orb.loadFile(path.join(root,'ui/index.html'));await delay(600);orb.showInactive();nativeRaise(orb,view);
 proof.bounds=orb.getBounds();assert.equal(proof.bounds.width,228);assert.equal(proof.bounds.height,276);
 proof.layout=await orb.webContents.executeJavaScript(`(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {width:innerWidth,height:innerHeight,orb:r('orb'),phase:r('phase'),live:r('mic'),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
 assert.equal(proof.layout.orb.width,180);assert.equal(proof.layout.orb.height,180);assert.equal(proof.layout.overflow,false);
 for(const item of [proof.layout.orb,proof.layout.phase,proof.layout.live]){assert.ok(item.x>=0&&item.y>=0);assert.ok(item.right<=228&&item.bottom<=276);}
 fs.writeFileSync(path.join(output,'compact.png'),(await orb.webContents.capturePage()).toPNG());
 other=new BrowserWindow({show:false,width:300,height:180,title:'Isolierter Fokus-Test'});await other.loadURL('data:text/html,<title>Isolierter Fokus-Test</title>');other.show();other.focus();await delay(300);assert.equal(other.isFocused(),true);
 nativeRaise(orb,view);await delay(100);assert.equal(other.isFocused(),true,'Raising the orb must retain the other window keyboard focus');assert.equal(orb.isAlwaysOnTop(),true);proof.focusPreserved=true;
 view.set(true);assert.equal(orb.isAlwaysOnTop(),false);nativeRaise(orb,view);assert.equal(orb.isAlwaysOnTop(),false,'Settings are regular windows');view.set(false);nativeRaise(orb,view);assert.equal(orb.isAlwaysOnTop(),true);assert.deepEqual(orb.getBounds(),proof.bounds);proof.settingsRestored=true;
 orb.hide();nativeRaise(orb,view);assert.equal(orb.isVisible(),false);proof.explicitHideRespected=true;proof.ok=true;
 }catch(error){proof.error=error.stack;}finally{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(proof,null,2));other?.destroy();orb?.destroy();app.exit(proof.ok?0:1);}});
