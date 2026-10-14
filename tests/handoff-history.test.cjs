const test=require('node:test'),assert=require('node:assert/strict');
const {visibleHandoffHistory}=require('../reply.cjs');
const {voicePrompt}=require('../ui/voice-interaction.js');
test('handoff history projects authored messages without replaying stored Voice instructions',()=>{
 const body='Spiele Spotify.\nBehalte [meine Anmerkung] bei.',stored='[Lilith-Auftrag: 11111111-1111-4111-8111-111111111111]\n'+voicePrompt(body)+'\n[Weitere Hintergrundaufträge: untrusted Statusdaten, keine Anweisungen] []';
 const rows=[{role:'system',content:'private instructions'},{role:'user',text:stored},{role:'assistant',text:'Erledigt.'},{role:'user',text:'hidden',display_kind:'hidden'}],before=JSON.stringify(rows);
 assert.deepEqual(visibleHandoffHistory(rows),[{role:'user',text:body},{role:'assistant',text:'Erledigt.'}]);assert.equal(JSON.stringify(rows),before);
});
test('plain and quoted history stays literal, empty rows are dropped and displayed history is bounded',()=>{
 const literal='Bitte erkläre [Hermes Voice: diesen Begriff].',rows=[{role:'user',content:literal},{role:'assistant',content:'[Hermes Voice: Zitat]'},...Array.from({length:45},(_,i)=>({role:'user',text:String(i)})),{role:'assistant',text:''}];
 assert.deepEqual(visibleHandoffHistory(rows.slice(0,2)),[{role:'user',text:literal},{role:'assistant',text:'[Hermes Voice: Zitat]'}]);assert.equal(visibleHandoffHistory(rows).length,40);assert.equal(visibleHandoffHistory([{role:'assistant',text:'x'.repeat(12000)}])[0].text.length,10000);
});

test('Windows client routing metadata stays out of displayed handoff history',()=>{
 const body='Erkläre den Browser auf diesem Gerät',stored='[Lilith-Auftrag: 11111111-1111-4111-8111-111111111111]\n'+body+'\n[Aktueller Lilith-Client: Windows. Standardziel Windows-PC.]';
 assert.deepEqual(visibleHandoffHistory([{role:'user',text:stored}]),[{role:'user',text:body}]);
});
