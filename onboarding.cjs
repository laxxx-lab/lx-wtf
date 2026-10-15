'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {validateSetup,readInstallation,writeInstallation,applyClientSettings}=require('./setup-options.cjs');
function installationError(error){
 // Keep actionable installer text, never its stack or credentials from a URL.
 const message=String(error?.message||'Installation failed. Please retry.').slice(0,4000).split(/\r?\n/).filter(line=>!/^\s*at\s|^\s*Traceback\b|^\s*File "/.test(line)).slice(0,4).join(' ')
  .replace(/https?:\/\/[^\s<>]+/gi,raw=>{try{const url=new URL(raw);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[download URL]';}})
  .replace(/\b(authorization|password|token|api[_-]?key|secret)\s*[:=]\s*\S+/gi,'$1=[redacted]').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 return new Error(message.slice(0,600)||'Installation failed. Please retry.');
}
function runOnboarding({electron,root,initial,install}){
 if(typeof install!=='function')throw Error('A trusted speech installer is required.');
 const {BrowserWindow,ipcMain}=electron,page=path.join(__dirname,'ui/onboarding.html'),url=pathToFileURL(page).href;
 const saved=initial||readInstallation(root)||{},defaults={assistantName:'Hermes',url:'',stt:'base',tts:'de_DE-thorsten-medium',language:'de'};
 for(const key of Object.keys(defaults))if(typeof saved[key]==='string')defaults[key]=saved[key];
 return new Promise((resolve,reject)=>{
  let closed=false,busy=false;const controller=new AbortController();
  const win=new BrowserWindow({width:1000,height:850,minWidth:600,minHeight:650,title:'Hermes Voice · Setup',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'onboarding-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'hermes-voice-onboarding'}});
  const channels=['onboarding:snapshot','onboarding:save'];
  const trusted=event=>{if(closed||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==url)throw Error('Invalid onboarding sender.');};
  const cleanup=()=>{for(const channel of channels)ipcMain.removeHandler(channel);};
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
  win.webContents.on('will-redirect',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  win.webContents.session.setPermissionCheckHandler?.(()=>false);
  ipcMain.handle(channels[0],async event=>{trusted(event);return {...defaults};});
  ipcMain.handle(channels[1],async(event,value)=>{
   trusted(event);if(busy)throw Error('Installation is already running.');const choice=validateSetup(value);busy=true;
   try{
    await install(choice,progress=>{if(!closed)win.webContents.send('onboarding:progress',{message:typeof progress==='string'?progress.slice(0,1000):String(progress?.message||progress?.phase||'Installing selected components…').slice(0,1000)});},{signal:controller.signal});
    if(closed)throw Error('Setup closed before installation completed.');
    applyClientSettings(root,process.platform,choice);writeInstallation(root,choice);
    closed=true;cleanup();resolve(choice);setImmediate(()=>win.close());return {ok:true};
   }catch(error){throw installationError(error);}finally{busy=false;}
  });
  win.on('closed',()=>{if(!closed){closed=true;controller.abort();cleanup();resolve(null);}});
  Promise.resolve(win.loadFile(page)).catch(error=>{if(!closed){closed=true;cleanup();win.close();reject(error);}});
 });
}
module.exports={runOnboarding};
