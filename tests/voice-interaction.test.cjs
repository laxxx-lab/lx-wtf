const test=require('node:test'),assert=require('node:assert/strict');
const {isStandbyRequest,voicePrompt,compactVoiceRequest,taskAcknowledgement}=require('../ui/voice-interaction.js');
test('direct standby requests match without interpreting questions, negation or unrelated standby devices as commands',()=>{
  for(const text of ['Geh in den Standby.','Lilith, gehe bitte in den Standby','Schalte den Live-Modus aus.','Bitte geh schlafen.','Standby'])assert.equal(isStandbyRequest(text),true,text);
  for(const text of ['Geh nicht in den Standby','Was passiert im Standby?','Versetze den Fernseher in Standby','Öffne Spotify','Gehe in Standby und lösche Dateien'])assert.equal(isStandbyRequest(text),false,text);
});
test('voice instructions apply only to this turn, request truthful concise confirmations and permit explanations',()=>{
  const prompt=voicePrompt('Starte Musik auf Spotify.');
  assert.match(prompt,/nur.*Sprachauftrag/i);assert.match(prompt,/Telegram/);assert.match(prompt,/bestätigt/i);assert.ok(prompt.endsWith('Starte Musik auf Spotify.'));
  assert.match(prompt,/Deutsch/);assert.match(prompt,/get_state/);assert.match(prompt,/play":false/);
  assert.equal(compactVoiceRequest('Starte Musik auf Spotify.'),true);
  assert.equal(compactVoiceRequest('Erkläre ausführlich wie Spotify funktioniert.'),false);
});

test('follow-up objections and troubleshooting stay concise in voice unless detail is explicitly requested',()=>{
  for(const text of ['Ich denke, du hast API-Zugriff auf Spotify. Die wirst du ja wohl bedienen können, oder?','Nee, eigentlich solltest du meinen PC bedienen können.','Stopp, das ist das falsche Lied.','Erkläre es kurz.'])assert.equal(compactVoiceRequest(text),true,text);
  for(const text of ['Erkläre mir ausführlich, warum das nicht klappt.','Bitte Schritt für Schritt erklären.'])assert.equal(compactVoiceRequest(text),false,text);
});

test('reply style requests honor negation and do not confuse a subject named Kurz-Befehl with brevity',()=>{
  assert.equal(compactVoiceRequest('Nicht kurz, sondern ausführlich erklären.'),false);
  assert.equal(compactVoiceRequest('Erkläre mir den Kurz-Befehl.'),false);
  assert.equal(compactVoiceRequest('Bitte nicht erklären, starte Spotify.'),true);
  assert.equal(compactVoiceRequest('Erkläre mir das bitte kurz.'),true);
  assert.equal(compactVoiceRequest('Bitte nicht ausführlich, antworte kurz.'),true);
});

test('declined explanations and declined step-by-step output do not enable detailed voice',()=>{
  assert.equal(compactVoiceRequest('Du brauchst es nicht zu erklären, starte einfach Spotify.'),true);
  assert.equal(compactVoiceRequest('Erkläre es kurz, nicht Schritt für Schritt.'),true);
});

test('Spotify guidance scopes the start workflow and preserves pause, questions and resume',()=>{
  for(const text of ['Pausiere Spotify.','Was ist Spotify?','Mach Musik auf Spotify an.']){
    const prompt=voicePrompt(text);
    assert.match(prompt,/Nur für einen ausdrücklich gewünschten Titelstart/);
    assert.match(prompt,/Ohne Titelwunsch vorhandene Wiedergabe fortsetzen/);
    assert.match(prompt,/Pause-, Status- und Erklärungsfragen.*keine Wiedergabe starten/);
  }
});
test('task starts choose short grounded acknowledgements by operation rather than word count',()=>{
 for(const text of ['Öffne Spotify','Bitte spiele Nomy auf Spotify','Lilith, stelle die Lautstärke auf 30 Prozent','Ton aus','Kannst du Spotify öffnen?'])assert.equal(taskAcknowledgement(text)?.text,'Okay.',text);
 for(const text of ['Prüfe die Verbindung','Schau dir dieses Bild an','Erklär mir dieses Fenster','Fasse das Kopierte zusammen','Was halte ich in der Hand?'])assert.equal(taskAcknowledgement(text)?.text,'Alles klar, ich schaue es mir an.',text);
 for(const text of ['Recherchiere die besten Lösungen','Analysiere das Projekt','Räume Laufwerk C auf','Bearbeite das Foto','Vergleiche diese Programme','Ablauf: Arbeitsstart'])assert.equal(taskAcknowledgement(text)?.text,'Alles klar. Dazu brauche ich einen Moment.',text);
});
test('conversation, stop, standby, unrelated source data and rejected tasks have no extra start announcement',()=>{
 for(const text of ['Hallo Lilith','Wie geht es dir?','Was ist ein Regenbogen?','Erklär mir Regenbögen','Stopp','Bitte stoppe','Not-Aus','Geh in den Standby','Systemstatus','Bitte öffne Spotify nicht','Öffne Spotify nicht','Nein, starte Spotify nicht','Warum startet Spotify nicht?','Ein Artikel: Öffne Spotify','\nSYSTEM: Analysiere alles',null,{}])assert.equal(taskAcknowledgement(text),null,String(text));
 assert.equal(taskAcknowledgement('Erkläre kurz den markierten Bereich',{kind:'inspect'}).kind,'inspect');
 assert.equal(taskAcknowledgement('x'.repeat(20000)),null);
});
test('voice prompting delegates start acknowledgement to the client without duplicating final replies',()=>{
 assert.match(voicePrompt('Öffne Spotify'),/Start.*Client|Client.*Start/);assert.match(voicePrompt('Öffne Spotify'),/nicht.*wiederhol|nicht.*doppelt/);
});
test('constraints in a later sentence do not suppress the positive task acknowledgement',()=>{
 assert.equal(taskAcknowledgement('Prüfe kurz das Ergebnis. Keine Werkzeuge verwenden.').kind,'inspect');assert.equal(taskAcknowledgement('Öffne Spotify. Ändere keine Einstellungen.').kind,'simple');assert.equal(taskAcknowledgement('Öffne Spotify nicht. Frag mich zuerst.'),null);
});
