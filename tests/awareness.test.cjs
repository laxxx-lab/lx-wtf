'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const load=()=>{try{return require('../awareness.cjs');}catch(e){if(e.code==='MODULE_NOT_FOUND')return {};throw e;}};
test('fresh evidence creates actionable hints, recovery and privacy remove them, titles do not establish a project',()=>{
 const {Awareness}=load();assert.equal(typeof Awareness,'function');let now=100000;const a=new Awareness({now:()=>now});
 const context={enabled:true,project:'Lilith',foreground:{app:'Editor',windowTitle:'Other project'},events:[{type:'build-error',timestamp:now-1000,source:'build.log',summary:'Build failed token=SECRET'}]};
 a.update({context,graph:{ready:true,stale:true,rootName:'Voice'},jobs:{jobs:[{id:'j1',status:'outcome-unknown',title:'Musik'}]}});let s=a.snapshot();assert.equal(s.cards.length,3);assert.equal(s.project.confidence,'manual');assert.doesNotMatch(JSON.stringify(s),/SECRET/);assert.equal(a.action(s.cards.find(c=>c.kind==='build-error').id).kind,'investigate-build');
 context.events.unshift({type:'build-success',timestamp:now,source:'build.log',summary:'Build succeeded'});a.update({context,graph:{ready:true,stale:false},jobs:{jobs:[]}});assert.equal(a.snapshot().cards.length,0);
 a.update({context,privacyLocked:true});assert.equal(a.snapshot().cards.length,0);assert.equal(a.snapshot().foreground,null);
});
test('dismissals expire for a new observed event; old hints and invented action IDs are rejected',()=>{
 const {Awareness}=load();let now=1000000;const a=new Awareness({now:()=>now});const context={enabled:true,events:[{type:'build-error',timestamp:now,source:'build.log',summary:'Build failed'}]};a.update({context});const id=a.snapshot().cards[0].id;a.dismiss(id);a.update({context});assert.equal(a.snapshot().cards.length,0);assert.throws(()=>a.action('invented'));now+=1000;context.events[0].timestamp=now;a.update({context});assert.equal(a.snapshot().cards.length,1);now+=16*60*1000;a.update({context});assert.equal(a.snapshot().cards.length,0);
});
