'use strict';
const path=require('node:path'),{promisify}=require('node:util'),{execFile}=require('node:child_process');
const runFile=promisify(execFile),INPUT_APPS=Object.freeze(['light']);
const INPUT_KEYS=Object.freeze(['Enter','Escape','Tab','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Space']);
function validCraftInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!INPUT_APPS.includes(value.appId))return false;
 const keys={arm:['appId','kind','frameWidth','frameHeight'],click:['appId','kind','frameId','x','y'],scroll:['appId','kind','frameId','x','y','delta'],key:['appId','kind','frameId','key'],text:['appId','kind','frameId','text']}[value.kind];
 if(!keys||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))return false;
 if(value.kind==='arm')return ['frameWidth','frameHeight'].every(key=>Number.isInteger(value[key])&&value[key]>0&&value[key]<=8192);
 if(typeof value.frameId!=='string'||!(/^[a-f0-9]{32}$/).test(value.frameId))return false;
 if(['click','scroll'].includes(value.kind)&&!['x','y'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1))return false;
 if(value.kind==='scroll')return Number.isFinite(value.delta)&&value.delta!==0&&Math.abs(value.delta)<=2000;
 if(value.kind==='key')return INPUT_KEYS.includes(value.key);
 if(value.kind==='text')return typeof value.text==='string'&&value.text.length>0&&value.text.length<=256&&!/[\u0000-\u001f\u007f]/.test(value.text);
 return true;
}
function validRect(rect){return rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key])&&Math.abs(rect[key])<=100000)&&rect.width>0&&rect.height>0;}
function captureGeometry(native,inspect,frame){
 const {client,frame:outer}=native||{},points=inspect?.window,scale=inspect?.pixelsPerPoint;
 if(!validRect(client)||!validRect(outer)||!Array.isArray(points)||points.length!==2||!points.every(value=>Number.isFinite(value)&&value>0&&value<=32768)||!Number.isFinite(scale)||scale<=0||scale>8||Math.abs(points[0]*scale-client.width)>3||Math.abs(points[1]*scale-client.height)>3)throw Error('Anwendungs-Geometrie stimmt nicht mit dem Fenster überein.');
 const matches=rect=>Math.abs(frame.frameWidth/frame.frameHeight-rect.width/rect.height)*frame.frameHeight<=2;
 const candidates=[outer,client].filter(matches);
 if(!candidates.length||(candidates.length===2&&['x','y','width','height'].some(key=>outer[key]!==client[key])))throw Error('Fensterstream-Geometrie ist nicht eindeutig.');
 return {capture:{...candidates[0]},client:{...client},points:[...points],scale};
}
function clientPoint(geometry,x,y){
 const {capture,client,points}=geometry,px=capture.x+x*capture.width-client.x,py=capture.y+y*capture.height-client.y;
 if(px<0||py<0||px>=client.width||py>=client.height)throw Error('Der Fensterrahmen empfängt keine eingebetteten Eingaben.');
 return {x:px/client.width*points[0],y:py/client.height*points[1]};
}
async function readNativeWindow({exePath,pid,windowId,signal}){
 if(process.platform!=='win32')throw Error('Native Fensterprüfung ist nur unter Windows verfügbar.');
 try{
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts/window_input.ps1'),'-ExpectedPid',String(pid),'-ExpectedHandle',String(windowId),'-ExpectedExe',exePath],{windowsHide:true,timeout:5000,maxBuffer:16384,signal});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
 }catch(error){if(error?.name==='AbortError')throw error;throw Error('Native Fensterprüfung fehlgeschlagen.');}
}
module.exports={INPUT_APPS,INPUT_KEYS,validCraftInput,captureGeometry,clientPoint,readNativeWindow};
