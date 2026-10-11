const test=require('node:test'),assert=require('node:assert/strict');
let timing;try{timing=require('../voice-timing.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;timing={};}

test('voice timings correlate each stage without persisting content and summarize only valid durations',()=>{
  assert.equal(typeof timing.VoiceTiming,'function');
  const report=new timing.VoiceTiming({clock:()=>1000,limit:3});
  report.begin('voice-1',{kind:'voice',text:'private command',audio:'private audio'});
  report.mark('voice-1','capture-start',100);
  report.mark('voice-1','vad-end',300);
  report.mark('voice-1','capture-end',300);
  report.mark('voice-1','transcribe-start',320);
  report.mark('voice-1','transcribe-end',420);
  report.mark('voice-1','hermes-submit',450);
  report.mark('voice-1','hermes-first-delta',650);
  report.mark('voice-1','tts-first-pcm',850);
  report.mark('voice-1','renderer-first-pcm',860);
  report.mark('voice-1','playback-start',900);
  report.mark('voice-1','playback-end',1200);
  report.finish('voice-1','complete');
  const snapshot=report.snapshot();
  assert.equal(snapshot.rows[0].durations.transcribeMs,100);
  assert.equal(snapshot.rows[0].durations.hermesFirstTokenMs,200);
  assert.equal(snapshot.rows[0].durations.firstAudioMs,600);
  assert.equal(snapshot.rows[0].durations.playbackDelayMs,40);
  assert.deepEqual(snapshot.summary.firstAudioMs,{count:1,p50:600,p95:600});
  assert.doesNotMatch(JSON.stringify(snapshot),/private|command|audio"/);
  snapshot.rows[0].stages['capture-start']=999;
  assert.equal(report.snapshot().rows[0].stages['capture-start'],100);
});

test('bounded timing history rejects malformed stages and computes nearest rank percentiles',()=>{
  assert.equal(typeof timing.VoiceTiming,'function');
  const report=new timing.VoiceTiming({clock:()=>1000,limit:2,maxSkewMs:2000});
  for(const [id,end] of [['a',100],['b',200],['c',900]]){report.begin(id);report.mark(id,'transcribe-start',0);report.mark(id,'transcribe-end',end);}
  assert.equal(report.mark('c','prompt-secret',1000),false);
  assert.equal(report.mark('c','playback-start',NaN),false);
  assert.equal(report.mark('c','playback-start',100000),false);
  assert.equal(report.begin('bad\ncontent'),false);
  assert.deepEqual(report.snapshot().rows.map(row=>row.turnId),['b','c']);
  assert.deepEqual(report.snapshot().summary.transcribeMs,{count:2,p50:200,p95:900});
  report.mark('c','transcribe-start',950);
  assert.equal(report.snapshot().rows[1].stages['transcribe-start'],0,'Duplicate marks keep the original start');
});
test('local start acknowledgement has measured stages without shortening actual reply latency',()=>{
 const report=new timing.VoiceTiming({clock:()=>1000});report.begin('task');report.mark('task','vad-end',100);report.mark('task','capture-end',100);assert.equal(report.mark('task','ack-playback-start',150),true);report.mark('task','ack-playback-end',250);assert.equal(report.snapshot().summary.firstAudioMs,undefined);assert.equal(report.snapshot().rows[0].status,'pending');report.mark('task','playback-start',900);assert.equal(report.snapshot().summary.firstAudioMs.p50,800);
});
