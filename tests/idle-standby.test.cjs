'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeIdleStandbyMinutes,createIdleStandby}=require('../idle-standby.cjs');
test('idle timeout defaults to fifteen minutes and explicit zero disables it',()=>{
 assert.equal(normalizeIdleStandbyMinutes(),15);assert.equal(normalizeIdleStandbyMinutes(0),0);
 for(const bad of [-1,1.5,'15',Infinity,null,1441])assert.throws(()=>normalizeIdleStandbyMinutes(bad));
});
test('only an eligible quiet client reaches standby; interaction and work start a fresh interval',()=>{
 let at=0;const idle=createIdleStandby({now:()=>at});
 at=899999;assert.equal(idle.due(15),false);at=900000;assert.equal(idle.due(15),true);
 idle.activity();at+=900000;assert.equal(idle.due(0),false);assert.equal(idle.due(15,{busy:true}),false);
 at+=899999;assert.equal(idle.due(15),false);at++;assert.equal(idle.due(15,{eligible:false}),false);
 at+=900000;assert.equal(idle.due(15),true);idle.activity();assert.equal(idle.due(15),false);
});
