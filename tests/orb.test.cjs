const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeOrbColors,orbState,ORB_DEFAULTS,orbDynamics,OrbRenderer}=require('../ui/orb.js');
test('state colors preserve valid preferences, reject invalid CSS and fill newly added states',()=>{
  const colors=normalizeOrbColors({idle:'#abcdef',thinking:'url(secret)',alert:'red',unknown:'#123456'});
  assert.equal(colors.idle,'#abcdef');assert.equal(colors.thinking,ORB_DEFAULTS.thinking);assert.equal(colors.alert,ORB_DEFAULTS.alert);
  assert.equal(colors.unknown,undefined);assert.ok(colors.success&&colors.speaking&&colors.looking);
});

test('default state colors separate amber attention, red errors and violet camera observation',()=>{
  const hue=hex=>{const [r,g,b]=[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)),max=Math.max(r,g,b),delta=max-Math.min(r,g,b);return ((max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta)*60+360)%360;};
  assert.ok(hue(ORB_DEFAULTS.alert)>=35&&hue(ORB_DEFAULTS.alert)<=50,'Attention uses amber, clearly distinct from red errors');
  assert.ok(hue(ORB_DEFAULTS.error)<12||hue(ORB_DEFAULTS.error)>350,'Errors use red');
  assert.ok(hue(ORB_DEFAULTS.looking)>250&&hue(ORB_DEFAULTS.looking)<285,'Camera observation uses violet');
  assert.equal(normalizeOrbColors({listening:'#99ffe7'}).listening,'#99ffe7','The existing custom listening color survives');
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
test('a delegated thinker keeps the orb awake while foreground conversation stays ready',()=>{const background={jobs:[{status:'running',children:[{status:'running',phase:'thinking'}]}]};assert.equal(orbState({phase:'ready',background}),'thinking');assert.equal(orbState({phase:'ready',background,capturing:true}),'listening');assert.equal(orbState({phase:'ready',background,speaking:true}),'speaking');background.jobs[0].children[0].phase='working';assert.equal(orbState({phase:'ready',background}),'working');background.jobs[0].status='agent-finished';assert.equal(orbState({phase:'ready',background}),'idle');background.jobs[0].status='outcome-unknown';assert.equal(orbState({phase:'ready',background}),'alert');assert.equal(orbState({phase:'offline',background}),'offline');});

test('quiet speech expands the whole orb and inner rings without saturating louder syllables',()=>{
  const pause=orbDynamics('speaking',0),quiet=orbDynamics('speaking',.3),loud=orbDynamics('speaking',.8);
  assert.ok(pause.scale>orbDynamics('idle').scale,'A playback pause remains visibly awake');
  assert.ok(quiet.scale-pause.scale>=.06,'Quiet syllables must visibly expand the whole orb');
  assert.ok(quiet.spread-pause.spread>=.06,'Inner rings must also open with quiet syllables');
  assert.ok(loud.scale-quiet.scale>=.1);assert.ok(loud.spread>quiet.spread);
  for(const amplitude of [-1,0,.3,.8,1,5,NaN]){
    const voice=orbDynamics('speaking',amplitude);
    assert.ok(voice.scale<=1&&voice.spread<=1,'The full speech envelope fits the canvas');
    assert.ok(Number.isFinite(voice.scale)&&Number.isFinite(voice.spread));
  }
});

function drawingOrb(options){
  const gradients=[];let extent=0;
  const point=(x,y,r=0)=>{extent=Math.max(extent,Math.hypot(x,y)+r);};
  const ctx={clearRect(){extent=0;},save(){},restore(){},scale(){},translate(){},rotate(){},fillRect(){},beginPath(){},arc:point,stroke(){},moveTo:point,lineTo:point,fill(){},bezierCurveTo(){},closePath(){},clip(){},
    createRadialGradient(...args){gradients.push(args);return {addColorStop(){}};},createLinearGradient(){return {addColorStop(){}};}};
  const orb=new OrbRenderer({width:400,height:400,getContext:()=>ctx},options);
  let now=0;
  return {orb,get extent(){return extent;},draw(amplitude,frames=1,intensity=1){for(let i=0;i<frames;i++){gradients.length=0;orb.draw(now,{state:'speaking',amplitude,intensity});now+=16;}return gradients[1][5]/2.7;}};
}

test('real speech peaks expand quickly and pauses release without a clock-driven core pulse',()=>{
  const {orb,draw}=drawingOrb();
  const silentCore=draw(0,80),silentSize=orb.size,silentSpread=orb.spread;
  const peakCore=draw(1,5),peakSize=orb.size;
  assert.ok(peakSize-silentSize>.12,'A syllable must become visible within 80ms');
  assert.ok(orb.spread-silentSpread>.1);assert.ok(peakCore-silentCore>25);
  draw(0,8);assert.ok(peakSize-orb.size>.05,'A pause must release the syllable envelope');
  const settledCore=draw(0,100);assert.ok(Math.abs(draw(0,20)-settledCore)<.001,'Silence has no synthetic speech pulse');
});

test('reduced motion keeps speaking geometry still while the real playback level changes',()=>{
  const {orb,draw}=drawingOrb({reducedMotion:true});
  const core=draw(0,80),size=orb.size,spread=orb.spread;
  const loudCore=draw(1,80);
  assert.equal(orb.size,size);assert.equal(orb.spread,spread);assert.equal(loudCore,core);assert.equal(orb.rotation,0);
});

test('full speech peaks stay inside the 400px canvas during rotation and pointer tilt',()=>{
  const view=drawingOrb();
  for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    view.orb.setPointer(x,y);
    for(let i=0;i<80;i++){
      view.draw(1,1,2.4);
      assert.ok(view.orb.size<=1);assert.ok(view.extent<195,'Rings, particles, core and telemetry retain an edge margin');
    }
  }
});
test('a countdown uses only real pending time targets and keeps due timers visible without fake agent ETAs',()=>{const {orbCountdown}=require('../ui/orb.js'),now=Date.parse('2026-10-12T10:00:00Z');const v={items:[{id:'later',kind:'reminder',startedAt:now-60000,dueAt:now+120000},{id:'first',kind:'alarm',startedAt:now-60000,dueAt:now+65000}]};const c=orbCountdown(v,now);assert.equal(c.id,'first');assert.equal(c.text,'01:05');assert.equal(c.label,'TIMER');assert.ok(c.progress>0&&c.progress<1);assert.equal(orbCountdown(v,now+70000).text,'00:00');assert.equal(orbCountdown({items:[]},now),null);assert.equal(orbCountdown({hidden:true,...v},now),null);assert.equal(orbCountdown({items:[{id:'long',kind:'shutdown',startedAt:now,dueAt:now+7200000}]},now).text,'2:00:00');});
