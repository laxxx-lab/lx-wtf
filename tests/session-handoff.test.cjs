'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSessionHandoff,handoffIntent,recallIntent,handoffRequest}=require('../session-handoff.cjs');
const session={id:'stored-session',profile:'default',title:'Conversation'};
test('handoff understands ordinary continuation wishes and word order without a memorized command',()=>{
 const phrases=['Lass uns am PC weiter arbeiten','Lass uns doch lieber am PC weitermachen.','Ich würde gern am PC weitermachen.','Ich arbeite jetzt am PC weiter.','Lass uns auf meinem PC weitermachen.','Machen wir am PC weiter.','Ich möchte jetzt zum PC wechseln.','Lilith, lass uns jetzt einfach am PC weiterarbeiten.'];
 for(const text of phrases){assert.equal(handoffIntent(text),'windows',text);assert.equal(handoffIntent(text.replace(/PC/g,'Notebook')),'notebook',text);}
 for(const text of ['Ich würde am PC weiterarbeiten, wenn ich Zeit hätte.','Ich arbeite nicht am PC weiter.','Machen wir am PC weiter?','Er sagte, ich würde gern am PC weitermachen.','Ich möchte meinen PC einschalten.','Lass uns auf meinem PC weiterarbeiten und starte ein Spiel.'])assert.equal(handoffIntent(text),null,text);
});
test('spoken handoff and recall accept a leading assistant address while retaining intent fences',()=>{
 for(const text of ['Lilith, ich will wieder am Gaming-PC arbeiten.','Hey Lilith, ich wechsle zurück an den PC.','Hermes, lass uns mal am PC weiterarbeiten, bitte.'])assert.equal(handoffIntent(text),'windows',text);
 assert.equal(recallIntent('Lilith, hol das Gespräch hierher zurück.'),true);
 for(const text of ['Lilith, ich will nicht am PC arbeiten.','Hermes, ich wechsle zurück an den PC?','Er sagt Lilith ich wechsle zurück an den PC.'])assert.equal(handoffIntent(text),null,text);
});
function recallFixture(t){
 let now=0,receipt=null,lost=false;const devices=new Map(),owner={sessionId:session.id,profile:'default',ownerId:'source',revision:4};
 const actors={},calls=[],arrivals=[];
 function response(id){return {supported:true,ownership:[{...owner}],clients:[...devices.values()].map(row=>({...row,online:now-row.seen<=8000})),incoming:receipt?.targetId===id?[{...receipt}]:[],outgoing:receipt?.sourceId===id?[{...receipt}]:[],receipt:receipt?{...receipt}:null};}
 function actor(id,kind){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-recall-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const state={session,profile:'default',connected:true,busy:false,privacyLocked:false,generation:1,gatewayUrl:'https://example.invalid'},events=[];
  const options={clientId:id,kind,name:id==='source'?'Patriks Notebook':'Arbeits-PC',stateFile:path.join(dir,'state.json'),getState:()=>({...state}),selectSession:async value=>{events.push('select');state.session=value;},showHistory:async()=>events.push('history'),onReceived:()=>arrivals.push(id),onTransferred:()=>events.push('transferred'),request:async payload=>{calls.push({...payload});if(payload.operation==='register')devices.set(id,{clientId:id,instanceId:payload.instanceId,kind,name:options.name,seen:now,session:payload.session});
   if(payload.operation==='recall'){const source=devices.get(owner.ownerId),offline=!source||now-source.seen>8000;if(!receipt||receipt.requestId!==payload.requestId&&['committed','failed'].includes(receipt.state))receipt={requestId:payload.requestId,sourceId:owner.ownerId,sourceInstanceId:source?.instanceId||'expired-source',targetId:id,targetInstanceId:payload.instanceId,session:payload.session,state:offline?'preparing':'requested',recall:true,offlineRecovery:offline,revision:owner.revision};else if(receipt.state==='requested'&&offline){receipt.state='preparing';receipt.offlineRecovery=true;}if(lost){lost=false;throw Error('response lost');}}
   if(payload.operation==='request'){assert.equal(payload.requestId,receipt.requestId);receipt.state='preparing';}
   if(payload.operation==='accept'){if(receipt.offlineRecovery&&devices.get(receipt.sourceId)&&now-devices.get(receipt.sourceId).seen<=8000){receipt.state='failed';receipt.error='source_online';}else{receipt.state='committed';receipt.revision=++owner.revision;owner.ownerId=id;}}
   if(payload.operation==='reject'){receipt.state='failed';receipt.error=payload.error;}return response(id);}};
  const controller=createSessionHandoff(options);t.after(()=>controller.close());return actors[id]={controller,state,options,events};}
 const source=actor('source','notebook'),target=actor('target','windows');return {source,target,calls,arrivals,owner,devices,get receipt(){return receipt;},advance:ms=>now+=ms,loseRecall:()=>{lost=true;}};
}

