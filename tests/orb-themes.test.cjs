'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../ui/orb.js');
test('theme selection defaults to Classic and accepts only installed drawing styles',()=>{
  assert.equal(typeof api.normalizeOrbTheme,'function');
  assert.equal(api.normalizeOrbTheme(), 'classic');
  for(const key of ['classic','voice-orb','ai-interface','particle-core','hud-core','venom'])assert.equal(api.normalizeOrbTheme(key),key);
  for(const value of ['unknown','__proto__','constructor','<script>',{},null])assert.equal(api.normalizeOrbTheme(value),'classic');
});
test('switching a drawing theme retains the active renderer clock and measured speech envelope',()=>{
  const orb=new api.OrbRenderer({getContext:()=>null});
  assert.equal(orb.theme,'classic');orb.rotation=7;orb.level=.6;orb.setTheme('particle-core');
  assert.equal(orb.theme,'particle-core');assert.equal(orb.rotation,7);assert.equal(orb.level,.6);
  orb.setTheme('missing');assert.equal(orb.theme,'classic');
});
