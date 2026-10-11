'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {thinkingForTask}=require('../automatic-thinking.cjs');
test('everyday voice tasks and short follow-ups use no thinking',()=>{
 for(const text of ['Hallo Lilith','Wie geht es dir?','Öffne Spotify und spiele Nomy Cocaine.','Suche ein Lied von Cole Porter auf Spotify und spiele es ab.','Wechsle von Kopfhörer auf Boxen.','Zeig mir meine Browsertabs.','Gehe in den Standby.','Ja, das passt.','Erklär mir kurz, was Bluetooth ist.'])assert.equal(thinkingForTask(text).effort,'none',text);
});
test('complex work and dangerous changes outrank superficially simple actions',()=>{
 for(const text of ['Öffne den Code und repariere den Fehler im Login.','Warum bricht die Verbindung immer wieder ab?','Analysiere diese Fotos und vergleiche die Unterschiede.','Plane die Architektur meiner Anwendung.','Räume Laufwerk C: auf und lösche unnötige Dateien.','Ich brauche einen Budgetvergleich für zwei Reisen.','Überarbeite den Entwurf.','Erstelle eine Anwendung.','Verbessere diese Fotos.'])assert.equal(thinkingForTask(text).effort,'medium',text);
 assert.equal(thinkingForTask('Denke gründlich nach und prüfe alle Möglichkeiten.').effort,'high');
 assert.equal(thinkingForTask('Bitte ohne Thinking: Öffne Spotify.').effort,'none');
 assert.equal(thinkingForTask('Weiter',{previousEffort:'medium'}).effort,'medium');
 assert.equal(thinkingForTask('Hallo Lilith',{previousEffort:'high'}).effort,'none');
});
test('routing reads the user question before generated observations and safely handles long unknown requests',()=>{
 assert.equal(thinkingForTask('[Markierter Bereich] Erklär diese Fehlermeldung.\nBildschirmbeobachtung: Öffne Spotify').effort,'medium');
 assert.equal(thinkingForTask('a '.repeat(400)).effort,'medium');
 assert.equal(thinkingForTask('Öffne Spotify.\n[Kontext] Analysiere Code, repariere Fehler').effort,'none');
});
