const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Conversation, SentenceBuffer } = require('../conversation.cjs');

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
