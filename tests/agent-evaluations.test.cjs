'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('agent evaluation requires scoped physical outcome instead of confident final wording',()=>{
 const {gradeAgentRun}=require('../agent-evaluations.cjs'),scenario={id:'camera-front',kind:'camera',device:'windows'};
 const run={executed:true,device:'windows',expectedSession:'selected',observedSession:'selected',reference:{cameraEntity:'camera.front'},answer:'Das Livebild läuft, Boss.',calls:[{name:'show_camera',device:'windows'}],outcome:{cameraEntity:'camera.front',playing:false,verified:false}};
 assert.equal(gradeAgentRun(scenario,run).passed,false);
 run.outcome={cameraEntity:'camera.front',playing:true,verified:true};assert.equal(gradeAgentRun(scenario,run).passed,true);
 run.outcome.cameraEntity='camera.garage';assert.equal(gradeAgentRun(scenario,run).passed,false);run.outcome.cameraEntity='camera.front';
 const calls=run.calls;run.calls=[];assert.equal(gradeAgentRun(scenario,run).passed,false);run.calls=calls;
 run.observedSession='other';assert.equal(gradeAgentRun(scenario,run).passed,false);
 assert.equal(gradeAgentRun(scenario,{executed:false}).status,'untested');
});
test('handoff waiting and unresolved mutations cannot be graded as completion',()=>{
 const {gradeAgentRun}=require('../agent-evaluations.cjs'),scoped={executed:true,device:'notebook',expectedSession:'same',observedSession:'same'};
 assert.equal(gradeAgentRun({kind:'handoff',device:'notebook'},{...scoped,outcome:{phase:'waiting'}}).passed,false);
 assert.equal(gradeAgentRun({kind:'handoff',device:'notebook'},{...scoped,outcome:{ownerDevice:'notebook',activeInputs:1,historyLoaded:true,orbExpanded:false}}).passed,true);
 assert.equal(gradeAgentRun({kind:'recovery',device:'notebook'},{...scoped,outcome:{remoteObserved:true,queueAvailable:true,replayedActions:1}}).passed,false);
 assert.equal(gradeAgentRun({kind:'windows',device:'notebook'},{...scoped,outcome:{verified:false,accepted:true}}).passed,false);
});
