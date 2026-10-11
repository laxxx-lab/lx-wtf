'use strict';
const {ARTCRAFT_APPS}=require('./artcraft.cjs');
function createWindowStream({resolveTarget,getSources,allowed,onStop=()=>{},now=Date.now}){
 let pending=null,target=null,generation=0,checking=false;
 const same=(a,b)=>a&&b&&a.appId===b.appId&&a.pid===b.pid&&a.windowId===b.windowId;
 function stop(reason='Fensterstream beendet.'){const existed=!!(pending||target);generation++;pending=null;target=null;if(existed)onStop(reason);}
 return {
  arm(appId){if(!allowed()||!ARTCRAFT_APPS.some(app=>app.id===appId))throw Error('Fensterstream nicht verfügbar.');stop();pending={appId,expires:now()+10000};return {ok:true};},
  async request(request){
   const grant=pending;pending=null;const ticket=generation;
   if(!grant||!allowed()||grant.expires<now()||!request.videoRequested||request.audioRequested)return null;
   const valid=()=>ticket===generation&&allowed();
   try{
    const owner=await resolveTarget(grant.appId);if(!valid())return null;
    const sources=await getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});if(!valid())return null;
    const source=sources.find(source=>{const match=/^window:(\d+):\d+$/.exec(source.id);return match&&BigInt(match[1])===BigInt(owner.windowId);});
    if(!source||!same(owner,await resolveTarget(grant.appId))||!valid())return null;
    target=owner;return {video:source};
   }catch{return null;}
  },
  async check(){if(!target||checking)return;checking=true;const ticket=generation,owner=target;try{if(!allowed()||!same(owner,await resolveTarget(owner.appId))){if(ticket===generation)stop('Anwendungsfenster nicht mehr verfügbar.');}}catch{if(ticket===generation)stop('Anwendungsfenster nicht mehr verfügbar.');}finally{checking=false;}},
  stop,
  get active(){return !!target;},
  get target(){return target?{...target}:null;},
  get armed(){return !!pending&&pending.expires>=now();},
 };
}
module.exports={createWindowStream};
