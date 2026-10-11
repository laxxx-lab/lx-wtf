'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectPoint}=require('../ui/osiris-view.js');
test('a selected location is centered and visible at every valid latitude',()=>{
 for(const [lat,lon]of [[7.5,-80.7],[-41.3,174.8],[-80,35],[89,170],[0,-179.9]]){
  const point=projectPoint(lat,lon,lon,195,lat);
  assert.equal(point.front,true,'selected location must be in front');
  assert.ok(Math.abs(point.x)<1e-8);assert.ok(Math.abs(point.y)<1e-8,'selected latitude must center vertically');
 }
});
test('selected location centering still places the opposite side behind the globe',()=>{
 const selected=projectPoint(35,70,70,195,35),opposite=projectPoint(-35,-110,70,195,35);
 assert.equal(selected.front,true);assert.equal(opposite.front,false);
 assert.equal(projectPoint(95,0),null);assert.equal(projectPoint(0,NaN),null);
});
