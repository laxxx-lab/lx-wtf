'use strict';
// One JSON envelope in, one bounded JSON reply out. Credentials never leave this host.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const LIMIT=128*1024;
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const text=(value,max=128)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function plan(action,p){
 if(!object(p))throw Error();
 if(['device_status','windows_list'].includes(action)&&keys(p,[]))return {path:action==='device_status'?'/v1/status':'/v1/windows'};
 if(action==='show_camera'&&keys(p,['query','waitMs'])&&text(p.query,120)&&(p.waitMs===undefined||Number.isInteger(p.waitMs)&&p.waitMs>=100&&p.waitMs<=15000))return {path:'/v1/home-display',body:{action:'show',query:p.query,waitMs:p.waitMs??15000}};
 if(action==='window_place'&&require('../windows-control.cjs').validPlacement(p))return {path:'/v1/window-place',body:p};
 if(action==='browser'&&keys(p,['action','url'])&&['state','navigate','back','forward','reload'].includes(p.action)){
  if(p.action==='navigate'){require('../workbench.cjs').validateBrowserUrl(p.url);}else if(p.url!==undefined)throw Error();
  return {path:'/v1/browser',...(p.action==='state'?{}:{body:p})};
 }
 if(action==='conversation_handoff'&&keys(p,['action','target'])&&['state','transfer','recall'].includes(p.action)&&(p.action==='transfer'?['windows','notebook'].includes(p.target):p.target===undefined))return {path:'/v1/session-handoff',body:p,readOnly:p.action==='state',passive:p.action==='recall'};
 throw Error();
}
function localRequest({url,path:route,body,headers,timeoutMs}){
 return new Promise((resolve,reject)=>{
  const request=http.request(url+route,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})}},response=>{
   let size=0,chunks=[];
   response.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){response.destroy();reject(Error());}else chunks.push(chunk);});
   response.on('error',reject);
   response.on('end',()=>{try{if(response.statusCode!==200)throw Error();resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error());}});
  });
  const timer=setTimeout(()=>request.destroy(Error()),timeoutMs);
  request.on('close',()=>clearTimeout(timer));request.on('error',reject);
  request.end(body?JSON.stringify(body):undefined);
 });
}
function safeResult(value,token){
 const raw=JSON.stringify(value);
 if(!object(value)||Buffer.byteLength(raw)>LIMIT-1024||raw.includes(token))throw Error();
 function visit(item){
  if(Array.isArray(item))return item.map(visit);
  if(!object(item))return item;
  const result={};
  for(const [key,value]of Object.entries(item)){
   if(/token|password|secret|credential|media.?url|stream.?url|authorization|cookie/i.test(key))continue;
   if(/error|stderr|stack/i.test(key)){if(value)result[key]='control-rejected';continue;}
   if(typeof value==='string'&&/^https?:\/\//i.test(value)){
    try{const u=new URL(value);if(u.username||u.password)continue;u.search='';u.hash='';result[key]=u.toString();}catch{continue;}
   }else result[key]=visit(value);
  }
  return result;
 }
 return visit(value);
}
async function handleRequest(input,options={}){
 const identity={host:options.hostname??os.hostname(),platform:options.platform??process.platform};
 const actualDevice=identity.platform==='win32'?'windows':identity.platform==='linux'?'notebook':null;
 const failure=error=>({ok:false,device:actualDevice,identity,error});
 if(!keys(input,['device','expected_host','expected_session','action','params'])||!['windows','notebook'].includes(input.device))return failure('invalid-request');
 if(input.expected_host!==identity.host||input.device!==actualDevice)return failure('host-mismatch');
 if(input.device==='notebook'&&['windows_list','window_place'].includes(input.action))return failure('unsupported-device');
 let route;
 try{route=plan(input.action,input.params);}catch{return failure('invalid-request');}
 const mutation=!!route.body&&!route.readOnly;
 if(mutation&&!text(input.expected_session))return failure('session-required');
 const deadline=Date.now()+19500;
 let dispatchedMutation=false;
 try{
  const filename=identity.platform==='win32'?'control-api.json':'linux-control.json';
  const connection=await (options.loadConnection??(async()=>JSON.parse(await fs.readFile(path.join(__dirname,'../.local',filename),'utf8'))))();
  const origin=identity.platform==='win32'?'http://127.0.0.1:8872':'http://127.0.0.1:8874';
  if(!object(connection)||connection.url!==origin||typeof connection.token!=='string'||!/^[0-9a-f]{64}$/.test(connection.token))return failure('connection-unavailable');
  const request=options.request??localRequest;
  const headers={Authorization:'Bearer '+connection.token};
  if(mutation){
   const status=await request({url:origin,path:'/v1/status',headers,timeoutMs:Math.min(3000,deadline-Date.now())});
   if(status?.sessionContext?.id!==input.expected_session)return failure('session-changed');
   if(status.privacyLocked||status.privacy?.locked)return failure('privacy-locked');
   if(!route.passive&&status.sessionContext.canSubmit!==true)return failure('session-not-owned');
   headers['X-Lilith-Session']=input.expected_session;
  }
  const remaining=deadline-Date.now();if(remaining<=0)throw Error();
  dispatchedMutation=mutation;
  if(mutation)options.onMutationDispatch?.();
  const result=await request({...route,url:origin,headers,timeoutMs:remaining});
  return {ok:true,device:actualDevice,identity,result:safeResult(result,connection.token)};
 }catch{return dispatchedMutation?{...failure('outcome-unknown'),effectUnknown:true}:failure('control-unavailable');}
}
async function main(){
 let size=0,chunks=[],dispatchedMutation=false;
 const timer=setTimeout(()=>{process.stdout.write(JSON.stringify({ok:false,device:process.platform==='win32'?'windows':'notebook',identity:{host:os.hostname(),platform:process.platform},error:dispatchedMutation?'outcome-unknown':'input-timeout',...(dispatchedMutation?{effectUnknown:true}:{})}));process.exit(1);},20000);
 try{
  for await(const chunk of process.stdin){size+=chunk.length;if(size>LIMIT)throw Error();chunks.push(chunk);}
  const result=await handleRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')),{onMutationDispatch:()=>{dispatchedMutation=true;}});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch{process.stdout.write(JSON.stringify({ok:false,device:process.platform==='win32'?'windows':'notebook',identity:{host:os.hostname(),platform:process.platform},error:'invalid-input'})+'\n');}
 finally{clearTimeout(timer);}
}
module.exports={handleRequest};
if(require.main===module)main();
