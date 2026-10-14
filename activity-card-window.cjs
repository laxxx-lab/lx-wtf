'use strict';
const path=require('node:path'),fs=require('node:fs');
const {createActivityCards}=require('./activity-cards.cjs'),{createHomeDisplay}=require('./home-display.cjs');
function createActivityCardWindow({BrowserWindow,screen,ipcMain,root,allowed=()=>true}){
 let win=null,loaded=false,home,loadPending=null,displayError=null;
 function getHome(){if(!home){let config;try{config=JSON.parse(fs.readFileSync(path.join(root,'.local/home-display.json'),'utf8'));}catch{throw Error('Home Assistant ist noch nicht eingerichtet.');}home=createHomeDisplay({BrowserWindow,screen,root,url:config.url});}return home;}
 function snapshot(){return allowed()?store.read():{cards:[],privacyLocked:true};}
 async function sync(){if(!allowed()){hide();return;}const state=store.read();if(!state.cards.length){win?.hide();return;}if(!win||win.isDestroyed()){
  const area=screen.getPrimaryDisplay().workArea,width=Math.min(380,area.width),height=Math.min(310,area.height);
  win=new BrowserWindow({width,height,x:Math.round(area.x+Math.max(0,area.width-width-18)),y:Math.round(area.y+Math.max(0,area.height-height-250)),frame:false,transparent:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,show:false,webPreferences:{partition:'lilith-activity-cards',preload:path.join(root,'activity-card-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const own=win;loaded=false;own.webContents.setWindowOpenHandler(()=>({action:'deny'}));own.webContents.on('will-navigate',event=>event.preventDefault());own.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  own.on('closed',()=>{if(win===own){win=null;loaded=false;}});loadPending=own.loadFile(path.join(root,'ui/activity-card.html')).then(()=>{if(win!==own||own.isDestroyed())return;loaded=true;displayError=null;own.webContents.send('lilith-card:state',snapshot());if(allowed()&&store.read().cards.length)own.showInactive();}).catch(()=>{displayError='Die Aktivitätsansicht konnte nicht geladen werden.';if(win===own){own.destroy();win=null;loaded=false;}});
 }else if(loaded){win.webContents.send('lilith-card:state',state);if(!win.isVisible())win.showInactive();}await loadPending;}
 const store=createActivityCards({file:path.join(root,'.local/activity-cards.json')});
 function access(event){if(event.sender!==win?.webContents||!event.senderFrame?.url.startsWith('file:'))throw Error('Unbekannte Kartenansicht.');}
 ipcMain.handle('lilith-card:snapshot',event=>{access(event);return snapshot();});
 ipcMain.handle('lilith-card:dismiss',async(event,id)=>{access(event);const result=store.execute({action:'dismiss',id});await sync();return result;});
 ipcMain.handle('lilith-card:camera',async(event,id)=>{access(event);if(!allowed())throw Error('Datenschutz oder fremder Gesprächsbesitz.');const card=store.read().cards.find(c=>c.id===id&&c.kind==='camera');if(!card)throw Error('Kamera nicht gefunden.');return getHome().openCamera(card.cameraEntity);});
 function hide(){win?.destroy();win=null;loaded=false;home?.hide();}
 return {read:snapshot,execute:async value=>{if(!allowed())throw Object.assign(Error('Datenschutz oder fremder Gesprächsbesitz.'),{status:423});let result;try{result=store.execute(value);}catch(error){throw Object.assign(error,{status:400});}await sync();return {...result,display:{shown:!!win&&!win.isDestroyed()&&win.isVisible(),...(displayError?{error:displayError}:{})}};},home:async value=>{if(!allowed())throw Object.assign(Error('Datenschutz oder fremder Gesprächsbesitz.'),{status:423});if(value?.action==='open')return getHome().open();if(value?.action==='camera')return getHome().openCamera(value.cameraEntity);if(value?.action==='inventory')return {...await getHome().inventory(),camera:await getHome().cameraState()};throw Object.assign(Error('Unbekannte Home-Assistant-Aktion.'),{status:400});},sync,hide};
}
module.exports={createActivityCardWindow};
