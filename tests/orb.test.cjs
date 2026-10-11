const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeOrbColors,orbState,ORB_DEFAULTS,orbDynamics}=require('../ui/orb.js');
test('state colors preserve valid preferences, reject invalid CSS and fill newly added states',()=>{
  const colors=normalizeOrbColors({idle:'#abcdef',thinking:'url(secret)',alert:'red',unknown:'#123456'});
  assert.equal(colors.idle,'#abcdef');assert.equal(colors.thinking,ORB_DEFAULTS.thinking);assert.equal(colors.alert,ORB_DEFAULTS.alert);
  assert.equal(colors.unknown,undefined);assert.ok(colors.success&&colors.speaking&&colors.looking);
});

test('standby contracts all layers and moves slower; actual voice amplitude expands the active orb',()=>{
  const idle=orbDynamics('idle',0),active=orbDynamics('listening',0),voice=orbDynamics('speaking',.8);
  assert.ok(idle.scale<active.scale*.8);assert.ok(idle.speed<active.speed);
  assert.ok(idle.speed>=.6,'The small orb must retain clearly visible normal motion');
  assert.ok(orbDynamics('offline').speed>=.4,'The offline orb also stays visibly animated');
  assert.ok(voice.scale>orbDynamics('speaking',0).scale);assert.ok(voice.spread>idle.spread);
  assert.ok(orbDynamics('speaking',1).scale<=1);
});
test('actual audio and capture state override ordinary ready status, alerts remain visible',()=>{
  assert.equal(orbState({phase:'ready',speaking:true}),'speaking');
  assert.equal(orbState({phase:'ready',capturing:true}),'listening');
  assert.equal(orbState({phase:'approval',speaking:true}),'alert');
  assert.equal(orbState({phase:'error',speaking:true}),'error');
  assert.equal(orbState({phase:'offline',capturing:true}),'offline');
  assert.equal(orbState({phase:'working',looking:true}),'looking');
});
test('completion and alert pulses expire and processing states reflect actual runtime phases',()=>{
  assert.equal(orbState({phase:'ready',now:1000,successUntil:2000}),'success');
  assert.equal(orbState({phase:'ready',now:2001,successUntil:2000}),'idle');
  assert.equal(orbState({phase:'thinking',now:1000,alertUntil:2000}),'alert');
  for(const phase of ['thinking','working','looking'])assert.equal(orbState({phase}),phase);
  assert.equal(orbState({phase:'transcribing'}),'thinking');
});
