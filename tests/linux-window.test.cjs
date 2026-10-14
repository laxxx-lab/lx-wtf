'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {linuxWindowBounds}=require('../linux-window.cjs');
test('The orb and conversation stay inside a monitor with a negative origin or small work area',()=>{
  const area={x:-1280,y:28,width:1280,height:692};
  assert.deepEqual(linuxWindowBounds(area,false),{x:-202,y:478,width:190,height:230});
  const expanded=linuxWindowBounds(area,true,{x:-202,y:478});
  assert.deepEqual(expanded,{x:-520,y:28,width:520,height:692});
  const small={x:0,y:0,width:320,height:480},panel=linuxWindowBounds(small,true,{x:1000,y:1000});
  assert.deepEqual(panel,{x:0,y:0,width:320,height:480});
  assert.deepEqual(linuxWindowBounds(area,false,{x:-4000,y:2000}),{x:-1280,y:490,width:190,height:230});
});
