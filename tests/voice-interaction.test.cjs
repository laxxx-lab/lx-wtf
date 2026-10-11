const test=require('node:test'),assert=require('node:assert/strict');
const {isStandbyRequest,voicePrompt,compactVoiceRequest}=require('../ui/voice-interaction.js');
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
