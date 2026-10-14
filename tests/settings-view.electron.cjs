'use strict';
// Real settings forms in isolated renderers. No microphone, model or gateway.
const {app,BrowserWindow,ipcMain,screen,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createSettingsWindowView}=require('../settings-window.cjs');
const root=path.join(__dirname,'..'),output=path.join(root,'.local/settings-ui-qa'),calls=[],errors=[];
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));
app.on('window-all-closed',()=>{});
let windowsView,linuxView,windowsState={connected:false,busy:false,status:'ready',session:{id:'qa',title:'QA'},sessions:[],settings:{orbTheme:'classic',wakeWord:false,cameraEnabled:false,screenEnabled:false,gesturesEnabled:false,standbyActive:false},camera:{profiles:[]},tasks:[],background:{jobs:[]},sample:{},referenceVoiceReady:false,voiceReady:false,sttReady:false};
let linuxState={connected:false,busy:false,status:'ready',generation:2,panelOpen:true,session:{id:'qa',storedId:'qa',title:'QA'},sessions:[],settings:{orbTheme:'classic',url:'https://example.invalid',voice:'reference'},privacyLocked:false,voiceProfiles:[],sttReady:false,voiceReady:false};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const [file,prefix]of [['preload.cjs','companion:'],['linux-preload.cjs','linux:']])for(const name of new Set([...fs.readFileSync(path.join(root,file),'utf8').matchAll(/'([a-z][a-z-]+)'/g)].map(m=>m[1]))){
 ipcMain.handle(prefix+name,async(_event,value)=>{calls.push({platform:prefix,method:name,value});const linux=prefix==='linux:',state=linux?linuxState:windowsState;
  if(name==='snapshot')return state;if(name==='settings-view')return (linux?linuxView:windowsView).set(value);
  if(name==='settings'){state.settings={...state.settings,...value};if(!linux&&value.orbTheme)_event.sender.send('companion:event',{type:'orb-theme-config',orbTheme:value.orbTheme});return state;}
  if(name==='audio-outputs')return {devices:[],defaults:{}};if(name==='camera-profiles')return {profileNames:[]};if(name==='camera-sources'||name==='screen-sources')return [];if(name==='bluetooth-devices')return {devices:[]};return {};
 });
}
async function check(platform){
 const linux=platform==='linux',win=new BrowserWindow({show:false,width:linux?520:460,height:740,transparent:true,frame:false,webPreferences:{preload:path.join(root,linux?'linux-preload.cjs':'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const controller=createSettingsWindowView(win,screen,open=>win.webContents.send(linux?'linux:event':'companion:event',{type:'settings-view-state',open}));if(linux)linuxView=controller;else windowsView=controller;
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});win.webContents.setAudioMuted(true);
 await win.loadFile(path.join(root,'ui',linux?'linux.html':'index.html'));await delay(600);
 if(linux)win.webContents.send('linux:event',{type:'panel-state',expanded:true});else{win.webContents.send('companion:event',{type:'expanded',expanded:true});}
 await delay(100);const renderer=win.webContents.id,before=win.getBounds(),beforeCalls=calls.length;
 await win.webContents.executeJavaScript(`document.getElementById('${linux?'settings-open':'settings-toggle'}').click();true;`);await delay(250);
 assert.equal(controller.active,true);assert.equal(win.webContents.id,renderer);assert.ok(win.getBounds().width>=700);
 const layout=await win.webContents.executeJavaScript(`(()=>{const panels=[...document.querySelectorAll('.settings-view-panel')],nav=[...document.querySelectorAll('.settings-view-tab')],content=document.querySelector('.settings-view-content'),menu=document.querySelector('.settings-view-nav');return {opened:document.body.classList.contains('settings-open'),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,panels:panels.length,nav:nav.length,content:content.getBoundingClientRect().toJSON(),menu:menu.getBoundingClientRect().toJSON(),ids:[...document.querySelectorAll('[id]')].map(x=>x.id)};})()`);
 assert.equal(layout.opened,true);assert.equal(layout.overflow,false);assert.equal(new Set(layout.ids).size,layout.ids.length,'Existing form controls must not be cloned');
 assert.equal(layout.panels,linux?4:7);assert.equal(layout.nav,layout.panels);assert.ok(layout.content.x>layout.menu.x+layout.menu.width-2,'Content sits beside the navigation');assert.ok(layout.content.width>600,'Forms use the wide content column');
 fs.writeFileSync(path.join(output,platform+'-general.png'),(await win.webContents.capturePage()).toPNG());
 if(!linux)await win.webContents.executeJavaScript(`document.getElementById('idleStandbyMinutes').value='30';document.getElementById('pushToTalkKey').value='F9';document.getElementById('speakAlerts').checked=true;true;`);
 await win.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Orb');if(!button)throw Error('Orb navigation missing');button.click();const select=document.getElementById('orb-theme');if(select.options.length!==6)throw Error('Theme options missing');select.value='hud-core';select.dispatchEvent(new Event('change'));return true;})()`);await delay(250);
 if(!linux)assert.deepEqual(await win.webContents.executeJavaScript(`({idle:document.getElementById('idleStandbyMinutes').value,key:document.getElementById('pushToTalkKey').value,alerts:document.getElementById('speakAlerts').checked})`),{idle:'30',key:'F9',alerts:true},'Theme save must preserve unrelated unsaved drafts');
 assert.equal((linux?linuxState:windowsState).settings.orbTheme,'hud-core');
 fs.writeFileSync(path.join(output,platform+'-orb.png'),(await win.webContents.capturePage()).toPNG());
 const large=win.getBounds();win.setContentSize(480,700);await delay(100);assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth'),false,'The settings layout fits a smaller screen');win.setBounds(large);
 await win.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>/Zurück.*Gespräch/.test(b.textContent));if(!button)throw Error('Settings close missing');button.click();return true;})()`);await delay(150);
 assert.equal(controller.active,false);assert.deepEqual(win.getBounds(),before);assert.equal(win.webContents.id,renderer);
 assert.equal(calls.slice(beforeCalls).filter(call=>['interrupt','transcribe','select','privacy'].includes(call.method)).length,0,'Settings navigation has no speech/session actions');
 win.destroy();return layout;
}
app.whenReady().then(async()=>{session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));try{const windows=await check('windows'),linux=await check('linux');assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,windows,linux,errors}));app.exit(0);}catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.stack,errors}));app.exit(1);}});
