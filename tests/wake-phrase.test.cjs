const {test}=require('node:test');
const assert=require('node:assert/strict');
const {matchWakePhrase,isWakeRequestCurrent}=require('../wake-phrase.cjs');
test('requested wake names retain the following command',()=>{
  assert.deepEqual(matchWakePhrase('Hey, Lilith! Öffne Spotify.',true),{phrase:'Hey Lilith',command:'Öffne Spotify.'});
  assert.deepEqual(matchWakePhrase('hey Lilis, bist du da?',true),{phrase:'Hey Lillis',command:'bist du da?'});
  assert.deepEqual(matchWakePhrase('Hey Lilies, bist du da?',true),{phrase:'Hey Lillis',command:'bist du da?'});
  assert.deepEqual(matchWakePhrase('Lelys, ich brauche dich.',true),{phrase:'Lillis',command:'ich brauche dich.'});
  assert.deepEqual(matchWakePhrase('Lilith.',true),{phrase:'Lilith',command:''});
  assert.deepEqual(matchWakePhrase('Lillis, prüfe den Status.',true),{phrase:'Lillis',command:'prüfe den Status.'});
  assert.deepEqual(matchWakePhrase('Hey Hermes',false),{phrase:'Hey Hermes',command:''});
});
test('name mentions and disabled bare names do not wake the assistant',()=>{
  assert.equal(matchWakePhrase('Ich rede später mit Lilith.',true),null);
  assert.equal(matchWakePhrase('Lilith',false),null);
  assert.equal(matchWakePhrase('Hey Helen, komm bitte.',true),null);
  assert.equal(matchWakePhrase('hey',true),null);
});

test('a delayed wake result is discarded after mute, restart or session change',()=>{
  const request={generation:4,sessionId:'a'};
  const current={generation:4,sessionId:'a',enabled:true,connected:true,busy:false,speaking:false};
  assert.equal(isWakeRequestCurrent(request,current),true);
  for(const changes of [{enabled:false},{generation:5},{sessionId:'b'},{connected:false},{busy:true},{speaking:true}])assert.equal(isWakeRequestCurrent(request,{...current,...changes}),false);
});
