'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpeechDictionary = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const hidden = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
  const boundary = '[\\p{L}\\p{N}\\p{M}_]';
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const literal = text => new RegExp('^' + escape(text) + '$', 'iu');
  const whole = text => new RegExp('(?<!' + boundary + ')' + escape(text) + '(?!' + boundary + ')', 'iu');

  function term(value, label) {
    if (typeof value !== 'string') throw new TypeError(label + ' muss Text sein.');
    if (hidden.test(value)) throw new Error(label + ' darf keine Steuerzeichen oder unsichtbaren Zeichen enthalten.');
    const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (!text || Array.from(text).length > 80) throw new Error(label + ' muss 1 bis 80 Zeichen enthalten.');
    return text;
  }

  function normalizeSpeechDictionary(values = []) {
    if (!Array.isArray(values)) throw new TypeError('Das Erkennungswörterbuch muss eine Liste sein.');
    if (values.length > 100) throw new Error('Das Erkennungswörterbuch erlaubt höchstens 100 Begriffe.');
    const entries = [], words = [], rules = [];
    for (const [index, entry] of values.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('Begriff ' + (index + 1) + ' ist ungültig.');
      const word = term(entry.word, 'Begriff ' + (index + 1));
      if (words.some(test => test.test(word))) throw new Error('Der Begriff „' + word + '“ ist doppelt eingetragen.');
      const wordTest = literal(word);
      words.push(wordTest);
      if (!Array.isArray(entry.heardAs)) throw new TypeError('Fehlerformen für „' + word + '“ müssen eine Liste sein.');
      if (entry.heardAs.length > 10) throw new Error('Für „' + word + '“ sind höchstens 10 Fehlerformen erlaubt.');
      const heardAs = [];
      for (const value of entry.heardAs) {
        const alias = term(value, 'Fehlerform für „' + word + '“');
        const existing = rules.find(rule => rule.literal.test(alias));
        if (existing) {
          if (existing.word !== word) throw new Error('Die Fehlerform „' + alias + '“ ist mehrdeutig: „' + existing.word + '“ oder „' + word + '“.');
          continue;
        }
        heardAs.push(alias);
        rules.push({ alias, word, literal: literal(alias), whole: whole(alias) });
      }
      entries.push({ word, heardAs });
    }
    for (const entry of entries) {
      const cascade = rules.find(rule => rule.whole.test(entry.word) && entry.word.replace(rule.whole,()=>rule.word)!==entry.word);
      if (cascade) throw new Error('Der Begriff „' + entry.word + '“ enthält die Fehlerform „' + cascade.alias + '“ und würde erneut korrigiert. Bitte diese Korrektur entfernen.');
    }
    return entries;
  }

  function applySpeechDictionary(text, values = []) {
    if (typeof text !== 'string') throw new TypeError('Der erkannte Text muss Text sein.');
    const entries = normalizeSpeechDictionary(values);
    const rules = entries.flatMap(entry => entry.heardAs.map(alias => ({ alias, word: entry.word, literal: literal(alias) })))
      .sort((left, right) => right.alias.length - left.alias.length);
    if (!rules.length) return { text, changes: [] };
    const matcher = new RegExp('(?<!' + boundary + ')(?:' + rules.map(rule => escape(rule.alias)).join('|') + ')(?!' + boundary + ')', 'giu');
    const changes = [];
    // replace scans only the original transcript; inserted output cannot trigger another rule.
    const corrected = text.replace(matcher, from => {
      const to = rules.find(rule => rule.literal.test(from)).word;
      if(from!==to)changes.push({ from, to });
      return to;
    });
    return { text: corrected, changes };
  }

  return { normalizeSpeechDictionary, applySpeechDictionary };
});
