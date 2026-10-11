'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(failGPU=false){
 const options=[],messages=[];let closed=0;
 const context=vm.createContext({URL,importScripts(){},OffscreenCanvas:class{getContext(){return {fillRect(){}};}},Vision:{FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async(_files,value)=>{options.push(value);if(failGPU&&value.baseOptions.delegate==='GPU')throw Error('GPU unavailable');return {detectForVideo:()=>({landmarks:[]})};}}},self:{location:{href:'file:///repo/ui/gesture-worker.js'},postMessage:data=>messages.push(data)}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/gesture-worker.js'),'utf8'),context);
 return {options,messages,run:data=>context.self.onmessage({data}),image:{close(){closed++;}},get closed(){return closed;}};
}
test('the hand worker uses GPU acceleration and detects a second hand to reject ambiguity',async()=>{
 const f=fixture();await f.run({id:1,type:'load'});assert.equal(f.options[0].baseOptions.delegate,'GPU');assert.equal(f.options[0].numHands,2);assert.equal(f.messages[0].delegate,'GPU');await f.run({id:2,type:'detect',image:f.image,timestamp:50});assert.equal(f.closed,1);
});
test('unsupported GPU falls back to CPU and still closes every transferred image',async()=>{
 const f=fixture(true);await f.run({id:1,type:'load'});assert.deepEqual(f.options.map(o=>o.baseOptions.delegate),['GPU','CPU']);assert.equal(f.messages[0].delegate,'CPU');await f.run({id:2,type:'detect',image:f.image,timestamp:50});assert.equal(f.closed,1);
});
