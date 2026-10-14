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

test('ordinary German conversation streams without requiring a special greeting or explanation prefix',()=>{
  for(const text of ['Ich hatte einen anstrengenden Tag.','Mir geht es heute gut.','Ich bin ziemlich müde.','Was hältst du von einem Spaziergang nach einem anstrengenden Tag?','Erzähl mir etwas über Regenbögen.','Kannst du mir ausführlich erklären, wie ein Regenbogen entsteht?','Könntest du mir bitte erklären, wie Wolken entstehen?','Warum ist der Himmel blau?','Lass uns über Filme reden.','Hey Lilith, was denkst du über Jazz?']){
    assert.equal(voice.canStreamVoiceAnswer(text),true,text);
    assert.match(voice.voicePrompt(text),/vollständige natürliche Sätze sofort/,text);
  }
});

test('polite conversation openings do not stream actions, current observations or ambiguous follow-ups',()=>{
  for(const text of ['Kannst du mir erklären, was auf meinem Bildschirm steht?','Erzähl mir etwas und wechsle dann auf mein Headset.','Was hältst du davon, die Dateien zu löschen?','Lass uns die Soundbar verbinden.','Kannst du bitte den Timer stellen?','Ich bin müde, schalte den Computer aus.','Warum antwortet meine App nicht?','Erkläre mir die aktuelle Lage.','Kannst du mir erklären, wie ich Spotify abspielen kann?','Was meinst du dazu?','Ja, mach weiter.','Es hat geklappt.','Alles erledigt?','Ich bin müde, öffne Outlook.','Erzähl mir etwas und öffne danach Chrome.','Ich bin müde, ändere die Einstellung.','Ich bin müde, fahr den Rechner herunter.','Erzähl mir etwas und repariere danach den Code.','Ich bin müde, räume danach auf.','Erzähl mir etwas und wähle das Headset.']){
    assert.equal(voice.canStreamVoiceAnswer(text),false,text);
    assert.match(voice.voicePrompt(text),/Nur die abschließende Antwort ist zum Vorlesen bestimmt/,text);
  }
});

test('later task clauses reuse the existing acknowledgement vocabulary before any speech is released',()=>{
  for(const text of ['Erzähl mir etwas und lies anschließend die Zwischenablage vor.','Ich habe eine Frage: Übersetze den markierten Text.','Erzähl mir etwas und beende Outlook.','Ich hatte einen langen Tag. Plane meine Reise.','Ich bin müde, berechne meinen Verbrauch.'])assert.equal(voice.canStreamVoiceAnswer(text),false,text);
});

test('local conversation routes fresh dialogue but preserves Hermes memory, observations and work requests',()=>{
  assert.equal(typeof voice.isLocalConversationRequest,'function');
  for(const text of ['Hallo Lilith','Mir geht es heute gut.','Ich hatte einen anstrengenden Tag.','Erzähl mir etwas über Regenbögen.','Warum ist der Himmel blau?'])assert.equal(voice.isLocalConversationRequest(text),true,text);
  for(const text of ['Was ist der Name meines Sohnes?','Erzähl mir von unserem letzten Gespräch.','Was hältst du von der Änderung von vorhin?','Kannst du dich daran erinnern?','Öffne Spotify','Was steht auf meinem Bildschirm?','Hallo, öffne danach Outlook.','Was ist heute passiert?','Wie findest du das?','Ja, bitte weiter.',{},'a'.repeat(1300)])assert.equal(voice.isLocalConversationRequest(text),false,String(text));
});

test('only unambiguous short listening acknowledgements are backchannels, never task confirmations or questions',()=>{
  assert.equal(typeof voice.isBackchannel,'function');
  for(const text of ['Mhm.','Hm','Aha!','Ach so.','Verstehe.'])assert.equal(voice.isBackchannel(text),true,text);
  for(const text of ['Ja','Okay','Ja, mach das','Mhm, stopp bitte.','Aha?','Was?','Nein','Weiter',null])assert.equal(voice.isBackchannel(text),false,String(text));
});

test('a spoken presence check is local while mixed greeting commands stay with Hermes',()=>{assert.equal(voice.isLocalConversationRequest('Hallo Lilith, bist du da?'),true);assert.equal(voice.isLocalConversationRequest('Hallo Lilith, bist du da? Öffne Spotify.'),false);});

test('current clock and date questions are delegated instead of invented by the small local model',()=>{for(const text of ['Was ist die Uhrzeit?','Was ist das Datum?','Was ist heute für ein Tag?'])assert.equal(voice.isLocalConversationRequest(text),false,text);});
