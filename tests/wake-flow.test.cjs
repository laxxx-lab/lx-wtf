const {test}=require('node:test');const assert=require('node:assert/strict');
const {wakeDecision,speechThreshold}=require('../wake-flow.cjs');
test('a pure wake phrase acknowledges even when live is already active',()=>{
  assert.deepEqual(wakeDecision('Hey Lilith.',true),{kind:'greet',phrase:'Hey Lilith'});
  assert.deepEqual(wakeDecision('Hey Hermes, öffne Spotify.',true),{kind:'command',text:'öffne Spotify.'});
  assert.equal(wakeDecision('Hey Lilith.',false),null);assert.equal(wakeDecision('Ich rede mit Lilith.',true),null);
});
test('quiet real speech can reach neural VAD without the previous high initial threshold',()=>{
  assert.ok(.0045>speechThreshold(.001));assert.ok(.001<speechThreshold(.001));
});
