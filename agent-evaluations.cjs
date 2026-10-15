'use strict';
// Grading consumes measured tool/device observations. Assistant prose is ignored.
function gradeAgentRun(scenario,run={}){
 if(run.executed!==true)return {id:scenario.id,status:'untested',passed:false};
 const scoped=run.device===scenario.device&&typeof run.expectedSession==='string'&&run.expectedSession.length>0&&run.observedSession===run.expectedSession,outcome=run.outcome||{},reference=run.reference||{};
 const used=name=>Array.isArray(run.calls)&&run.calls.some(call=>call.device===scenario.device&&(call.name===name||call.name?.endsWith('__'+name)));
 const checks={camera:()=>used('show_camera')&&typeof reference.cameraEntity==='string'&&/^camera\.[a-z0-9_]+$/.test(reference.cameraEntity)&&outcome.cameraEntity===reference.cameraEntity&&outcome.verified===true&&outcome.playing===true,windows:()=>used('window_place')&&outcome.verified===true&&outcome.targetIdentityMatched===true&&outcome.rectMatched===true,browser:()=>used('browser')&&outcome.loaded===true&&outcome.visible===true&&outcome.urlMatched===true,handoff:()=>outcome.ownerDevice===scenario.device&&outcome.activeInputs===1&&outcome.historyLoaded===true&&outcome.orbExpanded===false,interruption:()=>outcome.oldAudioStopped===true&&outcome.previousTurnTerminal===true&&outcome.newTurnAccepted===true,recovery:()=>outcome.remoteObserved===true&&outcome.queueAvailable===true&&outcome.replayedActions===0,refusal:()=>outcome.refused===true&&outcome.mutations===0};
 const passed=scoped&&!!checks[scenario.kind]?.();return {id:scenario.id,status:passed?'passed':'failed',passed};
}
module.exports={gradeAgentRun};
