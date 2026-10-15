'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('direct device calls retain privacy, session fencing and typed workflow requests',async t=>{
 const {createControlApi}=require('../control-api.cjs'),calls=[];let selected='stable-one',locked=false;
 const api=await createControlApi({port:0,token:'d'.repeat(64),readStatus:()=>({privacyLocked:locked,sessionContext:{id:selected}}),onCommand:()=>{},onHomeDisplay:value=>{calls.push(value);return {verified:false,status:'playback-unconfirmed'};},onSessionHandoff:value=>{calls.push(value);return {phase:'requested'};}});t.after(()=>api.close());
 const base='http://127.0.0.1:'+api.address().port+'/v1/',headers={Authorization:'Bearer '+'d'.repeat(64),'X-Lilith-Session':'stable-one'},post=(action,value,h=headers)=>fetch(base+action,{method:'POST',headers:h,body:JSON.stringify(value)});
 assert.equal((await post('home-display',{action:'show',query:'Haustür',waitMs:15000})).status,200);
 assert.equal(calls[0].query,'Haustür');
 selected='stable-two';assert.equal((await post('home-display',{action:'show',query:'Haustür'})).status,409);assert.equal(calls.length,1);
 selected='stable-one';for(const value of [{action:'show',query:''},{action:'show',query:'x',waitMs:60000},{action:'show',query:'x',url:'http://example.invalid'},{action:'show',query:'x',cameraEntity:'switch.oven'}])assert.equal((await post('home-display',value)).status,400);
 assert.equal((await post('session-handoff',{action:'transfer',target:'notebook'})).status,200);assert.equal((await post('session-handoff',{action:'transfer',target:'vps'})).status,400);
 locked=true;assert.equal((await post('session-handoff',{action:'recall'})).status,423);assert.equal(calls.length,2);
 assert.equal((await post('home-display',{action:'show',query:'Haustür'},{...headers,Origin:'https://example.invalid'})).status,403);
});
test('a queued window mutation rechecks conversation ownership when it actually starts',async t=>{
 const {createControlApi}=require('../control-api.cjs');let session='old',release,entered,observed,reads=0,moves=0;
 const started=new Promise(r=>entered=r),queuedRead=new Promise(r=>observed=r);
 const api=await createControlApi({port:0,token:'f'.repeat(64),onCommand:()=>{},readStatus:()=>{if(++reads===2)observed();return {sessionContext:{id:session,canSubmit:true}};},onVolume:async()=>{entered();await new Promise(r=>release=r);return {verified:true};},onWindowPlace:()=>{moves++;return {verified:true};}});t.after(()=>api.close());
 const base='http://127.0.0.1:'+api.address().port+'/v1/',headers={Authorization:'Bearer '+'f'.repeat(64)},post=(action,value,scoped=false)=>fetch(base+action,{method:'POST',headers:{...headers,...(scoped?{'X-Lilith-Session':'old'}:{})},body:JSON.stringify(value)});
 const first=post('volume',{action:'mute'});await started;
 const second=post('window-place',{id:'123',pid:44,processStartedAt:'2026-10-15T10:00:00.000Z',monitorId:'\\\\.\\DISPLAY1',rect:{x:0,y:0,width:800,height:600}},true);
 await queuedRead;session='new';release();await first;assert.equal((await second).status,409);assert.equal(moves,0);
});
