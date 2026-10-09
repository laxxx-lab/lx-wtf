const {test}=require('node:test');const assert=require('node:assert/strict');
const {ReplyAccumulator}=require('../reply.cjs');
test('an interim report never hides a non-streamed final result',()=>{
  const reply=new ReplyAccumulator();reply.interim({text:'Ich schaue nach.',already_streamed:false});
  const final=reply.complete({text:'Es sind 42 GB frei.'});
  assert.equal(reply.text,'Ich schaue nach.\n\nEs sind 42 GB frei.');
  assert.equal(final.newText,'Es sind 42 GB frei.');
});
test('a streamed final and a reused reply are not spoken twice',()=>{
  const reply=new ReplyAccumulator();reply.delta('Ich prüfe das.');reply.interim({text:'Ich prüfe das.',already_streamed:true});
  reply.delta('Alles ist in Ordnung.');assert.equal(reply.complete({text:'Alles ist in Ordnung.'}).newText,'');
  assert.equal(reply.text,'Ich prüfe das.\n\nAlles ist in Ordnung.');
  const reused=new ReplyAccumulator();reused.interim({text:'Bereits erledigt.',already_streamed:false});
  assert.equal(reused.complete({text:'Bereits erledigt.',response_reused:true}).newText,'');
  assert.equal(reused.text,'Bereits erledigt.');
});
