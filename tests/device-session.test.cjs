'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('new device conversation persists an empty separate session without resuming or interrupting the PC',async()=>{
 const calls=[],row={id:'stored-new',title:'Lilith · Notebook',source:'desktop',cwd:null,profile_name:'default',message_count:0};
 const result=await require('../device-session.cjs').createDeviceSession({profile:'default',title:row.title,request:async(method,params)=>{calls.push({method,params});return {session_id:'runtime-new',stored_session_id:row.id};},json:async(route,options)=>{calls.push({route,options});return options?{ok:true}:row;},isCurrent:()=>true});
 assert.equal(result.conversation.session.id,'runtime-new');assert.equal(result.conversation.session.storedId,'stored-new');assert.equal(calls.filter(c=>c.method==='session.create').length,1);assert.ok(!calls.some(c=>['session.interrupt','session.resume','prompt.submit'].includes(c.method)));assert.deepEqual(JSON.parse(calls[1].options.body).sessions[0].messages,[]);assert.equal(result.row.id,row.id);
});
test('a new session never replaces the selection after privacy, disconnect or ownership changes during creation',async()=>{
 let current=true,imports=0;await assert.rejects(require('../device-session.cjs').createDeviceSession({profile:'default',title:'Notebook',request:async()=>{current=false;return {session_id:'new',stored_session_id:'new-stored'};},json:async()=>{imports++;return {ok:true};},isCurrent:()=>current}),/geändert/);assert.equal(imports,0);
 await assert.rejects(require('../device-session.cjs').createDeviceSession({profile:'default',title:'Notebook',request:async()=>({session_id:'new'}),json:async()=>({ok:true}),isCurrent:()=>true}),/bestätigt/);
});
test('new session endpoint is authenticated and accepts no clone, prompt, target or interrupt fields',async t=>{
 const {createControlApi}=require('../control-api.cjs'),token='n'.repeat(64);let count=0,locked=false;const api=await createControlApi({port:0,token,readStatus:()=>({privacyLocked:locked}),onCommand:()=>{},onNewSession:()=>{count++;return {created:true};}});t.after(()=>api.close());const url='http://127.0.0.1:'+api.address().port+'/v1/session-new',headers={Authorization:'Bearer '+token},send=value=>fetch(url,{method:'POST',headers,body:JSON.stringify(value)});
 assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);assert.equal((await send({})).status,200);for(const value of [{target:'windows'},{messages:['old']},{interrupt:true},{prompt:'whoami'},[]])assert.equal((await send(value)).status,400);locked=true;assert.equal((await send({})).status,423);assert.equal(count,1);
});
