const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Conversation, SentenceBuffer } = require('../conversation.cjs');

function reasoningFixture(){
 const calls=[];let effort='none',gate=null;const c=new Conversation(async(method,params)=>{
  calls.push({method,params});if(method==='session.resume')return {session_id:'ours'};
  if(method==='config.get')return {value:effort};
  if(method==='config.set'){if(gate)await gate;effort=params.value;return {key:'reasoning',value:effort};}
  return {status:'streaming'};
 });
 return {c,calls,get effort(){return effort;},set gate(value){gate=value;}};
}
test('automatic thinking sets and verifies this session before dispatch, then restores before another turn',async()=>{
 const f=reasoningFixture();await f.c.select({id:'stored',profile:'work'});await f.c.submit('Repariere den Fehler',{reasoningEffort:'medium'});
 assert.equal(f.effort,'medium');assert.deepEqual(f.calls.map(x=>x.method),['session.resume','config.get','config.set','config.get','prompt.submit']);
 assert.equal(f.calls[2].params.scope,'session');assert.equal(f.calls[2].params.session_id,'ours');assert.equal(f.calls[2].params.profile,'work');
 let release;f.gate=new Promise(r=>release=r);f.c.receive({type:'message.complete',session_id:'ours',data:{}});assert.equal(f.c.busy,true);
 f.c.receive({type:'message.complete',session_id:'ours',data:{}});assert.equal(f.c.busy,true,'duplicate completion must not unlock restoration');
 await assert.rejects(f.c.submit('Öffne Spotify',{reasoningEffort:'none'}),/läuft/);release();await f.c.reasoningRestoring;assert.equal(f.effort,'none');assert.equal(f.c.busy,false);
 await f.c.submit('Öffne Spotify',{reasoningEffort:'none'});assert.equal(f.effort,'none');f.c.receive({type:'message.complete',session_id:'ours',data:{}});assert.equal(f.c.busy,false);
});
test('an interrupted thinking preparation never dispatches a late task',async()=>{
 const f=reasoningFixture();await f.c.select({id:'stored'});let release;f.gate=new Promise(r=>release=r);const submitted=f.c.submit('Repariere den Fehler',{reasoningEffort:'medium'});const rejected=assert.rejects(submitted,/gestoppt/);
 while(!f.calls.some(x=>x.method==='config.set'))await new Promise(r=>setImmediate(r));await f.c.interrupt();release();await rejected;
 assert.equal(f.calls.some(x=>x.method==='prompt.submit'),false);assert.equal(f.calls.some(x=>x.method==='session.interrupt'),false);assert.equal(f.effort,'none');assert.equal(f.c.busy,false);
});
test('privacy cancellation during thinking configuration prevents submission and leaves the prior effort intact',async()=>{
 const f=reasoningFixture();await f.c.select({id:'stored'});let allowed=true,release;f.gate=new Promise(r=>release=r);const submitted=f.c.submit('Plane ein Projekt',{reasoningEffort:'medium',isCurrent:()=>allowed});const rejected=assert.rejects(submitted,/gestoppt/);
 while(!f.calls.some(x=>x.method==='config.set'))await new Promise(r=>setImmediate(r));allowed=false;release();await rejected;assert.equal(f.calls.some(x=>x.method==='prompt.submit'),false);assert.equal(f.effort,'none');
});
test('unrelated completions never restore thinking in an active session',async()=>{
 const f=reasoningFixture();await f.c.select({id:'stored'});await f.c.submit('Repariere etwas',{reasoningEffort:'medium'});const count=f.calls.length;assert.equal(f.c.receive({type:'message.complete',session_id:'other',data:{}}),false);assert.equal(f.calls.length,count);assert.equal(f.effort,'medium');
 f.c.receive({type:'error',session_id:'ours',data:{message:'Failed'}});await f.c.reasoningRestoring;assert.equal(f.effort,'none');
});
test('a user thinking change during a turn is preserved rather than overwritten on completion',async()=>{
 const f=reasoningFixture();await f.c.select({id:'stored'});await f.c.submit('Analysiere etwas',{reasoningEffort:'medium'});
 await f.c.request('config.set',{value:'high'});f.c.receive({type:'message.complete',session_id:'ours',data:{}});await f.c.reasoningRestoring;assert.equal(f.effort,'high');assert.equal(f.c.busy,false);
});
test('an unverified thinking change fails before dispatch and restores the previous setting',async()=>{
 const calls=[];let effort='none',reads=0;const c=new Conversation(async(method,p)=>{calls.push(method);if(method==='session.resume')return {session_id:'ours'};if(method==='config.set'){effort=p.value;return {value:effort};}if(method==='config.get')return {value:++reads===2?'high':effort};return {status:'streaming'};});
 await c.select({id:'stored'});await assert.rejects(c.submit('Analysiere etwas',{reasoningEffort:'medium'}),error=>error.notSubmitted===true&&/nicht bestätigt/.test(error.message));assert.equal(calls.includes('prompt.submit'),false);assert.equal(effort,'none');assert.equal(c.busy,false);
});

