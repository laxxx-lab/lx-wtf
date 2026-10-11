'use strict';
(function () {
  let mountSequence = 0;
  function parseForms(text) {
    const forms = [];
    let field = '', quoted = false, closed = false;
    const input = text + ',';
    for (let index = 0; index < input.length; index++) {
      const char = input[index];
      if (quoted) {
        if (char === '"') {
          if (input[index + 1] === '"') { field += '"'; index++; }
          else { quoted = false; closed = true; }
        } else field += char;
      } else if (char === ',' || char === '\n') {
        if (field.trim() || /[\p{Cc}\p{Cf}]/u.test(field)) forms.push(field);
        field = ''; closed = false;
      } else if (char === '"' && !field.trim() && !closed) {
        quoted = true;
      } else {
        if (closed && char.trim()) throw new Error('Nach einer Fehlerform in Anführungszeichen muss ein Komma oder Zeilenumbruch folgen.');
        field += char;
      }
    }
    if (quoted) throw new Error('Die Anführungszeichen einer Fehlerform sind noch nicht geschlossen.');
    return forms;
  }
  const formatForm = text => /[,"\n]/u.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  function mount(container, { onChange } = {}) {
    if (!container?.ownerDocument) throw new TypeError('Ein Container für das Erkennungswörterbuch fehlt.');
    const doc = container.ownerDocument, dictionary = window.SpeechDictionary;
    if (!dictionary) throw new Error('Das Erkennungswörterbuch wurde nicht geladen.');
    const prefix = 'speech-dictionary-' + (++mountSequence);
    let rowSequence = 0;
    const rows = [];
    function element(tag, text, className) {
      const node = doc.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }
    const section = element('section', undefined, 'speech-dictionary');
    section.setAttribute('aria-labelledby', prefix + '-heading');
    const heading = element('h3', 'Erkennungswörterbuch'); heading.id = prefix + '-heading';
    const help = element('p', 'Eigene Begriffe und tatsächlich erkannte Fehlerformen eintragen. Die lokale Korrektur erfolgt nach der Spracherkennung; das Sprachmodell wird dadurch nicht trainiert.');
    const limits = element('p', 'Bis zu 100 Begriffe, je 10 Fehlerformen mit höchstens 80 Zeichen. Mit Komma oder Zeilenumbruch trennen. Formen mit Komma in Anführungszeichen setzen; enthaltene Anführungszeichen verdoppeln. Ohne Fehlerform bleibt der Begriff unverändert.', 'sd-help');
    limits.id = prefix + '-help';
    const table = element('table');
    const caption = element('caption', 'Begriffe und erlaubte Fehlerformen', 'sd-visually-hidden');
    const thead = element('thead'), headers = element('tr');
    for (const label of ['Richtiger Begriff', 'Erkannte Fehlerformen', 'Aktion']) {
      const th = element('th', label); th.scope = 'col'; headers.append(th);
    }
    thead.append(headers);
    const tbody = element('tbody'); table.append(caption, thead, tbody);
    const empty = element('p', 'Noch keine Begriffe eingetragen.', 'sd-empty');
    const actions = element('div', undefined, 'sd-actions');
    const add = element('button', '+ Begriff hinzufügen'); add.type = 'button'; add.dataset.sd = 'add';
    const count = element('span'); actions.append(add, count);
    const error = element('p', '', 'sd-error'); error.id = prefix + '-error'; error.dataset.sd = 'error'; error.hidden = true; error.setAttribute('role', 'alert');
    const previewLabel = element('label', 'Lokale Vorschau · dieser Text wird nicht gesendet', 'sd-preview-label');
    const preview = element('textarea'); preview.id = prefix + '-preview'; preview.dataset.sd = 'preview'; preview.rows = 2; preview.maxLength = 4000; preview.placeholder = 'Erkannten Satz zum Prüfen eingeben';
    previewLabel.htmlFor = preview.id;
    const result = element('p', '', 'sd-result'); result.dataset.sd = 'result'; result.setAttribute('aria-live', 'polite');
    const changes = element('p', '', 'sd-changes'); changes.dataset.sd = 'changes';
    section.append(heading, help, limits, table, empty, actions, error, previewLabel, preview, result, changes);
    container.append(section);

    function showError(problem) {
      error.textContent = problem?.message || '';
      error.hidden = !problem;
    }
    function value() {
      try {
        const values = dictionary.normalizeSpeechDictionary(rows.map(row => ({
          word: row.word.value,
          heardAs: parseForms(row.variants.value),
        })));
        showError(null);
        return values;
      } catch (problem) {
        showError(problem);
        throw problem;
      }
    }
    function refresh(notify = true) {
      empty.hidden = rows.length > 0;
      table.hidden = rows.length === 0;
      count.textContent = rows.length + ' / 100';
      add.disabled = rows.length >= 100;
      try {
        const values = value();
        if (preview.value) {
          const correction = dictionary.applySpeechDictionary(preview.value, values);
          result.textContent = correction.text;
          changes.textContent = correction.changes.length ? correction.changes.map(change => change.from + ' → ' + change.to).join('\n') : 'Keine Korrektur gefunden.';
        } else {
          result.textContent = 'Gib einen erkannten Satz ein, um die aktuellen Einträge zu prüfen.';
          changes.textContent = '';
        }
      } catch {
        result.textContent = 'Die Vorschau ist verfügbar, sobald die Einträge gültig sind.';
        changes.textContent = '';
      }
      if (notify && typeof onChange === 'function') onChange();
    }
    function appendRow(entry) {
      const id = prefix + '-row-' + (++rowSequence);
      const tr = element('tr');
      const word = element('input'); word.type = 'text'; word.required = true; word.id = id + '-word'; word.dataset.sd = 'word'; word.maxLength = 80; word.value = entry.word;
      const variants = element('textarea'); variants.id = id + '-variants'; variants.dataset.sd = 'variants'; variants.rows = 2; variants.value = entry.heardAs.map(formatForm).join('\n');
      for (const [input, labelText] of [[word, 'Richtiger Begriff'], [variants, 'Erkannte Fehlerformen']]) {
        const td = element('td'), label = element('label', labelText, 'sd-visually-hidden');
        label.htmlFor = input.id; input.setAttribute('aria-describedby', limits.id + ' ' + error.id); input.spellcheck = false;
        td.append(label, input); tr.append(td);
        input.addEventListener('input', () => { remove.setAttribute('aria-label', 'Begriff ' + (word.value || 'ohne Namen') + ' entfernen'); refresh(); });
      }
      const td = element('td'), remove = element('button', 'Entfernen'); remove.type = 'button'; remove.dataset.sd = 'remove'; remove.setAttribute('aria-label', 'Begriff ' + (word.value || 'ohne Namen') + ' entfernen');
      td.append(remove); tr.append(td);
      const row = { tr, word, variants }; rows.push(row); tbody.append(tr);
      remove.addEventListener('click', () => {
        const index = rows.indexOf(row); rows.splice(index, 1); tr.remove(); refresh();
        (rows[index]?.word || rows[index - 1]?.word || add).focus();
      });
      return row;
    }
    function set(entries = []) {
      const values = dictionary.normalizeSpeechDictionary(entries);
      tbody.replaceChildren(); rows.length = 0;
      for (const entry of values) appendRow(entry);
      refresh(false);
    }
    add.addEventListener('click', () => {
      if (rows.length >= 100) return;
      const row = appendRow({ word: '', heardAs: [] }); refresh(); row.word.focus();
    });
    preview.addEventListener('input', () => refresh(false));
    set([]);
    return { set, value, destroy() { section.remove(); } };
  }
  window.SpeechDictionaryEditor = { mount };
})();
