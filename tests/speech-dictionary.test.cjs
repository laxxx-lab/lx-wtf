'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let api = {};
try { api = require('../speech-dictionary.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

test('an absent dictionary stays empty and normalization returns independent trimmed entries', () => {
  assert.equal(typeof api.normalizeSpeechDictionary, 'function');
  assert.deepEqual(api.normalizeSpeechDictionary(), []);
  const input = [{ word: '  LightCraft  ', heardAs: [' light   craft ', 'LIGHT CRAFT', 'LightCraft'] }];
  assert.deepEqual(api.normalizeSpeechDictionary(input), [{ word: 'LightCraft', heardAs: ['light craft', 'LightCraft'] }]);
  assert.equal(input[0].word, '  LightCraft  ');
});

test('dictionary rejects malformed values, hidden controls and exceeded limits', () => {
  assert.equal(typeof api.normalizeSpeechDictionary, 'function');
  for (const value of [null, {}, 'words', [null], [{ word: 2, heardAs: [] }], [{ word: '', heardAs: [] }], [{ word: 'Test', heardAs: 'test' }], [{ word: 'Test', heardAs: [2] }], [{ word: 'Test', heardAs: [''] }], [{ word: 'A\nB', heardAs: [] }], [{ word: 'AB', heardAs: ['a\u200Bb'] }], [{ word: 'x'.repeat(81), heardAs: [] }], [{ word: 'Test', heardAs: ['x'.repeat(81)] }], [{ word: 'Test', heardAs: Array.from({ length: 11 }, (_, i) => 'Fehler ' + i) }], Array.from({ length: 101 }, (_, i) => ({ word: 'Begriff ' + i, heardAs: [] }))]) {
    assert.throws(() => api.normalizeSpeechDictionary(value), Error);
  }
  assert.deepEqual(api.normalizeSpeechDictionary([{ word: 'Ä'.repeat(80), heardAs: [] }]), [{ word: 'Ä'.repeat(80), heardAs: [] }]);
});

test('the same case-insensitive error form cannot point at different words', () => {
  assert.equal(typeof api.normalizeSpeechDictionary, 'function');
  for (const heardAs of [['Projekt', 'projekt'], ['ÄRGER', 'ärger'], ['ſage', 'sage'], ['MASS', 'mass']]) {
    assert.throws(() => api.normalizeSpeechDictionary([{ word: 'Eins', heardAs: [heardAs[0]] }, { word: 'Zwei', heardAs: [heardAs[1]] }]), /Fehlerform|mehrdeutig/i);
  }
  assert.throws(() => api.normalizeSpeechDictionary([{ word: 'Name', heardAs: [] }, { word: 'NAME', heardAs: [] }]), /doppelt/i);
});

test('rules that could rewrite another target or part of their own output are rejected', () => {
  assert.equal(typeof api.normalizeSpeechDictionary, 'function');
  for (const values of [
    [{ word: 'Beta', heardAs: ['Alpha'] }, { word: 'Gamma', heardAs: ['Beta'] }],
    [{ word: 'Beta', heardAs: ['Alpha'] }, { word: 'Alpha', heardAs: ['Beta'] }],
    [{ word: 'New York', heardAs: ['York'] }],
    [{ word: 'New York', heardAs: ['NY'] }, { word: 'London', heardAs: ['York'] }],
  ]) assert.throws(() => api.normalizeSpeechDictionary(values), /Korrektur|Kaskade|erneut/i);
});

test('only configured whole error forms change, retaining spelling, punctuation and raw input', () => {
  assert.equal(typeof api.applySpeechDictionary, 'function');
  const raw = 'Öffne LIGHT CRAFT, bitte! light craft? Flight craft und light craftsmanship.';
  assert.deepEqual(api.applySpeechDictionary(raw, [{ word: 'LightCraft', heardAs: ['light craft'] }]), {
    text: 'Öffne LightCraft, bitte! LightCraft? Flight craft und light craftsmanship.',
    changes: [{ from: 'LIGHT CRAFT', to: 'LightCraft' }, { from: 'light craft', to: 'LightCraft' }],
  });
  assert.equal(raw, 'Öffne LIGHT CRAFT, bitte! light craft? Flight craft und light craftsmanship.');
});

test('Unicode letters, German sharp s, digits, underscores and combining marks protect word boundaries', () => {
  assert.equal(typeof api.applySpeechDictionary, 'function');
  const entries = [{ word: 'Größe', heardAs: ['gröse'] }, { word: 'Straße', heardAs: ['strase'] }, { word: 'Ziel', heardAs: ['foo'] }];
  assert.deepEqual(api.applySpeechDictionary('GRÖSE, STRASE. äfoo fooß foo2 foo_bar foo\u0308 (foo)', entries), {
    text: 'Größe, Straße. äfoo fooß foo2 foo_bar foo\u0308 (Ziel)',
    changes: [{ from: 'GRÖSE', to: 'Größe' }, { from: 'STRASE', to: 'Straße' }, { from: 'foo', to: 'Ziel' }],
  });
  assert.equal(api.applySpeechDictionary('FUSS Fuß', [{ word: 'Begriff', heardAs: ['Fuß'] }]).text, 'FUSS Begriff');
});

test('overlapping phrases choose the longest original match independent of row order', () => {
  assert.equal(typeof api.applySpeechDictionary, 'function');
  const entries = [{ word: 'Einzel', heardAs: ['light'] }, { word: 'LightCraft', heardAs: ['light craft'] }];
  const expected = { text: 'LightCraft, Einzel.', changes: [{ from: 'light craft', to: 'LightCraft' }, { from: 'light', to: 'Einzel' }] };
  assert.deepEqual(api.applySpeechDictionary('light craft, light.', entries), expected);
  assert.deepEqual(api.applySpeechDictionary('light craft, light.', entries.slice().reverse()), expected);
});

test('regex syntax and markup are literal strings with no regex or HTML interpretation', () => {
  assert.equal(typeof api.applySpeechDictionary, 'function');
  assert.deepEqual(api.applySpeechDictionary('((a+)+$) [a-z] <img src=x onerror=alert(1)>', [
    { word: 'Literal', heardAs: ['((a+)+$)'] },
    { word: '<script>alert(1)</script>', heardAs: ['[a-z]'] },
  ]), {
    text: 'Literal <script>alert(1)</script> <img src=x onerror=alert(1)>',
    changes: [{ from: '((a+)+$)', to: 'Literal' }, { from: '[a-z]', to: '<script>alert(1)</script>' }],
  });
});

test('a correction never scans its output again, including phrases created across the replaced span', () => {
  assert.equal(typeof api.applySpeechDictionary, 'function');
  assert.deepEqual(api.applySpeechDictionary('one two', [{ word: 'alpha', heardAs: ['one'] }, { word: 'result', heardAs: ['alpha two'] }]), {
    text: 'alpha two', changes: [{ from: 'one', to: 'alpha' }],
  });
});

test('an explicit form can correct proper-name capitalization without reporting unchanged matches', () => {
  assert.deepEqual(api.applySpeechDictionary('lightcraft LightCraft LIGHTCRAFT', [{ word: 'LightCraft', heardAs: ['lightcraft'] }]), {
    text: 'LightCraft LightCraft LightCraft',
    changes: [{ from: 'lightcraft', to: 'LightCraft' }, { from: 'LIGHTCRAFT', to: 'LightCraft' }],
  });
});

test('empty and already-correct transcripts stay unchanged; invalid dictionaries fail closed', () => {
  assert.equal(typeof api.applySpeechDictionary, 'function');
  assert.deepEqual(api.applySpeechDictionary('Unverändert.', []), { text: 'Unverändert.', changes: [] });
  assert.deepEqual(api.applySpeechDictionary('', [{ word: 'Name', heardAs: [] }]), { text: '', changes: [] });
  assert.deepEqual(api.applySpeechDictionary('Name', [{ word: 'Name', heardAs: ['name'] }]), { text: 'Name', changes: [] });
  assert.throws(() => api.applySpeechDictionary('alpha', [{ word: 'A', heardAs: ['alpha'] }, { word: 'B', heardAs: ['ALPHA'] }]), Error);
  assert.throws(() => api.applySpeechDictionary({}, []), TypeError);
});