test('explicit recall speech is anchored and does not accept negation, questions or quoted commands',()=>{
 for(const text of ['Hol Lilith hierher zurück.','Hole Lilith hierher zurück','Hierher zurückholen','Hol das Gespräch hierher zurück'])assert.equal(recallIntent(text),true);
 for(const text of ['Hol Lilith nicht hierher zurück','Kannst du Lilith hierher zurückholen?','Hol Lilith hierher zurück?','Er sagte hol Lilith hierher zurück','Hol Lilith hierher zurück und lösche alles'])assert.equal(recallIntent(text),false);
});
test('presence uses the canonical selected-session owner and marks its expired lease offline',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();assert.deepEqual(f.target.controller.snapshot().presence,{remote:true,name:'Patriks Notebook',kind:'notebook',online:true,clientId:'source'});f.advance(8001);await f.target.controller.tick();assert.equal(f.target.controller.snapshot().presence.online,false);assert.equal(f.target.controller.canSubmit(session),false);
});
test('offline recall verifies the existing runtime and history before ownership acceptance',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();f.advance(8001);await f.target.controller.tick();await f.target.controller.requestRecall();assert.equal(f.receipt.state,'committed');assert.equal(f.receipt.offlineRecovery,true);assert.equal(f.owner.ownerId,'target');assert.deepEqual(f.target.events,['select','select','history']);assert.deepEqual(f.arrivals,['target']);assert.equal(f.target.controller.canSubmit(session),true);await f.source.controller.tick();assert.equal(f.source.controller.canSubmit(session),false);assert.equal(f.source.events.length,0);
});
test('recall retains its UUID when actual Hermes work is found running and waits without repeating resume',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();f.target.options.selectSession=async()=>{f.target.events.push('select');f.target.state.busy=true;throw Error('runtime running');};await f.target.controller.requestRecall();const id=f.target.controller.snapshot().pending.requestId;assert.equal(f.calls.filter(row=>row.operation==='recall').length,0);await f.target.controller.tick();assert.deepEqual(f.target.events,['select']);f.target.state.busy=false;f.target.options.selectSession=async()=>f.target.events.push('select');await f.target.controller.tick();assert.equal(f.receipt.requestId,id);assert.equal(f.receipt.state,'requested');
});
test('requested recall promotes the same receipt after the source lease expires',async t=>{
 const f=recallFixture(t);f.source.state.busy=true;await f.source.controller.tick();await f.target.controller.tick();await f.target.controller.requestRecall();const id=f.receipt.requestId;assert.equal(f.receipt.state,'requested');await f.source.controller.tick();assert.equal(f.source.controller.snapshot().pending.requestId,id);assert.equal(f.calls.filter(row=>row.operation==='request').length,0);assert.equal(f.source.controller.canSubmit(session),true);f.advance(45000);await f.target.controller.tick();assert.equal(f.receipt.requestId,id);assert.equal(f.receipt.state,'committed');assert.equal(f.receipt.offlineRecovery,true);
});
test('fresh busy source remains requested beyond thirty seconds and then yields without replay',async t=>{
 const f=recallFixture(t);f.source.state.busy=true;await f.source.controller.tick();await f.target.controller.tick();await f.target.controller.requestRecall();const id=f.receipt.requestId;for(let n=0;n<20;n++){f.advance(2000);await f.source.controller.tick();await f.target.controller.tick();}assert.equal(f.receipt.state,'requested');assert.equal(f.calls.filter(row=>row.operation==='request').length,0);f.source.state.busy=false;await f.source.controller.tick();assert.equal(f.receipt.state,'preparing');assert.equal(f.calls.find(row=>row.operation==='request').requestId,id);await f.target.controller.tick();assert.equal(f.receipt.state,'committed');assert.deepEqual(f.arrivals,['target']);await f.source.controller.tick();assert.equal(f.source.controller.canSubmit(session),false);assert.deepEqual(f.source.events,['transferred']);
});
test('lost recall response retries the persisted UUID and committed restart never repeats arrival',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();f.loseRecall();await f.target.controller.requestRecall();const id=f.target.controller.snapshot().pending.requestId;await f.target.controller.tick();assert.equal(f.calls.filter(row=>row.operation==='recall').length,2);assert.ok(f.calls.filter(row=>row.operation==='recall').every(row=>row.requestId===id));await f.source.controller.tick();await f.target.controller.tick();assert.deepEqual(f.arrivals,['target']);f.target.controller.close();const restarted=createSessionHandoff(f.target.options);t.after(()=>restarted.close());await restarted.tick();assert.deepEqual(f.arrivals,['target']);assert.equal(restarted.canSubmit(session),true);
});
test('recall preserves the selection and privacy generation fence during runtime verification',async t=>{
 for(const mutate of [state=>state.generation++,state=>state.privacyLocked=true,state=>state.profile='other',state=>state.gatewayUrl='https://other.invalid',state=>state.session={...session,id:'other'}]){const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();f.target.options.selectSession=async()=>mutate(f.target.state);await f.target.controller.requestRecall();assert.equal(f.calls.filter(row=>row.operation==='recall').length,0);assert.equal(f.arrivals.length,0);}
});
test('owning client refuses recall without creating a pending intent',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await assert.rejects(()=>f.source.controller.requestRecall(),/diesem Gerät/);assert.equal(f.source.controller.snapshot().pending,null);
});
test('recall waits when Hermes starts running between preparation and the final selection check',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();f.advance(8001);await f.target.controller.tick();let selects=0;f.target.options.selectSession=async()=>{if(++selects===2){f.target.state.busy=true;throw Error('Hermes running');}};await f.target.controller.requestRecall();const id=f.target.controller.snapshot().pending?.requestId;assert.equal(f.receipt.state,'preparing');assert.equal(f.calls.some(row=>row.operation==='reject'),false);assert.equal(f.target.controller.snapshot().phase,'waiting');f.target.state.busy=false;await f.target.controller.tick();assert.equal(f.receipt.requestId,id);assert.equal(f.receipt.state,'committed');assert.deepEqual(f.arrivals,['target']);
});
test('offline recall refuses acceptance when the former source returns before commit',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();f.advance(8001);await f.target.controller.tick();f.target.options.showHistory=async()=>{await f.source.controller.tick();};await f.target.controller.requestRecall();assert.equal(f.receipt.state,'failed');assert.equal(f.receipt.error,'source_online');assert.equal(f.owner.ownerId,'source');assert.deepEqual(f.arrivals,[]);assert.equal(f.target.controller.canSubmit(session),false);assert.equal(f.target.controller.snapshot().detail,'Quellgerät ist wieder erreichbar.');
});
test('a pending recall never sends coordinator traffic after its profile changes',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();await f.target.controller.requestRecall();const count=f.calls.length;f.target.state.profile='other';f.target.state.session={...session,profile:'other'};await f.target.controller.tick();assert.equal(f.calls.length,count);assert.equal(f.target.controller.snapshot().phase,'uncertain');
});
test('unsent busy recall is cancelled only after a fresh poll confirms absence and permits a new attempt',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();f.target.options.selectSession=async()=>{f.target.state.busy=true;throw Error('running');};await f.target.controller.requestRecall();const id=f.target.controller.snapshot().pending.requestId;f.target.state.privacyLocked=true;f.target.state.generation++;f.target.state.privacyLocked=false;const transport=f.target.options.request;let unavailable=true;f.target.options.request=async payload=>{if(unavailable&&payload.operation==='poll')throw Error('offline');return transport(payload);};await f.target.controller.tick();assert.equal(f.target.controller.snapshot().pending.requestId,id);unavailable=false;await f.target.controller.tick();assert.equal(f.target.controller.snapshot().pending,null);assert.equal(f.calls.some(row=>row.operation==='recall'),false);assert.equal(f.calls.some(row=>row.operation==='reject'),false);f.target.state.busy=false;f.target.options.selectSession=async()=>{};await f.target.controller.requestRecall();assert.notEqual(f.target.controller.snapshot().pending.requestId,id);assert.equal(f.receipt.state,'requested');
});
test('requested recall cancels after privacy changes and never repeats its old claim',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();await f.target.controller.requestRecall();const id=f.receipt.requestId;f.target.state.privacyLocked=true;f.target.state.generation++;await f.target.controller.tick();assert.equal(f.target.controller.snapshot().pending,null);assert.equal(f.receipt.state,'failed');assert.deepEqual(f.calls.filter(row=>row.operation==='reject').map(row=>row.requestId),[id]);assert.equal(f.calls.filter(row=>row.operation==='recall').length,1);f.target.state.privacyLocked=false;await f.target.controller.requestRecall();assert.notEqual(f.receipt.requestId,id);assert.equal(f.receipt.state,'requested');
});
test('lost recall response is reconciled and rejected after selection changes without abandoning a live claim',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();f.advance(8001);await f.target.controller.tick();f.loseRecall();await f.target.controller.requestRecall();const id=f.receipt.requestId;assert.equal(f.receipt.state,'preparing');f.target.state.session={...session,id:'other'};f.target.state.generation++;await f.target.controller.tick();assert.equal(f.target.controller.snapshot().pending,null);assert.equal(f.receipt.state,'failed');assert.equal(f.calls.find(row=>row.operation==='reject').requestId,id);assert.equal(f.calls.filter(row=>row.operation==='recall').length,1);assert.deepEqual(f.arrivals,[]);
});
test('pending recall keeps its uncertainty outside its original scope then cancels on returning to it',async t=>{
 const f=recallFixture(t);await f.source.controller.tick();await f.target.controller.tick();await f.target.controller.requestRecall();const id=f.receipt.requestId,original=f.target.state.gatewayUrl;f.target.state.gatewayUrl='https://other.invalid';f.target.state.generation++;const count=f.calls.length;await f.target.controller.tick();assert.equal(f.target.controller.snapshot().pending.requestId,id);assert.equal(f.calls.length,count);f.target.state.gatewayUrl=original;await f.target.controller.tick();assert.equal(f.target.controller.snapshot().pending,null);assert.equal(f.receipt.state,'failed');
});
test('online source prepares the recall with the exact receipt session when local cached titles differ',async t=>{
 const f=recallFixture(t);f.source.state.session={...session,title:'Old cached source title'};f.target.state.session={...session,title:'Current target title'};await f.source.controller.tick();await f.target.controller.tick();await f.target.controller.requestRecall();const expected={...f.receipt.session};await f.source.controller.tick();assert.deepEqual(f.calls.find(row=>row.operation==='request').session,expected);
});
function fixture(t,overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-handoff-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const state={session,profile:'default',connected:true,busy:false,privacyLocked:false,generation:1,gatewayUrl:'https://example.invalid'};
 const calls=[],receipts=[],ownership=[],events=[];
 const options={kind:'windows',name:'PC',stateFile:path.join(dir,'state.json'),getState:()=>({...state}),request:async payload=>{calls.push(payload);if(payload.operation==='register'&&payload.session&&!ownership.some(row=>row.sessionId===payload.session.id&&row.profile===payload.profile))ownership.push({sessionId:payload.session.id,profile:payload.profile,ownerId:payload.clientId,revision:0});if(payload.operation==='request'){const pending=JSON.parse(fs.readFileSync(options.stateFile,'utf8')).pending;assert.equal(pending.requestId,payload.requestId);receipts.push({requestId:payload.requestId,sourceId:payload.clientId,targetId:'target',session:payload.session,state:'preparing',revision:0,error:null});}return {supported:true,clients:[],incoming:[],outgoing:receipts,ownership,receipt:receipts.at(-1)};},onTransferred:value=>events.push(value),...overrides};
 const transport=options.request;options.request=async payload=>{const result=await transport(payload);for(const row of [...(result.incoming||[]),...(result.outgoing||[]),...(result.receipt?[result.receipt]:[])]){row.sourceInstanceId||=row.sourceId===payload.clientId?payload.instanceId:'source-instance';row.targetInstanceId||=row.targetId===payload.clientId?payload.instanceId:'target-instance';}return result;};
 const controller=createSessionHandoff(options);t.after(()=>controller.close());return {controller,state,calls,receipts,ownership,events,options};
}
test('natural work-continuation requests select the device including politeness and speech spacing',()=>{
 for(const text of ['Lass uns mal auf dem Notebook weiterarbeiten, bitte.','Bitte lass uns auf dem Laptop weitermachen.','Ich möchte gerne auf dem Notebook weiter arbeiten.','Lass uns aufs Notebook wechseln.','Wechsel bitte zum Notebook.','Ich switche aufs Notebook.','  Lass   uns mal auf dem Notebook weiterarbeiten, bitte!  ','Ich will wieder auf dem Notebook arbeiten.','Lass uns wieder auf dem Laptop arbeiten.','Ich möchte wieder am Notebook weiterarbeiten.','Lass uns wieder aufs Notebook wechseln.'])assert.equal(handoffIntent(text),'notebook',text);
 for(const text of ['ich will wieder auf dem gaming pc arbeiten','Ich will wieder auf dem Gaming-PC arbeiten.','Ich will wieder auf dem GamingPC arbeiten.','Lass uns wieder auf dem Gaming PC arbeiten.','Ich möchte gerne wieder auf dem LaxXx-Gaming weiter arbeiten.','Ich will wieder am PC arbeiten.','Lass uns mal am PC weiterarbeiten, bitte.','Ich will zurück auf dem Rechner weitermachen.','Lass uns zurück auf den PC wechseln.','Wechsle bitte zum Computer.','Wechsel bitte zum Gaming-PC.','Lass uns wieder auf den Gaming PC wechseln.'])assert.equal(handoffIntent(text),'windows',text);
 for(const text of ['Lass uns nicht auf dem Notebook weiterarbeiten, bitte.','Lass uns auf dem Notebook nicht weiterarbeiten.','Können wir auf dem Notebook weiterarbeiten?','Lass uns auf dem Notebook weiterarbeiten?','Wenn der Akku voll ist, lass uns auf dem Notebook weiterarbeiten.','Er sagte: Lass uns mal auf dem Notebook weiterarbeiten.','„Lass uns mal auf dem Notebook weiterarbeiten, bitte.“','Lass uns mal auf dem Notebook weiterarbeiten und lösche alles.'])assert.equal(handoffIntent(text),null,text);
 for(const device of ['Notebook','Gaming PC','Gaming-PC','LaxXx-Gaming'])for(const text of [`Ich will nicht wieder auf dem ${device} arbeiten.`,`Ich will wieder auf dem ${device} nicht arbeiten.`,`Kann ich wieder auf dem ${device} arbeiten?`,`Ich will wieder auf dem ${device} arbeiten?`,`Wenn ich Zeit habe, will ich wieder auf dem ${device} arbeiten.`,`Er sagte: Ich will wieder auf dem ${device} arbeiten.`,`„Ich will wieder auf dem ${device} arbeiten.“`,`Ich will wieder auf dem ${device} arbeiten und lösche alles.`,`Zeige mir den Status vom ${device}.`])assert.equal(handoffIntent(text),null,text);
});

