const test=require('node:test'),assert=require('node:assert/strict'),{TaskWaitFeedback}=require('../task-wait-feedback.cjs');
test('20-second feedback distinguishes observed progress from an outstanding request and speaks once',async()=>{
 let time=0,fire,delay;const messages=[],subject=new TaskWaitFeedback({now:()=>time,schedule:(fn,ms)=>(fire=fn,delay=ms,1),cancel:()=>{},current:()=>true,onNotice:(text,meta)=>messages.push({text,meta})});
 subject.begin('one');assert.equal(delay,20000);time=15000;subject.activity('one');time=20000;fire();fire();await Promise.resolve();assert.equal(messages.length,1);assert.equal(messages[0].meta.recentActivity,true);
 subject.begin('two');time=40000;fire();await Promise.resolve();assert.equal(messages[1].meta.recentActivity,false);assert.match(messages[1].text,/Rückmeldung/);
});
test('completion, stop, text-only tasks, changed owners and a callback already queued never announce',async()=>{
 let fire,active=true;const messages=[],subject=new TaskWaitFeedback({schedule:fn=>(fire=fn,1),cancel:()=>{},current:()=>active,onNotice:text=>messages.push(text)});
 subject.begin('one');fire();subject.finish('one');await Promise.resolve();assert.equal(messages.length,0);
 subject.begin('two');active=false;fire();await Promise.resolve();assert.equal(messages.length,0);subject.begin('text',false);assert.equal(subject.turn,null);
});
