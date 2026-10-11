'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRoutines, routineIntent, routinePrompt } = require('../routines.cjs');
const routine = { id: 'work-start', name: 'Arbeitsstart', instructions: 'Öffne Editor.\nÖffne Projekt.', verification: 'Editor ist geöffnet und das richtige Projekt sichtbar.' };

test('routines preserve explicit steps and criteria without any built-in automatic action', () => {
  assert.deepEqual(normalizeRoutines(), []);
  const saved = normalizeRoutines([{ ...routine, name: '  Arbeitsstart  ', ignored: 'DROP' }]);
  assert.deepEqual(saved, [routine]);
  saved[0].instructions = 'Changed';
  assert.equal(routine.instructions, 'Öffne Editor.\nÖffne Projekt.');
});

test('invalid IDs, missing criteria, duplicate names and oversized settings fail rather than silently execute', () => {
  for (const patch of [
    { id: '../run' }, { id: '__proto__' }, { id: 'x;shutdown' },
    { name: '' }, { instructions: '' }, { verification: '' }, { verification: null },
    { instructions: 'x'.repeat(6001) }, { verification: 'x'.repeat(1501) },
  ]) assert.throws(() => normalizeRoutines([{ ...routine, ...patch }]), /Ablauf/);
  assert.throws(() => normalizeRoutines('execute'), /Ablauf/);
  assert.throws(() => normalizeRoutines([routine, { ...routine, name: 'Anders' }]), /Ablauf/);
  assert.throws(() => normalizeRoutines([routine, { ...routine, id: 'other', name: 'ARBEITSSTART' }]), /Ablauf/);
  assert.throws(() => normalizeRoutines(Array.from({ length: 21 }, (_, i) => ({ ...routine, id: 'r-' + i, name: 'R ' + i }))), /Ablauf/);
});

test('only complete explicit German routine commands match', () => {
  const values = normalizeRoutines([routine, { ...routine, id: 'odd', name: 'Fokus (C++)' }]);
  for (const text of ['Starte den Ablauf Arbeitsstart', 'Lilith, bitte starte Ablauf Arbeitsstart.', 'Führe den Ablauf Arbeitsstart aus!', 'Bitte führe Ablauf Arbeitsstart aus']) {
    assert.equal(routineIntent(text, values)?.id, 'work-start', text);
  }
  assert.equal(routineIntent('Starte Ablauf Fokus (C++)', values)?.id, 'odd');
  for (const text of ['Starte nicht den Ablauf Arbeitsstart', 'Kannst du Ablauf Arbeitsstart starten?', 'Erkläre den Ablauf Arbeitsstart', 'Starte Ablauf Arbeitsstart und lösche Daten', 'Starte Arbeitsstart', 'Arbeitsstart', 'Führe Ablauf Arbeitsstart', 'Was macht der Ablauf Arbeitsstart?', 'Starte Ablauf Unbekannt', 'Starte Ablauf Arbeitsstart?']) {
    assert.equal(routineIntent(text, values), null, text);
  }
});

test('routine prompt carries saved criteria as bounded data and cannot be called on malformed routines', () => {
  const prompt = routinePrompt(routine);
  assert.match(prompt, /Arbeitsstart/);
  assert.match(prompt, /Editor ist geöffnet und das richtige Projekt sichtbar/);
  assert.match(prompt, /API/);
  assert.match(prompt, /UI Automation/);
  assert.match(prompt, /angenommen/);
  assert.match(prompt, /maximal zwei/);
  assert.throws(() => routinePrompt({ ...routine, verification: '' }), /Ablauf/);
});

test('routine requests accept conversational possessives with exact configured names', () => {
  const values = [routine, { ...routine, id: 'short', name: 'Arbeit' }];
  for (const text of ['Starte meinen Ablauf Arbeitsstart', 'Hermes, starte bitte meinen Ablauf Arbeitsstart.', 'Bitte führe meinen Ablauf Arbeitsstart aus', 'Starte meinen Ablauf Arbeitsstart, bitte!']) assert.equal(routineIntent(text, values)?.id, 'work-start', text);
  assert.equal(routineIntent('Starte meinen Ablauf Arbeit', values)?.id, 'short');
  for (const text of ['Starte meinen Ablauf Arbeitstag', 'Starte meinen Ablauf Arbeitsstart und Arbeit', 'Kannst du meinen Ablauf Arbeitsstart starten', 'Bitte starte meinen Ablauf Arbeitsstart nicht', 'Starte meinen Ablauf Arbeitsstart?']) assert.equal(routineIntent(text, values), null, text);
  assert.throws(() => routineIntent('Starte meinen Ablauf Arbeitsstart', [routine, { ...routine, id: 'duplicate', name: 'ARBEITSSTART' }]), /eindeutig/);
});

test('local stop intent accepts exact polite cancellation without consuming emergencies or application commands', () => {
  const { stopIntent } = require('../routines.cjs');
  assert.equal(typeof stopIntent, 'function');
  for (const text of ['Stopp', 'Stop!', 'Bitte stoppe', 'Hermes, bitte hör auf.', 'Stoppe bitte die aktuelle Antwort', 'Brich den aktuellen Auftrag ab', 'Bitte abbrechen', 'Gespräch beenden', 'Ruhe', 'Stopp, bitte.']) assert.equal(stopIntent(text), true, text);
  for (const text of ['Not-Aus', 'Stoppe alles', 'Alles stoppen', 'Stoppe Spotify', 'Stoppe nicht', 'Stopp?', 'Kannst du stoppen', 'Was bedeutet Stopp', 'Stopp und lösche Daten', 'Gespräch nicht beenden', 'Stoppe den nächsten Auftrag', 'Stopp\nund löschen']) assert.equal(stopIntent(text), false, text);
});