test('a busy session cannot switch or silently reroute user work', async () => {
  const calls = [];
  const conversation = new Conversation(async (method, params) => {
    calls.push({method,params}); return { session_id: 'runtime-1', status: 'streaming' };
  });
  await conversation.select({ id: 'stored-1', profile: 'default' });
  await conversation.submit('Öffne Spotify.');
  await assert.rejects(conversation.select({id:'stored-2'}), /läuft/);
  await assert.rejects(conversation.submit('noch etwas'), /läuft/);
  assert.equal(calls[1].params.session_id, 'runtime-1');
  assert.equal(calls[1].params.text, 'Öffne Spotify.');
  assert.equal(conversation.busy, true);
});

test('unrelated events cannot complete our pinned session and failed turns stay failed', async () => {
  const conversation = new Conversation(async () => ({session_id:'ours',status:'streaming'}));
  await conversation.select({id:'stored'}); await conversation.submit('Status?');
  assert.equal(conversation.receive({type:'message.complete',session_id:'other',data:{text:'Erfolg'}}), false);
  assert.equal(conversation.busy,true);
  conversation.receive({type:'message.complete',session_id:'ours',data:{status:'error',error:'Nicht erreichbar'}});
  assert.equal(conversation.busy,false);
  assert.equal(conversation.error,'Nicht erreichbar');
});

test('sentence buffering handles fragmented words and flushes the final suffix once', () => {
  const buffer = new SentenceBuffer();
  assert.deepEqual(buffer.push('Ich prü'), []);
  assert.deepEqual(buffer.push('fe das System. Danach geht es weiter! Noch'), ['Ich prüfe das System.', 'Danach geht es weiter!']);
  assert.equal(buffer.flush(), 'Noch');
  assert.equal(buffer.flush(), '');
});

test('session selection locks out submissions while its RPC is pending',async()=>{
  let release;const conversation=new Conversation(async(method,params)=>{
    if(params.session_id==='b')return new Promise(resolve=>{release=resolve;});
    return {session_id:'live-a',status:'streaming'};
  });
  await conversation.select({id:'a'});const switching=conversation.select({id:'b'});
  await assert.rejects(conversation.submit('Auftrag für A'),/Session/);
  await assert.rejects(conversation.select({id:'c'}),/Session/);
  release({session_id:'live-b'});await switching;
  assert.equal(conversation.session.id,'live-b');assert.equal(conversation.busy,false);
});

test('muted proactive turns preserve their speech preference through the reply',async()=>{
  const conversation=new Conversation(async()=>({session_id:'live',status:'streaming'}));
  await conversation.select({id:'stored'});await conversation.submit('Systemhinweis',{speak:false});
  assert.equal(conversation.speakReply,false);
  conversation.receive({type:'message.complete',session_id:'live',data:{text:'Prüfe den Speicher.'}});
  assert.equal(conversation.speakReply,false);
  await conversation.submit('Hallo');assert.equal(conversation.speakReply,true);
});

test('a recording cannot be submitted to a different session after switching',async()=>{
  const conversation=new Conversation(async(_method,params)=>({session_id:'live-'+params.session_id}));
  await conversation.select({id:'a'});const recordedSession=conversation.session.id;
  await conversation.select({id:'b'});
  await assert.rejects(conversation.submit('Öffne Spotify',{sessionId:recordedSession}),/Session/);
  assert.equal(conversation.busy,false);
});
