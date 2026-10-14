'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const events=[],ctx=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app:{setPath(){},setName(){},setAppUserModelId(){},setLoginItemSettings(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false},ipcMain:{handle(){}},Notification:{isSupported:()=>false}};
  if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('test settings');}};
  return require(name.startsWith('./')?path.resolve(__dirname,'..',name):name);
 }});vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),ctx);ctx.events=events;
 vm.runInContext("connected=true;emit=(type,data={})=>events.push({type,...data});conversation=new Conversation(async method=>method==='config.get'?{value:'none'}:{});conversation.session={id:'runtime',storedId:'stored',profile:'default'};scheduleJobs=()=>{};",ctx);
 return {events,run:code=>vm.runInContext(code,ctx)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('accepted voice work stays visibly processing while the final capture report drains',async()=>{
 const f=fixture();f.run("clientListening=true;status='ready';");await f.run("submit('Suche ein Lied.',{speak:false})");
 assert.equal(f.run('getJobs().list()[0].status'),'queued');assert.equal(f.run('status'),'thinking');assert.equal(f.run('conversation.busy'),false);
});
test('job preparation is visible before delayed native intent parsing',async()=>{
 const f=fixture();f.run("directController={parse:()=>new Promise(resolve=>globalThis.finishParse=resolve)};status='ready';");
 const pending=f.run("submit('Suche ein Lied.',{speak:false})");await flush();assert.equal(f.run('status'),'thinking');f.run('finishParse(null)');await pending;
});
test('thinking begins during remote configuration rather than after prompt acceptance',async()=>{
 const f=fixture();f.run("config.directCommandsEnabled=false;conversation.request=async method=>method==='config.get'?new Promise(resolve=>globalThis.finishConfig=resolve):{};status='ready';");
 const pending=f.run("submit('Suche ein Lied.',{speak:false})");await flush();assert.equal(f.run('conversation.preparing'),true);assert.equal(f.run('status'),'thinking');assert.equal(f.events.filter(e=>e.type==='state').at(-1).busy,true);f.run("finishConfig({value:'none'})");await pending;
});
test('a waiting second request does not overwrite the running tool phase',async()=>{
 const f=fixture();f.run("conversation.busy=true;status='working';");await f.run("submit('Suche ein Lied.',{speak:false})");assert.equal(f.run('status'),'working');
});
test('cancelling the sole waiting request clears its processing display',async()=>{
 const f=fixture();f.run("clientListening=true;status='ready';");await f.run("submit('Suche ein Lied.',{speak:false})");await f.run("jobAction('job-cancel',{id:getJobs().list()[0].id})");assert.equal(f.run('status'),'ready');
});
test('failed local preparation replaces processing with error',async()=>{
 const f=fixture();f.run("directController={parse:async()=>{throw Error('Preparation failed')}};status='ready';");await assert.rejects(f.run("submit('Suche ein Lied.',{speak:false})"),/Preparation failed/);assert.equal(f.run('status'),'error');
});
test('a scheduled queued submission failure clears thinking after remote preparation starts',async()=>{
 const f=fixture();f.run("clientListening=true;config.directCommandsEnabled=false;conversation.request=async()=>{throw Error('Send failed')};status='ready';");await f.run("submit('Suche ein Lied.',{speak:false})");f.run('clientListening=false;');await assert.rejects(f.run('pumpJobs()'),/Send failed/);assert.equal(f.run('status'),'error');assert.equal(f.run('conversation.busy'),false);
});
