'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {layoutGraph,projectNode}=require('../ui/project-graph.js');
const sample={nodes:Array.from({length:48},(_,i)=>({id:'n'+i,label:'n'+i,community:i%6})),links:Array.from({length:47},(_,i)=>({source:'n'+i,target:'n'+(i+1),relation:'calls'}))};
test('project nodes form a balanced three-dimensional sphere instead of flat community fans',()=>{
 const graph=layoutGraph(sample);
 for(const node of graph.nodes){assert.ok(Number.isFinite(node.z),'nodes require depth');assert.ok(Math.abs(Math.hypot(node.sphereX,node.sphereY,node.sphereZ)-1)<1e-8,'node lies on sphere');}
 assert.ok(graph.nodes.some(node=>node.sphereZ>.6));assert.ok(graph.nodes.some(node=>node.sphereZ<-.6));
 assert.ok(Math.abs(graph.nodes.reduce((sum,node)=>sum+node.sphereY,0)/graph.nodes.length)<.05);
});
test('search highlighting keeps each node at its existing place in the orb',()=>{
 const initial=new Map(layoutGraph(sample).nodes.map(n=>[n.id,n]));
 const found=layoutGraph({...sample,selectedIds:['n20']});
 assert.equal(found.nodes.find(n=>n.id==='n20').selected,true);
 for(const node of found.nodes)for(const key of ['sphereX','sphereY','sphereZ']){assert.ok(Number.isFinite(node[key]));assert.equal(node[key],initial.get(node.id)[key]);}
 const reversed=layoutGraph({...sample,nodes:[...sample.nodes].reverse()});
 for(const node of reversed.nodes)assert.equal(node.sphereX,initial.get(node.id).sphereX);
});
test('orb projection provides perspective and visibly changes when rotated',()=>{
 assert.equal(typeof projectNode,'function');
 const front=projectNode({sphereX:0,sphereY:0,sphereZ:1},0,0),back=projectNode({sphereX:0,sphereY:0,sphereZ:-1},0,0);
 assert.ok(front.depth>back.depth);assert.ok(front.scale>back.scale);
 const a=projectNode({sphereX:1,sphereY:0,sphereZ:0},0,0),b=projectNode({sphereX:1,sphereY:0,sphereZ:0},Math.PI/2,0);
 assert.ok(Math.abs(a.x-b.x)>100);
 for(const p of [front,back,a,b])for(const key of ['x','y','depth','scale'])assert.ok(Number.isFinite(p[key]));
});
test('dense orb views bound rendering while retaining only actual graph relations',()=>{
 const nodes=Array.from({length:150},(_,i)=>({id:'n'+i,label:'file'+i+'.cjs',sourceFile:'file'+i+'.cjs'})),links=[];
 for(let i=0;i<150;i++)for(let j=i+1;j<150;j++)links.push({source:'n'+i,target:'n'+j,relation:'calls'});
 const result=layoutGraph({nodes,links,selectedIds:['n149']}),ids=new Set(result.nodes.map(n=>n.id));
 assert.ok(result.nodes.length<=120);assert.ok(result.nodes.some(n=>n.id==='n149'&&n.selected));assert.ok(result.links.length<=240);
 for(const edge of result.links){assert.ok(ids.has(edge.source)&&ids.has(edge.target));assert.ok(links.some(original=>original.source===edge.source&&original.target===edge.target));}
});

test('activity remains visible and uses its own state alongside unrelated search selections',()=>{
 const graph=layoutGraph({...sample,selectedIds:['n20'],activityIds:['n40']});
 assert.equal(graph.nodes.find(n=>n.id==='n20').selected,true);assert.equal(graph.nodes.find(n=>n.id==='n20').active,false);
 assert.equal(graph.nodes.find(n=>n.id==='n40')?.active,true);assert.equal(graph.nodes.find(n=>n.id==='n40').selected,false);
});

test('visible graph gestures rotate and zoom locally and cancel when stale hidden or out of order',()=>{
 const {applyGraphGesture}=require('../ui/project-graph.js');assert.equal(typeof applyGraphGesture,'function');
 const event=(sequence,x,y,pinching=true)=>({kind:'pointer',x,y,pinching,generation:1,sequence,at:1000});
 let state={yaw:0,zoom:1};state=applyGraphGesture(state,event(1,.4,.5),{now:1000,visible:true}).state;
 state=applyGraphGesture(state,event(2,.5,.4),{now:1000,visible:true}).state;assert.ok(state.yaw>0);assert.ok(state.zoom>1&&state.zoom<=4);
 const duplicate=applyGraphGesture(state,event(2,.7,.2),{now:1000,visible:true});assert.equal(duplicate.accepted,false);assert.equal(duplicate.state.yaw,state.yaw);
 const hidden=applyGraphGesture(state,event(3,.6,.3),{now:1000,visible:false});assert.equal(hidden.accepted,false);assert.equal(hidden.state.drag,null);
 const stale=applyGraphGesture(state,{...event(3,.6,.3),at:1000},{now:1600,visible:true});assert.equal(stale.accepted,false);assert.equal(stale.state.drag,null);
 const cancelled=applyGraphGesture(state,{kind:'cancel',generation:1,sequence:3,at:1000},{now:1000,visible:true});assert.equal(cancelled.state.drag,null);assert.equal(cancelled.state.pointer,null);
 const invalid=applyGraphGesture(state,event(3,NaN,.3),{now:1000,visible:true});assert.equal(invalid.accepted,false);assert.equal(invalid.state.drag,null);
});
