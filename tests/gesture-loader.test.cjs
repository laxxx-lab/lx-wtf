'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('large frames are resized before transfer and the loader retains the actual worker delegate',async()=>{
 let resize,closed=0;const posts=[];
 class Worker{postMessage(data,transfer){posts.push({data,transfer});queueMicrotask(()=>this.onmessage({data:data.type==='load'?{id:data.id,ready:true,delegate:'GPU'}:{id:data.id,result:{landmarks:[]}}}));}terminate(){}}
 const ctx=vm.createContext({Worker,URL,location:{href:'file:///repo/ui/index.html'},setTimeout,clearTimeout,window:{},createImageBitmap:async(_video,options)=>{resize=options;return {close(){closed++;}};}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/gesture-loader.js'),'utf8'),ctx);const d=await ctx.window.loadGestureDetector();assert.equal(d.delegate,'GPU');await d.detectForVideo({videoWidth:1920,videoHeight:1080},50);assert.equal(resize.resizeWidth,960);assert.equal(resize.resizeHeight,540);assert.equal(posts.at(-1).transfer.length,1);await d.detectForVideo({videoWidth:640,videoHeight:480},100);assert.equal(resize,undefined);d.close();await assert.rejects(d.detectForVideo({videoWidth:640,videoHeight:480},150),/beendet/);assert.equal(closed,1);
});