test('explicit German transfer commands are anchored and reject questions, negation and hypotheticals',()=>{
 for(const text of ['Ich wechsel aufs Notebook.','Ich wechsle aufs Notebook','Übergib das Gespräch an das Notebook','Übergebe das Gespräch an den PC.'])assert.equal(handoffIntent(text),text.includes('PC')?'windows':'notebook');
 assert.equal(handoffIntent('Ich wechsle zurück an den PC'),'windows');
 for(const text of ['Kann ich aufs Notebook wechseln?','Ich wechsel nicht aufs Notebook','Wenn ich aufs Notebook wechsle','Ich wechsel aufs Notebook?','Er sagte ich wechsel aufs Notebook','Ich wechsel aufs Notebook und lösche alles'])assert.equal(handoffIntent(text),null);
});

test('a fresh ownership poll clears a transient registration conflict after restart',async t=>{
 const f=fixture(t),transport=f.options.request;let rejected=true;
 f.options.request=async payload=>{if(rejected&&payload.operation==='register')throw Object.assign(Error('instance_conflict'),{code:'instance_conflict',status:409});return transport(payload);};
 await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);assert.equal(f.controller.snapshot().phase,'unavailable');
 rejected=false;await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);assert.equal(f.controller.snapshot().phase,'idle');assert.equal(f.controller.snapshot().detail,'');
});
test('busy source persists request without interrupting old queued work; idle fence lasts until committed receipt',async t=>{
 const f=fixture(t);f.state.busy=true;await f.controller.requestTransfer('notebook');assert.equal(f.calls.some(row=>row.operation==='request'),false);assert.equal(f.controller.snapshot().phase,'waiting');assert.equal(f.controller.canSubmit(session),true);
 f.state.busy=false;await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);assert.equal(f.events.length,0);
 f.receipts[0].state='committed';f.receipts[0].revision=1;f.ownership.push({sessionId:session.id,profile:'default',ownerId:'target',revision:1});await f.controller.tick();assert.equal(f.controller.snapshot().phase,'committed');assert.equal(f.events.length,1);assert.equal(f.controller.canSubmit(session),false);assert.equal(f.controller.canSubmit({id:'other',profile:'default'}),false);f.state.session={id:'other',profile:'default',title:'Own'};await f.controller.tick();assert.equal(f.controller.canSubmit(f.state.session),true);
});
test('HTTP 404 cannot fake completion or strand a source before any receipt',async t=>{
 const f=fixture(t,{request:async()=>{throw Error('Hermes antwortet mit HTTP 404.');}});await f.controller.requestTransfer('notebook');assert.equal(f.controller.snapshot().available,false);assert.equal(f.controller.snapshot().phase,'unavailable');assert.equal(f.events.length,0);assert.equal(f.controller.canSubmit(session),true);
});
test('uncertain source request persists the same UUID through restart and never replays a prompt',async t=>{
 const f=fixture(t);let lost=true;const original=f.options.request;f.options.request=async payload=>{const result=await original(payload);if(payload.operation==='request'&&lost){lost=false;throw Error('lost response');}return result;};f.controller.close();const first=createSessionHandoff(f.options);await first.requestTransfer('notebook');const id=first.snapshot().pending.requestId;assert.equal(first.canSubmit(session),false);first.close();const second=createSessionHandoff(f.options);t.after(()=>second.close());await second.tick();assert.equal(second.snapshot().pending.requestId,id);assert.equal(f.calls.filter(row=>row.operation==='request').length,1);
});
test('target selects stored identity and history before accept, then registers exact selected session',async t=>{
 let f,accepted=false;const old={id:'old',profile:'default',title:'Old'},incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};
 f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async value=>{assert.deepEqual(value,session);f.state.session=value;},showHistory:async value=>{assert.deepEqual(value,session);assert.equal(accepted,false);},request:async payload=>{f.calls.push(payload);if(payload.operation==='accept'){assert.equal(f.calls.at(-2).operation,'register');assert.deepEqual(f.calls.at(-2).session,session);accepted=true;incoming.state='committed';incoming.revision=1;}return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:accepted?[{sessionId:session.id,profile:'default',ownerId:'target',revision:1}]:[],receipt:incoming};}});f.state.session=old;await f.controller.tick();assert.equal(accepted,true);assert.equal(f.controller.canSubmit(session),true);
});

