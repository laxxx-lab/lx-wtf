'use strict';
const path=require('node:path'),readline=require('node:readline'),{spawn:defaultSpawn}=require('node:child_process');
const clamp=value=>Math.max(0,Math.min(1,value));
function validDesktopGesture(value,now){
 if(!value||typeof value!=='object'||Array.isArray(value)||!['pointer','cancel','zoom'].includes(value.kind)||!Number.isSafeInteger(value.generation)||value.generation<0||!Number.isSafeInteger(value.sequence)||value.sequence<0||!Number.isFinite(value.at)||now-value.at>350||value.at>now+50)return false;
 if(value.kind==='pointer')return ['x','y'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1)&&typeof value.pinching==='boolean'&&(value.scrolling===undefined||typeof value.scrolling==='boolean')&&!(value.pinching&&value.scrolling);
 return value.kind!=='zoom'||Number.isFinite(value.delta)&&Math.abs(value.delta)<=1;
}
class DesktopGestureInput{
 constructor({send,now=Date.now}){this.send=send;this.now=now;this.generation=-1;this.sequence=-1;this.lastAt=null;this.point=null;this.press=null;this.scroll=null;this.armed=false;this.zoom=0;}
 reset(){this.send({kind:'cancel'});this.point=null;this.press=null;this.scroll=null;this.armed=false;this.zoom=0;}
 handle(value){
  const now=this.now();if(!validDesktopGesture(value,now))return false;
  if(value.generation<this.generation||value.generation===this.generation&&value.sequence<=this.sequence)return false;
  if(value.generation!==this.generation||this.lastAt!==null&&(value.at<this.lastAt||value.at-this.lastAt>350))this.reset();
  this.generation=value.generation;this.sequence=value.sequence;this.lastAt=value.at;
  if(value.kind==='cancel'){this.reset();return true;}
  if(value.kind==='zoom'){
   if(this.press||this.point||this.scroll)this.reset();this.zoom+=value.delta*1200;const delta=Math.trunc(this.zoom/120)*120;
   if(delta){this.zoom-=delta;this.send({kind:'zoom',delta:Math.max(-480,Math.min(480,delta))});}else this.send({kind:'ping'});return true;
  }
  this.zoom=0;
  if(value.scrolling){
   if(this.press)this.reset();if(this.scroll){const delta=Math.round((this.scroll.y-value.y)*2400);if(delta)this.send({kind:'scroll',delta:Math.max(-480,Math.min(480,delta))});else this.send({kind:'ping'});}
   else this.send({kind:'ping'});this.scroll={x:value.x,y:value.y};this.armed=false;return true;
  }
  this.scroll=null;
  if(value.pinching){
   if(!this.press&&this.armed&&this.point){this.press={origin:{x:value.x,y:value.y},anchor:{...this.point},current:{...this.point},dragging:false};this.armed=false;}
   const press=this.press;if(!press){this.send({kind:'ping'});return true;}
   const dx=value.x-press.origin.x,dy=value.y-press.origin.y;
   if(!press.dragging&&Math.hypot(dx,dy)>.016){this.send({kind:'move',...press.anchor});this.send({kind:'down'});press.dragging=true;}
   press.current=press.dragging?{x:clamp(press.anchor.x+dx),y:clamp(press.anchor.y+dy)}:press.anchor;
   this.send({kind:'move',...press.current});return true;
  }
  if(this.press){const press=this.press;this.send(press.dragging?{kind:'up'}:{kind:'click',...press.current});this.point={...press.current};this.press=null;this.armed=true;return true;}
  this.point={x:value.x,y:value.y};this.armed=true;this.send({kind:'move',...this.point});return true;
 }
}
function createDesktopGestures({root=__dirname,spawn=defaultSpawn,allowed=()=>false,onState=()=>{}}={}){
 let child=null,input=null,ready=false,error=null,epoch=0,sequence=0,lastResult=null;
 const snapshot=()=>({enabled:!!child,ready,error,lastInput:lastResult});
 const publish=()=>onState(snapshot());
 const send=value=>{if(!child?.stdin?.writable||(!allowed()&&!['cancel','stop'].includes(value.kind)))return;const packet={...value,id:++sequence,at:Date.now()};if(child.stdin.writableLength>16384){disable();return;}child.stdin.write(JSON.stringify(packet)+'\n');};
 function disable(){
  if(!child&&!input)return;const previous=child,previousInput=input;epoch++;child=null;input=null;ready=false;lastResult=null;previousInput?.reset();
  if(previous){previous.stdin.end(JSON.stringify({kind:'cancel',id:++sequence,at:Date.now()})+'\n');const timer=setTimeout(()=>previous.kill(),1000);timer.unref?.();previous.once('exit',()=>clearTimeout(timer));}publish();
 }
 function enable(){
  if(!allowed())return false;if(child)return true;if(error)return false;
  const ticket=++epoch;try{child=spawn(path.join(root,'runtime/voice/venv/Scripts/python.exe'),['-u',path.join(root,'scripts/desktop_gestures.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});}
  catch{error='Windows-Handsteuerung konnte nicht gestartet werden.';publish();return false;}
  const current=child;input=new DesktopGestureInput({send});publish();
  const lines=readline.createInterface({input:current.stdout});
  lines.on('line',line=>{if(ticket!==epoch)return;let result;try{result=JSON.parse(line);}catch{return;}
   if(result.ready===true){ready=true;publish();return;}
   if(result.error){error='Windows-Handsteuerung: '+String(result.error).slice(0,180);disable();return;}
   if(Number.isSafeInteger(result.id)&&result.applied===true)lastResult={id:result.id,at:Date.now(),kind:result.kind};
  });
  current.stdin.on('error',()=>{if(ticket===epoch){error='Windows-Eingabeverbindung wurde beendet.';disable();}});
  current.on('error',()=>{if(ticket===epoch){error='Lokaler Windows-Eingabehelfer ist nicht verfügbar.';disable();}});
  current.on('exit',()=>{lines.close();if(ticket===epoch){error='Windows-Eingabehelfer wurde beendet.';disable();}});
  current.stderr.on('data',()=>{});
  return true;
 }
 const monitor=setInterval(()=>{if(child&&!allowed())disable();else if(input?.lastAt!==null&&input&&Date.now()-input.lastAt>350){input.lastAt=null;input.reset();}},75);monitor.unref?.();
 return {enable,disable,resetError(){error=null;},handle(value){if(value?.kind==='cancel'){input?.reset();return false;}if(!ready||!allowed())return false;return input?.handle(value)||false;},snapshot,close(){clearInterval(monitor);disable();}};
}
module.exports={DesktopGestureInput,createDesktopGestures,validDesktopGesture};
