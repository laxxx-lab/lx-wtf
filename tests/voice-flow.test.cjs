const test=require('node:test'),assert=require('node:assert/strict');
const {SentenceBuffer}=require('../conversation.cjs');
const voice=require('../ui/voice-interaction.js');

test('short completed speech segments do not block later natural sentences',()=>{
  const buffer=new SentenceBuffer();
  assert.deepEqual(buffer.push('Ja. Gut! Wie geht es dir? Noch'),['Ja.','Gut!','Wie geht es dir?']);
  assert.equal(buffer.flush(),'Noch');assert.equal(buffer.flush(),'');
});

test('German abbreviations and numeric fragments never become isolated spoken sentences',()=>{
  const buffer=new SentenceBuffer();
  assert.deepEqual(buffer.push('Frag Dr. '),[]);
  assert.deepEqual(buffer.push('Meyer z. B. nach Nr. 3. '),[]);
  assert.deepEqual(buffer.push('Es geht um 3.14 Euro. Ja!'),['Frag Dr. Meyer z. B. nach Nr. 3. Es geht um 3.14 Euro.','Ja!']);
  const fragmented=new SentenceBuffer();
  assert.deepEqual(fragmented.push('Zum Beispiel z.'),[]);
  assert.deepEqual(fragmented.push(' B. eine Zahl: 3.'),[]);
  assert.deepEqual(fragmented.push('14. Fertig.'),['Zum Beispiel z. B. eine Zahl: 3.14. Fertig.']);
});

test('only clear conversational voice requests can start speaking before verified completion',()=>{
  assert.equal(typeof voice.canStreamVoiceAnswer,'function');
  for(const text of ['Hallo Lilith!','Wie geht es dir?','Erkläre mir, wie ein Regenbogen entsteht.','Was bedeutet Photosynthese?'])assert.equal(voice.canStreamVoiceAnswer(text),true,text);
  for(const text of ['Öffne Spotify.','Erkläre kurz und starte Spotify.','Was läuft gerade auf Spotify?','Prüfe meinen PC.','Erkläre mir den Zustand meines PCs.','Erledigt, Boss.','Danke, lösche danach die Datei.','Hallo Lilith, mach das Fenster auf.','Erkläre kurz und setze danach die Einstellung.'])assert.equal(voice.canStreamVoiceAnswer(text),false,text);
});

test('speech prompt permits natural sentence streaming only for an eligible conversation',()=>{
  const conversation=voice.voicePrompt('Erkläre mir, wie Regenbögen entstehen.');
  assert.match(conversation,/vollständige natürliche Sätze sofort/);
  assert.match(conversation,/Aktionsbestätigungen erst.*geprüften Abschlussantwort/);
  const action=voice.voicePrompt('Öffne Spotify.');assert.match(action,/Nur die abschließende Antwort ist zum Vorlesen bestimmt/);
  assert.doesNotMatch(action,/natürliche Sätze sofort/);
});
