'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BackgroundJobs,backgroundIntent,splitBackgroundRequests}=require('../background-jobs.cjs');
const owner={sessionId:'stored',runtimeId:'runtime',profile:'default'},job=id=>({id,title:'Analysiere '+id,text:'Analysiere '+id,sessionId:'stored',profile:'default'});
test('long work is delegated while conversation and simple actions stay direct',()=>{
 assert.equal(backgroundIntent('Wie geht es dir?'),null);assert.equal(backgroundIntent('Öffne Spotify'),null);assert.equal(backgroundIntent('Erklär mir, was Bluetooth ist.'),null);
 assert.equal(backgroundIntent('Analysiere die Fotos').resource,'desktop');assert.equal(backgroundIntent('Recherchiere Reiseziele im Web').resource,'research');assert.equal(backgroundIntent('Repariere den Fehler im Projekt').resource,'desktop');
 assert.deepEqual(splitBackgroundRequests('Verbessere das Foto und recherchiere nebenbei eine Reise.'),['Verbessere das Foto','recherchiere eine Reise.']);assert.deepEqual(splitBackgroundRequests('Analysiere den Fehler und repariere ihn.'),['Analysiere den Fehler und repariere ihn.']);
});
test('two workers free the conversation lane but retain desktop ownership until their terminal event',()=>{
 const b=new BackgroundJobs();b.prepare(job('one'),owner,{resource:'desktop'});b.attach('one',{mode:'background',status:'dispatched',delegation_id:'d-one',subagent_ids:['sa-one']});
 assert.equal(b.canStart(owner,{resource:'research'}),true);assert.equal(b.canStart(owner,{resource:'desktop'}),false);b.prepare(job('two'),owner,{resource:'research'});b.attach('two',{mode:'background',status:'dispatched',delegation_id:'d-two',subagent_ids:['sa-two']});assert.equal(b.canStart(owner,{resource:'research'}),false);
 assert.equal(b.receive({type:'subagent.complete',session_id:'other',data:{subagent_id:'sa-one',status:'completed',summary:'wrong'}}),null);
 const done=b.receive({type:'subagent.complete',session_id:'runtime',data:{subagent_id:'sa-one',delegation_id:'d-one',status:'completed',summary:'Ergebnis eins'}});assert.equal(done.jobId,'one');assert.equal(done.status,'agent-finished');assert.equal(b.canStart(owner,{resource:'desktop'}),true);assert.equal(b.snapshot(owner).jobs.find(j=>j.id==='two').status,'running');
});
test('a targeted stop keeps its resource occupied until a matching terminal event',async()=>{
 const b=new BackgroundJobs();b.prepare(job('one'),owner,{resource:'desktop'});b.attach('one',{mode:'background',status:'dispatched',delegation_id:'d-one',subagent_ids:['sa-one']});const calls=[];
 await b.stop('one',owner,async(method,p)=>{calls.push({method,p});return {found:true};});assert.equal(calls.length,1);assert.equal(calls[0].method,'subagent.interrupt');assert.equal(calls[0].p.subagent_id,'sa-one');assert.equal(b.canStart(owner,{resource:'desktop'}),false);
 b.receive({type:'subagent.complete',session_id:'runtime',data:{subagent_id:'sa-one',status:'interrupted',summary:'Stopped'}});assert.equal(b.snapshot(owner).jobs[0].status,'cancelled');assert.equal(b.canStart(owner,{resource:'desktop'}),true);
});
test('sync fallback never claims background execution and an unconfirmed stop retains the resource',async()=>{
 const b=new BackgroundJobs();b.prepare(job('one'),owner,{resource:'desktop'});assert.equal(b.attach('one',{status:'completed',mode:'sync',subagent_ids:['x']}),false);assert.equal(b.isDelegated('one'),false);b.abandon('one');assert.equal(b.canStart(owner,{resource:'desktop'}),true);
 b.prepare(job('two'),owner,{resource:'desktop'});b.attach('two',{mode:'background',status:'dispatched',delegation_id:'d-two',subagent_ids:['sa-two']});await b.stop('two',owner,async()=>({found:false}));assert.equal(b.snapshot(owner).jobs.find(j=>j.id==='two').status,'outcome-unknown');assert.equal(b.canStart(owner,{resource:'desktop'}),false);
});
test('desktop ownership also prevents conflicts after switching the displayed session',()=>{
 const b=new BackgroundJobs();b.prepare(job('one'),owner,{resource:'desktop'});assert.equal(b.canStart({sessionId:'another',runtimeId:'r2',profile:'default'},{resource:'desktop'}),false);assert.equal(b.resourceBusy('desktop'),true);
});
test('an early completion is retained until its confirmed handle arrives and a stale call cannot attach to another job',()=>{
 const b=new BackgroundJobs();b.prepare(job('one'),owner,{resource:'desktop'});b.bindCall('one','call-one');b.receive({type:'subagent.complete',session_id:'runtime',data:{subagent_id:'sa-one',delegation_id:'d-one',status:'completed',summary:'early'}});assert.equal(b.callOwner('runtime','call-one'),'one');b.attach('one',{mode:'background',status:'dispatched',delegation_id:'d-one',subagent_ids:['sa-one']});assert.equal(b.snapshot(owner).jobs[0].status,'agent-finished');assert.equal(b.callOwner('runtime','call-one'),null);
});
test('a pending stop survives a late dispatch and fresh empty roster releases only the agent reservation without claiming success',()=>{
 const b=new BackgroundJobs();b.prepare(job('one'),owner,{resource:'desktop'});b.pendingStop('one');assert.equal(b.attach('one',{mode:'background',status:'dispatched',delegation_id:'d-one',subagent_ids:['sa-one']}),true);assert.equal(b.snapshot(owner).jobs[0].status,'stopping');const result=b.reconcile('one',owner,[]);assert.equal(result.status,'error');assert.match(result.summary,/unbestätigt/);assert.equal(b.canStart(owner,{resource:'desktop'}),true);
});
test('background thinking and tool activity update the visual phase without storing reasoning text',()=>{const b=new BackgroundJobs();b.prepare(job('visual'),owner,{resource:'desktop'});b.attach('visual',{mode:'background',status:'dispatched',delegation_id:'d-visual',subagent_ids:['sa-visual']});b.receive({type:'subagent.thinking',session_id:'runtime',data:{subagent_id:'sa-visual',text:'PRIVATE REASONING'}});assert.equal(b.snapshot(owner).jobs[0].children[0].phase,'thinking');assert.equal(JSON.stringify(b.snapshot(owner)).includes('PRIVATE REASONING'),false);b.receive({type:'subagent.tool',session_id:'runtime',data:{subagent_id:'sa-visual',tool_name:'terminal',tool_count:1}});assert.equal(b.snapshot(owner).jobs[0].children[0].phase,'working');b.receive({type:'subagent.thinking',session_id:'wrong',data:{subagent_id:'sa-visual'}});assert.equal(b.snapshot(owner).jobs[0].children[0].phase,'working');});
