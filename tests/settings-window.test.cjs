'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('settings resize uses one existing window and restores its exact bounds and stacking',()=>{
 const {createSettingsWindowView}=require('../settings-window.cjs');
 let bounds={x:-230,y:440,width:190,height:230},top=true,skip=true;const original={...bounds};
 const win={getBounds:()=>({...bounds}),setBounds:b=>{bounds=b;},isAlwaysOnTop:()=>top,setAlwaysOnTop:v=>{top=v;},setSkipTaskbar:v=>{skip=v;}};
 const screen={getDisplayMatching:()=>({workArea:{x:-1280,y:28,width:1280,height:692}})},changes=[];
 const view=createSettingsWindowView(win,screen,v=>changes.push(v));
 view.set(true);assert.deepEqual(bounds,{x:-1140,y:28,width:1000,height:692});assert.equal(top,false);assert.equal(skip,false);
 view.set(true);view.set(false);assert.deepEqual(bounds,original);assert.equal(top,true);assert.equal(skip,true);assert.deepEqual(changes,[true,false]);
});
test('settings remain bounded when the monitor disappears or the work area is small',()=>{
 const {createSettingsWindowView}=require('../settings-window.cjs');let area={x:0,y:0,width:1600,height:900},bounds={x:1400,y:650,width:190,height:230};
 const win={getBounds:()=>({...bounds}),setBounds:b=>{bounds=b;},setAlwaysOnTop(){},setSkipTaskbar(){},isAlwaysOnTop:()=>true,isSkipTaskbar:()=>true};
 const view=createSettingsWindowView(win,{getDisplayMatching:()=>({workArea:area})});view.set(true);area={x:0,y:0,width:320,height:480};view.reposition();assert.deepEqual(bounds,{x:0,y:0,width:320,height:480});view.set(false);assert.deepEqual(bounds,{x:130,y:250,width:190,height:230});
});
test('settings center uses integer coordinates on odd-sized work areas',()=>{
 const {createSettingsWindowView}=require('../settings-window.cjs');let result;
 const win={getBounds:()=>({x:0,y:0,width:190,height:230}),setBounds:b=>result=b,setAlwaysOnTop(){},setSkipTaskbar(){}};
 createSettingsWindowView(win,{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1921,height:1081}})}).set(true);
 assert.deepEqual(result,{x:461,y:151,width:1000,height:780});
});
