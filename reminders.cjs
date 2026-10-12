'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function instant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59 || zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function createReminders({ file = path.join(__dirname, '.local', 'reminders.json'), now = Date.now, onDue } = {}) {
  let items = [], loadError = null;
  try {
    if (file !== null && fs.existsSync(file)) {
      if (fs.statSync(file).size > 256 * 1024) throw Error('Erinnerungsdatei ist zu groß.');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.items) || saved.items.length > 50) throw Error('Ungültige Erinnerungsdatei.');
      const ids = new Set();
      for (const item of saved.items) {
        if (!item || !UUID.test(item.id) || ids.has(item.id) || !['reminder', 'alarm'].includes(item.kind) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500 || /[\p{Cc}\p{Cf}]/u.test(item.text) || !instant(item.at) || !['pending', 'cancelled', 'fired'].includes(item.status) || !Number.isFinite(item.createdAt)) throw Error('Ungültige gespeicherte Erinnerung.');
        ids.add(item.id);
      }
      items = saved.items;
    }
  } catch { loadError = 'Erinnerungsdatei konnte nicht sicher gelesen werden. Die Datei bleibt erhalten.'; }

  function save(next) {
    if (loadError) throw Error(loadError);
    if (file === null) { items = next; return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, items: next }), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      try { fs.unlinkSync(temporary); } catch {}
    }
    items = next;
  }
  const fail = error => ({ ok: false, status: 'failed', error });
  function execute(command) {
    if (loadError) return fail(loadError);
    if (!command || typeof command !== 'object' || Array.isArray(command)) return fail('Ungültige Erinnerung.');
    const keys = Object.keys(command).sort().join('|');
    try {
      if (command.action === 'create') {
        const at = instant(command.at);
        if (keys !== 'action|at|kind|text' || !['reminder', 'alarm'].includes(command.kind) || typeof command.text !== 'string' || !command.text.trim() || command.text.length > 500 || /[\p{Cc}\p{Cf}]/u.test(command.text) || !at || Date.parse(at) <= now()) return fail('Bitte Art, kurzen Text und einen zukünftigen ISO-Zeitpunkt mit Zeitzone angeben.');
        if (items.filter(item => item.status === 'pending').length >= 50) return fail('Es sind bereits 50 Erinnerungen aktiv.');
        const reminder = { id: randomUUID(), kind: command.kind, text: command.text.trim(), at, status: 'pending', delivery: 'pending', createdAt: now() };
        const next = [...items];
        if (next.length >= 50) next.splice(next.findIndex(item => item.status !== 'pending'), 1);
        save([...next, reminder]);
        return { ok: true, status: 'scheduled', reminder: structuredClone(reminder) };
      }
      if (command.action === 'cancel' && keys === 'action|id' && typeof command.id === 'string' && UUID.test(command.id)) {
        const reminder = items.find(item => item.id === command.id);
        if (!reminder || reminder.status !== 'pending') return fail('Diese Erinnerung ist nicht mehr aktiv.');
        const cancelled = { ...reminder, status: 'cancelled', cancelledAt: now() };
        save(items.map(item => item.id === reminder.id ? cancelled : item));
        return { ok: true, status: 'cancelled', reminder: structuredClone(cancelled) };
      }
      return fail('Ungültiger Erinnerungsauftrag.');
    } catch { return fail('Erinnerung konnte nicht gespeichert werden. Es wurde keine neue Wirkung ausgelöst.'); }
  }
  async function tick({ allowed = () => true } = {}) {
    if (loadError) return [fail(loadError)];
    const results = [];
    for (const pending of items.filter(item => item.status === 'pending' && Date.parse(item.at) <= now())) {
      if (!allowed()) break;
      // Claim before calling the renderer: a crash cannot replay a claimed reminder.
      const current = items.find(item => item.id === pending.id);
      if (current?.status !== 'pending') continue;
      const claimed = { ...current, status: 'fired', firedAt: now(), delivery: 'unknown' };
      try { save(items.map(item => item.id === claimed.id ? claimed : item)); }
      catch { results.push(fail('Fällige Erinnerung konnte nicht beansprucht werden; keine Ausgabe ausgelöst.')); continue; }
      let delivery = 'delivered';
      try {
        if (typeof onDue !== 'function') throw Error('Keine Ausgabe eingerichtet.');
        await onDue(structuredClone(claimed));
      } catch { delivery = 'failed'; }
      const completed = { ...claimed, delivery };
      try { save(items.map(item => item.id === completed.id ? completed : item)); }
      catch { delivery = 'unknown'; }
      results.push({ ok: delivery === 'delivered', status: delivery === 'delivered' ? 'fired' : delivery === 'failed' ? 'delivery-failed' : 'delivery-unknown', reminder: { ...structuredClone(completed), delivery } });
    }
    return results;
  }
  return { list: () => structuredClone(items), read: () => ({ items: structuredClone(items), error: loadError }), execute, tick };
}
module.exports = { createReminders };
