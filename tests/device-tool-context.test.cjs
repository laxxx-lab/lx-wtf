'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{deviceToolContext}=require('../device-tool-context.cjs');
test('device context binds standard target and stable session to discoverable direct tools',()=>{
 const context=deviceToolContext('windows','test-pc',{id:'runtime',storedId:'stable'});
 assert.ok(context.startsWith('\n[Aktueller Lilith-Client: Windows.'));assert.match(context,/"device":"windows"/);assert.match(context,/"sessionId":"stable"/);
 assert.match(context,/show_camera/);assert.match(context,/expected_session/);assert.doesNotMatch(context,/EncodedCommand|ssh user|home-display -Operation/);
 assert.match(deviceToolContext('notebook','test-nb',{id:'same'}),/"device":"notebook"/);
});
