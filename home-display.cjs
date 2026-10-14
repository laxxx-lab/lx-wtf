'use strict';
const crypto=require('node:crypto');
function homeDisplayUrl(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Ungültige Home-Assistant-Adresse.');return url.origin;}
// Home Assistant owns authentication and camera playback in its own isolated
// browser partition. No credentials, tokens or signed media URLs enter Lilith.
function createHomeDisplay({BrowserWindow,screen,url,onState=()=>{}}){
 const origin=homeDisplayUrl(url),partition='persist:lilith-home-'+crypto.createHash('sha256').update(origin).digest('hex').slice(0,12);
 let win=null,entity=null,pending=null,ready=false,cameraOpened=false;
 async function cameraState(){if(!win||win.isDestroyed())return {configured:true,connected:false};
  const result=await win.webContents.executeJavaScript(`(()=>{const ha=document.querySelector('home-assistant'),h=ha?.hass,id=${JSON.stringify(entity)};let playing=false;const visit=(root,selected=false)=>{for(const n of root.querySelectorAll('*')){const owns=selected||n.tagName==='MORE-INFO-CAMERA'&&n.stateObj?.entity_id===id;if(owns&&n.tagName==='VIDEO'&&n.readyState>=2&&!n.paused)playing=true;if(n.shadowRoot)visit(n.shadowRoot,owns);}};if(h&&id)visit(document);return {connected:!!h,playing};})()`);ready=result.connected;return {configured:true,...result,cameraEntity:entity};
 }
 async function openCamera(cameraEntity){
  if(cameraEntity!==undefined&&!/^camera\.[a-z0-9_]{1,120}$/.test(cameraEntity))throw Error('Ungültige Kamera-Entität.');entity=cameraEntity||null;cameraOpened=false;
  if(!win||win.isDestroyed()){
   const area=screen.getPrimaryDisplay().workArea,width=Math.min(520,area.width),height=Math.min(600,area.height);
   win=new BrowserWindow({width,height,x:Math.round(area.x+Math.max(0,area.width-width-16)),y:Math.round(area.y+Math.max(0,(area.height-height)/2)),title:'Lilith · Home Assistant',show:false,autoHideMenuBar:true,webPreferences:{partition,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
   win.webContents.setAudioMuted(true);win.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,next)=>{try{if(new URL(next).origin!==origin)event.preventDefault();}catch{event.preventDefault();}});
   const own=win;own.on('closed',()=>{if(win!==own)return;if(pending)clearTimeout(pending);win=null;ready=false;pending=null;onState({connected:false});});
   // Home Assistant's ordinary login redirect aborts the initial navigation.
   // Accept only that same-origin navigation, never a failed external page.
   const loading=own.loadURL(origin+'/').catch(error=>{if(error.code==='ERR_ABORTED'&&new URL(own.webContents.getURL()).origin===origin)return;throw error;});
   let timeout;try{await Promise.race([loading,new Promise((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Home Assistant ist von diesem Gerät nicht erreichbar.')),15000);})]);if(win===own&&!own.isDestroyed())own.showInactive();}catch(error){if(win===own)own.destroy();throw error;}finally{clearTimeout(timeout);}
  }else win.showInactive();
  const state=await applyEntity();return {shown:!!win&&!win.isDestroyed()&&win.isVisible(),configured:true,connected:ready,cameraOpened,cameraEntity:entity,...(state?.error?{error:state.error}:{})};
 }
 async function applyEntity(){if(!win||win.isDestroyed())return;
  const target=entity,own=win;
  const result=await own.webContents.executeJavaScript(`(()=>{const ha=document.querySelector('home-assistant');if(!ha?.hass)return {connected:false};const id=${JSON.stringify(target)};if(id&&!ha.hass.states[id])return {connected:true,cameraOpened:false,error:'Diese Kamera ist in Home Assistant nicht vorhanden.'};if(id)ha.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:id},bubbles:true,composed:true}));return {connected:true,cameraOpened:!!id};})()`);
  if(win!==own||own.isDestroyed()||target!==entity)return;ready=result.connected;cameraOpened=result.cameraOpened===true;if(!ready&&pending===null){pending=setTimeout(()=>{pending=null;void applyEntity().catch(()=>{});},1000);pending.unref?.();}
  if(ready)onState({...result,cameraEntity:target});return result;
 }
 async function inventory(){if(!win||win.isDestroyed())return {configured:true,connected:false,entities:[]};
  return win.webContents.executeJavaScript(`(()=>{const h=document.querySelector('home-assistant')?.hass;if(!h)return {configured:true,connected:false,entities:[]};const rows=Object.values(h.states).filter(e=>e.entity_id.startsWith('camera.')||/ring|wasch|wash|backofen|oven/i.test(e.entity_id+' '+(e.attributes.friendly_name||''))).slice(0,50).map(e=>({id:e.entity_id,name:String(e.attributes.friendly_name||e.entity_id).slice(0,120),state:String(e.state).slice(0,120),observedAt:new Date().toISOString(),changedAt:e.last_updated}));return {configured:true,connected:true,entities:rows};})()`);
 }
 function hide(){if(pending){clearTimeout(pending);pending=null;}win?.destroy();win=null;ready=false;}
 return {open:()=>openCamera(),openCamera,inventory,cameraState,hide};
}
module.exports={homeDisplayUrl,createHomeDisplay};