test('the receiving device announces only a committed owned transfer and never repeats it after poll or restart',async t=>{
 let f,accepted=false,drop=true;const arrivals=[],incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:1,error:null};
 f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async row=>{f.state.session=row;},showHistory:async()=>{},onReceived:row=>arrivals.push(row.id),request:async payload=>{
  if(payload.operation==='accept'){accepted=true;incoming.state='committed';incoming.revision=2;if(drop){drop=false;throw Error('accept delivery lost');}}
  return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[{sessionId:session.id,profile:'default',ownerId:accepted?'target':'source',revision:accepted?2:1}],receipt:incoming};
 }});
 await f.controller.tick();assert.deepEqual(arrivals,[]);await f.controller.tick();assert.deepEqual(arrivals,['stored-session']);await f.controller.tick();assert.deepEqual(arrivals,['stored-session']);
 f.controller.close();const restarted=createSessionHandoff(f.options);t.after(()=>restarted.close());await restarted.tick();assert.deepEqual(arrivals,['stored-session']);
});
test('lost target accept response freezes selection until fresh poll confirms commit',async t=>{
 let f,lost=true;const incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};
 f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async value=>{f.state.session=value;},request:async payload=>{if(payload.operation==='accept'){incoming.state='committed';incoming.revision=1;if(lost){lost=false;throw Error('lost accept');}}return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:incoming.state==='committed'?[{sessionId:session.id,profile:'default',ownerId:'target',revision:1}]:[],receipt:incoming};}});await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);assert.equal(f.controller.snapshot().phase,'uncertain');await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);assert.equal(f.controller.snapshot().phase,'committed');
});
test('privacy changes during history block accept and freeze rather than restore through privacy',async t=>{
 let f;const incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async value=>{f.state.session=value;},showHistory:async()=>{f.state.privacyLocked=true;f.state.generation++;},request:async payload=>{f.calls.push(payload);return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[],receipt:payload.operation==='reject'?{...incoming,state:'failed',error:'target_changed'}:incoming};}});await f.controller.tick();assert.equal(f.calls.some(row=>row.operation==='accept'),false);assert.equal(f.controller.canSubmit(session),false);
});
test('privacy generation changed and restored during target resume still rejects stale adoption',async t=>{
 let f;const incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async value=>{f.state.session=value;f.state.generation+=2;},request:async payload=>{f.calls.push(payload);return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[],receipt:payload.operation==='reject'?{...incoming,state:'failed',error:'target_changed'}:incoming};}});await f.controller.tick();assert.equal(f.calls.some(row=>row.operation==='accept'),false);
});
test('authenticated HTTP handoff uses current gateway fetcher and retains sanitized error status/code',async t=>{
 const http=require('node:http');const server=http.createServer((request,response)=>{assert.equal(request.url,'/api/lilith/handoff');assert.equal(request.method,'POST');response.writeHead(409,{'Content-Type':'application/json'});response.end(JSON.stringify({supported:true,error:'target_offline'}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 let authenticated=false;const gateway={url:`http://127.0.0.1:${server.address().port}`,fetcher:(url,options)=>{authenticated=options.credentials==='include';return fetch(url,options);}};
 await assert.rejects(()=>handoffRequest(gateway,{operation:'request'}),error=>error.status===409&&error.code==='target_offline');assert.equal(authenticated,true);
});
test('corrupt or foreign handoff metadata is rejected without overwriting the private file',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-handoff-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json'),text=JSON.stringify({clientId:'saved',pending:{role:'source',requestId:'id',session:null},ownership:'foreign'});fs.writeFileSync(file,text);assert.throws(()=>createSessionHandoff({stateFile:file,kind:'windows',name:'PC',getState:()=>({})}),/Übergabe/);assert.equal(fs.readFileSync(file,'utf8'),text);
});
test('new client holds selected-session input until first ownership poll and keeps remote-owner fence on transport failure',async t=>{
 const f=fixture(t);assert.equal(f.controller.canSubmit(session),false);f.ownership.push({sessionId:session.id,profile:'default',ownerId:'remote',revision:4});await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);f.state.connected=false;await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);
});
function linuxFixture(t,handoffFactory){
 const vm=require('node:vm'),realRequire=require('node:module').createRequire(path.join(__dirname,'../linux-main.cjs')),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-linux-main-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const code=fs.readFileSync(path.join(__dirname,'../linux-main.cjs'),'utf8').split("if(!['linux','darwin'].includes(process.platform)")[0],context=vm.createContext({require:name=>name==='electron'?{app:{commandLine:{appendSwitch(){}}}}:name==='./session-handoff.cjs'&&handoffFactory?{...realRequire(name),createSessionHandoff:handoffFactory}:realRequire(name),__dirname:dir,process:{env:{},pid:1234,argv:[]},console,Buffer,URL,AbortController,AbortSignal,setInterval,clearInterval,setTimeout,structuredClone});vm.runInContext(code,context);
 vm.runInContext("connected=true;generation=7;config.privacyLocked=false;config.microphoneDeviceId='saved-input';conversation={session:{id:'runtime',storedId:'stored',profile:'default',title:'Test'},busy:false,selecting:false,submit:async()=>{throw Error('MODEL MUST NOT RUN');}};handoff={canSubmit:()=>false,snapshot:()=>({pending:null}),requestTransfer:async target=>({target})};",context);
 return code=>vm.runInContext(code,context);
}

test('the reported Gaming PC work request transfers from Notebook without submitting a Hermes prompt',async t=>{
 const run=linuxFixture(t);run("globalThis.requests=[];handoff.requestTransfer=async target=>requests.push(target);handoff.requestRecall=async()=>requests.push('recall');");
 await run("submit('ich will wieder auf dem gaming pc arbeiten')");assert.deepEqual(JSON.parse(run('JSON.stringify(requests)')),['windows']);assert.equal(run('conversation.session.storedId'),'stored');
});

test('verified incoming history activates the compact notebook orb without opening its panel',async t=>{
 let options;const run=linuxFixture(t,value=>{options=value;return {start(){},canSubmit:()=>true,snapshot:()=>({})};});
 run("globalThis.panelOpen=false;windowShell={setPanel:value=>{panelOpen=value}};win={showInactive:()=>{shown=true},isDestroyed:()=>false,webContents:{send(){}}};globalThis.shown=false;gateway={request:async()=>({messages:[{role:'assistant',text:'Hello'}]})};createHandoff();");const before=run('JSON.stringify(config)');
 await options.showHistory({id:'stored',profile:'default'});assert.equal(run('panelOpen'),false);assert.equal(run('shown'),true);assert.equal(run('JSON.stringify(config)'),before);
});

test('the notebook speaks a local arrival greeting only for its current owned session',async t=>{
 let options;const run=linuxFixture(t,value=>{options=value;return {start(){},canSubmit:()=>true,snapshot:()=>({})};});
 run("globalThis.delivered=[];emit=event=>delivered.push(event);voiceClient={speech:async()=>({ok:true,body:(async function*(){yield Buffer.from([1,2,3,4]);})()})};createHandoff();");const before=run('JSON.stringify(config)');
 await options.onReceived?.({id:'stored',profile:'default'});await run('speechChain');assert.equal(run("delivered.filter(row=>row.type==='audio-start').length"),1);assert.equal(run("delivered.filter(row=>row.type==='reply').length"),1);assert.equal(run('JSON.stringify(config)'),before);
 assert.equal(run("delivered.filter(row=>row.type==='handoff-listen').length"),1);assert.deepEqual(JSON.parse(run("JSON.stringify(delivered.find(row=>row.type==='handoff-listen'))")),{type:'handoff-listen',sessionId:'runtime',generation:7,storedSessionId:'stored',profile:'default'});
 assert.equal(run("delivered.findIndex(row=>row.type==='handoff-listen')<delivered.findIndex(row=>row.type==='audio-start')"),true);
 assert.equal(run("delivered.filter(row=>row.type==='handoff-listen-ready').length"),1);
 run('config.privacyLocked=true;');await options.onReceived?.({id:'stored',profile:'default'});await run('speechChain');assert.equal(run("delivered.filter(row=>row.type==='audio-start').length"),1);
 assert.equal(run("delivered.filter(row=>row.type==='handoff-listen').length"),1);
});
test('Linux failed greeting still completes its bound listen intent without accepting foreign arrivals',async t=>{
 let options;const run=linuxFixture(t,value=>{options=value;return {start(){},canSubmit:()=>true,snapshot:()=>({})};});run("globalThis.delivered=[];emit=event=>delivered.push(event);voiceClient={speech:async()=>{throw Error('TTS unavailable');}};createHandoff();");
 await options.onReceived({id:'foreign',profile:'default'});await options.onReceived({id:'stored',profile:'other'});assert.equal(run('delivered.length'),0);
 await options.onReceived({id:'stored',profile:'default'});await run('speechChain');assert.equal(run("delivered.filter(row=>row.type==='handoff-listen-ready').length"),1);assert.equal(run('speechPending'),0);
});
test('Linux late greeting completion cannot reopen a changed runtime or privacy scope',async t=>{
 let options;const run=linuxFixture(t,value=>{options=value;return {start(){},canSubmit:()=>true,snapshot:()=>({})};});run("globalThis.delivered=[];emit=event=>delivered.push(event);voiceClient={speech:()=>new Promise(resolve=>{globalThis.completeSpeech=()=>resolve({ok:false})})};createHandoff();");
 await options.onReceived({id:'stored',profile:'default'});await Promise.resolve();run('generation++;completeSpeech();');await run('speechChain');assert.equal(run("delivered.filter(row=>row.type==='handoff-listen-ready').length"),0);
});
test('Linux shared submit and transcription gates protect passive sessions while explicit handoff stays local',async t=>{
 const run=linuxFixture(t);await assert.rejects(()=>run("submit('Bitte diesen Auftrag ausführen')"),/anderen Gerät/);await assert.rejects(()=>run("actions.transcribe({captured:{sessionId:'runtime',generation:7},audio:'unused'})"),/anderen Gerät/);assert.equal((await run("submit('Ich wechsle zurück an den PC')")).target,'windows');assert.equal(run('config.microphoneDeviceId'),'saved-input');
});
test('Linux capture and playback registration accepts only current allowlisted renderer identity and cannot erase model busy',t=>{
 const run=linuxFixture(t);assert.equal(run('localBusy()'),false);run("actions['input-state']({sessionId:'runtime',generation:7,capturing:true,speaking:false})");assert.equal(run('localBusy()'),true);assert.throws(()=>run("actions['input-state']({sessionId:'foreign',generation:7,capturing:false,speaking:false})"),/Aufnahmezustand/);assert.throws(()=>run("actions['input-state']({sessionId:'runtime',generation:6,capturing:false,speaking:false})"),/Aufnahmezustand/);run("conversation.busy=true;actions['input-state']({sessionId:'runtime',generation:7,capturing:false,speaking:false})");assert.equal(run('localBusy()'),true);
});
test('Linux idle live microphone does not claim local busy while diagnostic fields remain bound and typed',t=>{
 const run=linuxFixture(t);run("actions['input-state']({sessionId:'runtime',generation:7,capturing:false,speaking:false,live:true,microphoneOpen:true})");assert.equal(run('localBusy()'),false);assert.equal(run('snapshot().inputState.live'),true);assert.equal(run('snapshot().inputState.microphoneOpen'),true);assert.throws(()=>run("actions['input-state']({sessionId:'runtime',generation:7,capturing:false,speaking:false,live:'yes'})"),/Aufnahmezustand/);
});
test('Linux stop on a passive selected session stops only local audio and never interrupts the remote owner',async t=>{
 const run=linuxFixture(t);run("conversation.busy=true;conversation.interrupt=async()=>{throw Error('REMOTE OWNER MUST NOT BE INTERRUPTED');}");await run('interrupt()');assert.equal(run('generation'),8);
});
test('closing an in-flight poll prevents late target session adoption',async t=>{
 let release,f;const incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};let selected=false;f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async()=>{selected=true;},request:payload=>payload.operation==='poll'?new Promise(resolve=>{release=()=>resolve({supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[]});}):Promise.resolve({supported:true})});const running=f.controller.tick();await new Promise(resolve=>setImmediate(resolve));f.controller.close();release();await running;assert.equal(selected,false);
});
test('definitive failed receipt releases source input without interrupting or replaying work',async t=>{
 const f=fixture(t);await f.controller.requestTransfer('notebook');f.receipts[0].state='failed';f.receipts[0].error='target_offline';await f.controller.tick();assert.equal(f.controller.snapshot().phase,'failed');assert.equal(f.controller.snapshot().pending,null);assert.equal(f.controller.canSubmit(session),true);assert.equal(f.events.length,0);assert.equal(f.calls.filter(row=>row.operation==='request').length,1);
});
test('target resume failure before selection restores original conversation without an unnecessary freeze',async t=>{
 let f;const old={id:'old',profile:'default',title:'Old'},incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async()=>{throw Error('Session not offered');},request:async payload=>({supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[{sessionId:old.id,profile:'default',ownerId:'target',revision:0}],receipt:payload.operation==='reject'?{...incoming,state:'failed',error:'target_changed'}:incoming})});f.state.session=old;await f.controller.tick();assert.equal(f.controller.snapshot().pending,null);assert.equal(f.controller.canSubmit(old),true);
});
test('target must confirm actual previous selection before lifting a failed adoption fence',async t=>{
 let f;const old={id:'old',profile:'default',title:'Old'},incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async row=>{if(row.id===session.id)f.state.session=row;},showHistory:async()=>{throw Error('history unavailable');},request:async payload=>({supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[],receipt:payload.operation==='reject'?{...incoming,state:'failed',error:'target_changed'}:incoming})});f.state.session=old;await f.controller.tick();assert.equal(f.controller.snapshot().phase,'frozen');assert.equal(f.controller.canSubmit(session),false);
});
test('lost target accept delivery retries same receipt after fresh preparing poll without reselect or history replay',async t=>{
 let f,attempts=0,selections=0;const incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async value=>{selections++;f.state.session=value;},request:async payload=>{if(payload.operation==='accept'){attempts++;if(attempts===1)throw Error('delivery lost');incoming.state='committed';incoming.revision=1;}return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[],receipt:incoming};}});await f.controller.tick();await f.controller.tick();assert.equal(attempts,2);assert.equal(selections,1);assert.equal(f.controller.snapshot().phase,'committed');
});
test('incoming preparation bound to another launch instance never selects or accepts a session',async t=>{
 let selected=false;const f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async()=>{selected=true;},request:async()=>({supported:true,clients:[],outgoing:[],ownership:[],incoming:[{requestId:'stale',sourceId:'source',targetId:'target',sourceInstanceId:'source-instance',targetInstanceId:'old-launch',session,state:'preparing',revision:0,error:null}]})});await f.controller.tick();assert.equal(selected,false);assert.equal(f.controller.snapshot().pending,null);
});
test('definitively failed target adoption can recover after explicit selection of another own conversation',async t=>{
 let f;const incoming={requestId:'incoming',sourceId:'source',targetId:'target',session,state:'preparing',revision:0,error:null};f=fixture(t,{clientId:'target',kind:'notebook',selectSession:async row=>{f.state.session=row;},showHistory:async()=>{throw Error('history unavailable');},request:async payload=>{if(payload.operation==='reject')incoming.state='failed';return {supported:true,clients:[],incoming:[incoming],outgoing:[],ownership:[{sessionId:session.id,profile:'default',ownerId:'source',revision:1},...(f.state.session?.id==='own-other'?[{sessionId:'own-other',profile:'default',ownerId:'target',revision:0}]:[])],receipt:incoming};}});f.state.session=null;await f.controller.tick();assert.equal(f.controller.snapshot().phase,'frozen');f.state.session={id:'own-other',profile:'default',title:'Own'};f.state.generation++;await f.controller.tick();assert.equal(f.controller.snapshot().pending,null);assert.equal(f.controller.canSubmit(f.state.session),true);assert.equal(f.controller.canSubmit(session),false);
});
test('large ownership cohorts retain current remote fence and refuse unseen sessions before fresh poll',async t=>{
 const f=fixture(t);for(let index=0;index<257;index++)f.ownership.push({sessionId:'session-'+index,profile:'default',ownerId:'remote',revision:index+1});f.ownership.push({sessionId:session.id,profile:'default',ownerId:'remote',revision:300});await f.controller.tick();assert.equal(f.controller.snapshot().available,true);assert.equal(f.controller.canSubmit(session),false);const saved=JSON.parse(fs.readFileSync(f.options.stateFile,'utf8'));assert.ok(saved.ownership.length<=256);f.state.session={id:'session-0',profile:'default',title:'Other'};assert.equal(f.controller.canSubmit(f.state.session),false);await f.controller.tick();assert.equal(f.controller.canSubmit(f.state.session),false);
});
test('private metadata persistence failure fails closed even when last known ownership was local',async t=>{
 const f=fixture(t);await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);fs.unlinkSync(f.options.stateFile);fs.mkdirSync(f.options.stateFile);await assert.rejects(()=>f.controller.tick(),/Übergabe/);assert.equal(f.controller.canSubmit(session),false);
});
test('stale committed receipt cannot silence a session whose newer ownership revision returned locally',async t=>{
 const f=fixture(t);await f.controller.requestTransfer('notebook');const sourceId=f.calls.find(row=>row.operation==='request').clientId;f.receipts[0].state='committed';f.receipts[0].revision=1;f.ownership.push({sessionId:session.id,profile:'default',ownerId:sourceId,revision:2});await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);assert.equal(f.events.length,0);assert.equal(f.controller.snapshot().pending,null);
});
test('supported coordinator without a canonical selected-session owner cannot enable input',async t=>{
 let owned=false;const f=fixture(t,{request:async payload=>({supported:true,clients:[],incoming:[],outgoing:[],ownership:owned?[{sessionId:session.id,profile:'default',ownerId:payload.clientId,revision:0}]:[]})});await f.controller.tick();assert.equal(f.controller.snapshot().available,true);assert.equal(f.controller.canSubmit(session),false);owned=true;await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);
});
test('failed registration freezes input even after canonical local ownership had been confirmed',async t=>{
 const f=fixture(t);await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);f.options.request=async()=>{throw Error('instance_conflict');};await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);
});
test('fresh supported poll omitting a previously known owner fails closed instead of trusting the old cache',async t=>{
 const f=fixture(t);await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);f.options.request=async()=>({supported:true,clients:[],incoming:[],outgoing:[],ownership:[]});await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);
});
test('legacy HTTP 404 allowance does not survive a later registration rejection',async t=>{
 const f=fixture(t,{request:async()=>{throw Object.assign(Error('HTTP 404'),{status:404});}});await f.controller.tick();assert.equal(f.controller.canSubmit(session),true);f.options.request=async()=>{throw Object.assign(Error('instance_conflict'),{status:409,code:'instance_conflict'});};await f.controller.tick();assert.equal(f.controller.canSubmit(session),false);
});
test('definitive handoff failures show plain German while preserving diagnostic receipt codes',async t=>{
 for(const [code,message]of [['target_offline','Zielgerät nicht erreichbar.'],['target_locked','Datenschutz ist auf dem Zielgerät aktiv.'],['target_busy','Zielgerät ist beschäftigt.'],['expired','Bestätigung ist abgelaufen.'],['private_server_error','Übergabe konnte nicht bestätigt werden.'],['constructor','Übergabe konnte nicht bestätigt werden.']]){const f=fixture(t);await f.controller.requestTransfer('notebook');f.receipts[0].state='failed';f.receipts[0].error=code;await f.controller.tick();assert.equal(f.controller.snapshot().detail,message);assert.equal(f.receipts[0].error,code);}
});
