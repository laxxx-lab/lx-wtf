'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {OrbRenderer}=require('../ui/orb.js');
function recorder(){
 const calls=[];
 const ctx=new Proxy({}, {get(_target,key){
  if(key==='createRadialGradient'||key==='createLinearGradient')return(...args)=>{const gradient={kind:key,args,stops:[],addColorStop(...stop){this.stops.push(stop);}};calls.push([key,...args]);return gradient;};
  return(...args)=>calls.push([key,...args]);
 },set(_target,key,value){calls.push(['set',key,typeof value==='object'?JSON.stringify(value):value]);return true;}});
 return {ctx,calls};
}
// Paint-command fingerprints captured from c77247d:ui/orb.js before extraction.
// Transforms are checked separately; no runtime Git dependency or pixel tolerance.
const original={idle:'d6730b9c4ae3fe257ab9b8c19b3355566fd68f1bc8b74aba5a1dfdaa18917ae1',listening:'0c51d663a976aa3380f313386b1945bb88f12ab7a5a1b0d9510659dbc3e68b23',speaking:'0c51d663a976aa3380f313386b1945bb88f12ab7a5a1b0d9510659dbc3e68b23',thinking:'bc7de7b3018a1fba6545019a861e33fdaabdc936335fdf22d1306d2cb3d4c9f7',working:'bc7de7b3018a1fba6545019a861e33fdaabdc936335fdf22d1306d2cb3d4c9f7',looking:'f11c1dfe3ad5acdf32d4c9aa71c9e71a34bdac4e7be666325ff0410b414a55bf',success:'e42b620e96850d8e6394c6c57af62a9a2bd3ec752faae5ae030894bf10dfe2aa',alert:'93f489bdec76856f7e1ca040a54f3804e6e1fc152f089ecb61d3080865b9c7b9',error:'93f489bdec76856f7e1ca040a54f3804e6e1fc152f089ecb61d3080865b9c7b9',offline:'d6730b9c4ae3fe257ab9b8c19b3355566fd68f1bc8b74aba5a1dfdaa18917ae1'};
test('Classic draws the actual original geometry, colors and transparent corona in every state',()=>{
 for(const [state,fingerprint]of Object.entries(original)){
  const {ctx,calls}=recorder(),orb=new OrbRenderer({width:400,height:400,clientWidth:400,getContext:()=>ctx},{reducedMotion:true});
  orb.rotation=1.25;orb.color=[77,156,210];orb.tilt={x:.3,y:-.2};orb.spread=1;orb.draw(0,{state});
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(calls.slice(5,-1))).digest('hex'),fingerprint,state+' retains the original paint commands');
  assert.deepEqual(calls[4],['scale',state==='idle'||state==='offline'?.62:.87,state==='idle'||state==='offline'?.62:.87]);
 }
});
test('Classic compact presentation does not add a dark veil or enlarge the original drawing',()=>{
 const {ctx,calls}=recorder(),orb=new OrbRenderer({width:400,height:400,clientWidth:190,getContext:()=>ctx},{reducedMotion:true});
 orb.draw(0,{state:'idle'});assert.deepEqual(calls[4],['scale',.62,.62]);
 assert.equal(calls.some(call=>call[0]==='set'&&String(call[2]).includes('rgba(4,10,17')),false);
});
