'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const root=path.resolve(__dirname,'..'),context=vm.createContext({__dirname:root,process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app:{setPath(){},setName(){},setAppUserModelId(){},setLoginItemSettings(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false},ipcMain:{handle(){}},Notification:{isSupported:()=>false}};
  if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('Isolated test settings');}};
  return require(name.startsWith('./')?path.resolve(root,name):name);
 }});
 vm.runInContext(fs.readFileSync(path.join(root,'main.cjs'),'utf8'),context);
 const run=code=>vm.runInContext(code,context);
 run("connected=true;emit=()=>{};scheduleJobs=()=>{};config.directCommandsEnabled=false;conversation=new Conversation(async()=>({}));conversation.session={id:'runtime',storedId:'stored',profile:'default'};windowsControl={read:()=>new Promise(resolve=>globalThis.finishWindows=resolve)};globalThis.modelSubmits=0;conversation.submit=async()=>{modelSubmits++;conversation.busy=true;};");
 return {run};
}
test('cancelling an arrangement during native window observation never submits that job to Hermes',async()=>{
 const f=fixture(),pending=f.run("submit('Ordne die Fenster nebeneinander an.',{speak:false})");
 // Attach the failure handler before cancelling; either a cancelled return or
 // a rejected submission is valid, but a late model request is never valid.
 const settled=pending.catch(()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.run('typeof finishWindows'),'function');assert.equal(f.run('getJobs().active().status'),'running');
 await f.run("jobAction('job-cancel',{id:getJobs().active().id})");assert.equal(f.run('getJobs().active().status'),'outcome-unknown');
 f.run("finishWindows({observedAt:new Date().toISOString(),desktop:{sessionId:1,coordinateSpace:'physical',monitors:[]},windows:[]})");
 await settled;assert.equal(f.run('modelSubmits'),0,'A matching job ID does not authorize its cancelled state');
});
