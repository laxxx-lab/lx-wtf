'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('activity display API retains authentication, client limits, privacy and typed camera identities',async t=>{
 const {createControlApi}=require('../control-api.cjs'),{createActivityCards}=require('../activity-cards.cjs'),store=createActivityCards(),calls=[],token='d'.repeat(64);let locked=false;
 const api=await createControlApi({port:0,token,enabledActions:['activity-cards','home-display'],readStatus:()=>({privacyLocked:locked}),onCommand:()=>{},readActivityCards:()=>store.read(),onActivityCard:value=>{try{return store.execute(value);}catch(error){throw Object.assign(error,{status:400});}},onHomeDisplay:value=>{calls.push(value);return {connected:false};}});t.after(()=>api.close());
 const url='http://127.0.0.1:'+api.address().port+'/v1/',headers={Authorization:'Bearer '+token},post=(action,value,h=headers)=>fetch(url+action,{method:'POST',headers:h,body:JSON.stringify(value)}),input={action:'upsert',id:'washer',kind:'countdown',title:'Waschmaschine',source:'Home Assistant',observedAt:new Date().toISOString(),deadline:new Date(Date.now()+300000).toISOString(),status:'running'};
 assert.equal((await post('activity-cards',input,{})).status,401);assert.equal((await post('activity-cards',input,{...headers,Origin:'https://example.com'})).status,403);
 assert.equal((await post('activity-cards',input)).status,200);assert.equal((await (await fetch(url+'activity-cards',{headers})).json()).cards.length,1);
 for(const value of [{...input,mediaUrl:'https://example.com/private'},{...input,deadline:'unknown'},{...input,detail:'x'.repeat(5000)}])assert.ok([400,413].includes((await post('activity-cards',value)).status));
 for(const value of [{action:'open',url:'https://example.com'},{action:'camera',cameraEntity:'switch.oven'},{action:'eval',script:'secret'}])assert.equal((await post('home-display',value)).status,400);
 assert.equal((await post('home-display',{action:'camera',cameraEntity:'camera.front_door'})).status,200);assert.deepEqual(calls,[{action:'camera',cameraEntity:'camera.front_door'}]);
 locked=true;assert.equal((await fetch(url+'activity-cards',{headers})).status,423);assert.equal((await post('home-display',{action:'open'})).status,423);assert.equal((await post('activity-cards',{action:'dismiss',id:'washer'})).status,423);assert.equal(store.read().cards.length,1);assert.equal(calls.length,1);
});
