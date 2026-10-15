'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { showHomeCamera } = require('../home-display-workflow.cjs');
function setup(overrides={}) {
 let time=0, opens=0, selected=null;
 const home={open:async()=>{opens++;},inventory:async()=>({connected:true,entities:[{id:'camera.haustur_live',name:'Haustür Live'},{id:'camera.haustur_last_recording',name:'Haustür letzte Aufnahme'}]}),openCamera:async id=>{selected=id;},cameraState:async()=>({connected:true,cameraEntity:selected,playing:true}),hide:()=>{},...overrides};
 return {home,query:'haustur',allowed:()=>true,now:()=>time,sleep:async ms=>{time+=ms;},waitMs:1000,get opens(){return opens;}};
}
test('waits for HA readiness and verifies unique live camera playback',async()=>{
 let calls=0;const options=setup();const inventory=options.home.inventory;
 options.home.inventory=async()=>++calls<3?{connected:false}:inventory();
 const result=await showHomeCamera(options);
 assert.equal(result.status,'playing');assert.equal(result.verified,true);assert.equal(result.cameraEntity,'camera.haustur_live');assert.equal(options.opens,1);assert.ok(calls>=3);
});
test('ambiguous names never open a camera',async()=>{
 const options=setup({inventory:async()=>({connected:true,entities:[{id:'camera.garten_links',name:'Garten links'},{id:'camera.garten_rechts',name:'Garten rechts'}]}),openCamera:async()=>assert.fail('ambiguous selection')});
 assert.equal((await showHomeCamera({...options,query:'Garten'})).status,'ambiguous');
});
test('recordings never qualify, even explicitly requested',async()=>{
 const options=setup();assert.equal((await showHomeCamera({...options,cameraEntity:'camera.haustur_last_recording'})).status,'not-found');
});
test('requires playback from selected entity',async()=>{
 const options=setup({cameraState:async()=>({playing:true,cameraEntity:'camera.other'})});
 assert.equal((await showHomeCamera(options)).status,'playback-unconfirmed');
});
test('privacy or session cancellation stops the workflow',async()=>{
 let permitted=true,hidden=0;const options=setup({openCamera:async()=>{permitted=false;},hide:()=>hidden++});
 const result=await showHomeCamera({...options,allowed:()=>permitted});
 assert.equal(result.status,'cancelled');assert.equal(result.verified,false);assert.equal(hidden,1);
});
test('same home is busy while different homes remain independent',async()=>{
 let release;const options=setup({open:()=>new Promise(resolve=>{release=resolve;})});
 const pending=showHomeCamera(options);
 assert.equal((await showHomeCamera(options)).status,'busy');
 assert.equal((await showHomeCamera(setup())).status,'playing');release();assert.equal((await pending).status,'playing');
});
test('opening counts toward the total deadline',async()=>{
 const options=setup();options.home.open=async()=>options.sleep(1001);
 assert.equal((await showHomeCamera(options)).status,'unreachable');
});
test('generic failures never infer authentication',async()=>{
 const options=setup({open:async()=>{throw Error('private failure');}});
 const result=await showHomeCamera(options);assert.equal(result.status,'unreachable');assert.doesNotMatch(JSON.stringify(result),/private failure/);
});
test('explicit login observation is preserved',async()=>{
 const options=setup({inventory:async()=>({connected:false,loginRequired:true})});
 assert.equal((await showHomeCamera(options)).status,'login-required');
});
test('validates entity and guard before opening',async()=>{
 const options=setup();await assert.rejects(showHomeCamera({...options,cameraEntity:'camera.invalid/url'}),TypeError);assert.equal(options.opens,0);
});
test('hung opening is bounded by the total deadline',async()=>{
 const options=setup({open:()=>new Promise(()=>{})});
 const result=await showHomeCamera({...options,now:Date.now,waitMs:35});assert.equal(result.status,'unreachable');
});
test('cancellation interrupts a hung renderer call',async()=>{
 let permitted=true,hidden=0;const options=setup({cameraState:()=>new Promise(()=>{}),hide:()=>hidden++});
 const pending=showHomeCamera({...options,allowed:()=>permitted,now:Date.now});
 const timer=setTimeout(()=>{permitted=false;},10);
 try{assert.equal((await pending).status,'cancelled');assert.equal(hidden,1);}finally{clearTimeout(timer);}
});
test('guard is checked again before reporting observed playback',async()=>{
 let permitted=true;const options=setup({cameraState:async()=>{permitted=false;return {cameraEntity:'camera.haustur_live',playing:true};}});
 assert.equal((await showHomeCamera({...options,allowed:()=>permitted})).status,'cancelled');
});
test('deadline aborts the signal passed to native home methods',async()=>{
 let signal;const options=setup({open:async options=>{signal=options?.signal;await new Promise(()=>{});}});
 assert.equal((await showHomeCamera({...options,waitMs:30,now:Date.now})).status,'unreachable');assert.equal(signal?.aborted,true);
});
