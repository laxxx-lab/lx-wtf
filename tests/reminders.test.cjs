'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let createReminders;
try { ({ createReminders } = require('../reminders.cjs')); } catch {}
const start = Date.parse('2026-10-12T08:00:00Z');
function storage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-reminders-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'reminders.json');
}

test('reminders have a local one-shot service', () => assert.equal(typeof createReminders, 'function'));
test('explicit timezone instant survives restart and fires once after persisted claim', async t => {
  const file = storage(t); let time = start; const calls = [];
  const first = createReminders({ file, now: () => time });
  const created = first.execute({ action: 'create', kind: 'reminder', text: 'Wasser trinken', at: '2026-10-12T10:01:00+02:00' });
  assert.equal(created.ok, true); assert.equal(created.reminder.at, '2026-10-12T08:01:00.000Z');
  const resumed = createReminders({ file, now: () => time, onDue: async reminder => {
    assert.equal(JSON.parse(fs.readFileSync(file)).items[0].status, 'fired');
    calls.push(reminder.text);
  } });
  assert.deepEqual(await resumed.tick(), []);
  time += 60000;
  const results = await Promise.all([resumed.tick(), resumed.tick()]);
  assert.equal(results.flat().length, 1); assert.deepEqual(calls, ['Wasser trinken']);
  assert.equal(resumed.list()[0].delivery, 'delivered');
  assert.deepEqual(await createReminders({ file, now: () => time, onDue: () => calls.push('duplicate') }).tick(), []);
});
test('cancelled alarm does not fire and list cannot mutate service', async t => {
  let time = start; let calls = 0;
  const reminders = createReminders({ file: storage(t), now: () => time, onDue: () => calls++ });
  const created = reminders.execute({ action: 'create', kind: 'alarm', text: 'Pause', at: '2026-10-12T08:01:00Z' });
  reminders.list()[0].status = 'fired';
  assert.equal(reminders.execute({ action: 'cancel', id: created.reminder.id }).status, 'cancelled');
  time += 60000; assert.deepEqual(await reminders.tick(), []); assert.equal(calls, 0);
});
test('invalid, ambiguous and past reminder input never enters storage', t => {
  const reminders = createReminders({ file: storage(t), now: () => start });
  for (const value of [
    { at: '2026-10-12T10:01:00' }, { at: '2026-02-30T10:01:00Z' }, { at: '2026-10-12T08:00:00Z' },
    { kind: 'repeat' }, { text: '' }, { text: 'x\u0000y' }, { extra: 'command' },
  ]) assert.equal(reminders.execute({ action: 'create', kind: 'reminder', text: 'Pause', at: '2026-10-12T08:01:00Z', ...value }).ok, false);
  assert.equal(reminders.execute({ action: 'cancel', id: ';shell' }).ok, false);
  assert.deepEqual(reminders.list(), []);
});
test('delivery failure is separate from due claim and cannot replay', async t => {
  let time = start;
  const reminders = createReminders({ file: storage(t), now: () => time, onDue: () => { throw Error('speaker offline'); } });
  reminders.execute({ action: 'create', kind: 'alarm', text: 'Pause', at: '2026-10-12T08:01:00Z' });
  time += 60000;
  assert.equal((await reminders.tick())[0].status, 'delivery-failed');
  assert.equal(reminders.list()[0].status, 'fired'); assert.equal(reminders.list()[0].delivery, 'failed');
  assert.deepEqual(await reminders.tick(), []);
});
test('50 pending reminders bound storage; cancelled history gives room', t => {
  const reminders = createReminders({ file: storage(t), now: () => start });
  for (let i = 0; i < 50; i++) assert.equal(reminders.execute({ action: 'create', kind: 'reminder', text: 'Pause', at: '2026-10-12T08:01:00Z' }).ok, true);
  assert.equal(reminders.execute({ action: 'create', kind: 'reminder', text: 'overflow', at: '2026-10-12T08:01:00Z' }).ok, false);
  reminders.execute({ action: 'cancel', id: reminders.list()[0].id });
  assert.equal(reminders.execute({ action: 'create', kind: 'reminder', text: 'new', at: '2026-10-12T08:01:00Z' }).ok, true);
  assert.equal(reminders.list().length, 50);
});
test('unwritable storage prevents creation and due delivery', async t => {
  const file = storage(t); let time = start; let calls = 0;
  const reminders = createReminders({ file, now: () => time, onDue: () => calls++ });
  const command = { action: 'create', kind: 'reminder', text: 'Pause', at: '2026-10-12T08:01:00Z' };
  assert.equal(reminders.execute(command).ok, true);
  fs.rmSync(file); fs.mkdirSync(file);
  assert.equal(reminders.execute(command).ok, false); assert.equal(reminders.list().length, 1);
  time += 60000; assert.equal((await reminders.tick())[0].ok, false); assert.equal(calls, 0);
  assert.equal(reminders.list()[0].status, 'pending');
});
test('corrupt reminder file remains intact and exposes a typed error without output', async t => {
  const file = storage(t); fs.writeFileSync(file, 'invalid private data'); let calls = 0;
  const reminders = createReminders({ file, now: () => start, onDue: () => calls++ });
  assert.ok(reminders.read().error);
  assert.equal(reminders.execute({ action: 'create', kind: 'alarm', text: 'Pause', at: '2026-10-12T08:01:00Z' }).ok, false);
  assert.equal((await reminders.tick())[0].ok, false); assert.equal(calls, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid private data');
});
test('explicit memory mode creates cancels and delivers one-shot reminders', async () => {
  let time = start; const calls = [];
  const reminders = createReminders({ file: null, now: () => time, onDue: reminder => calls.push(reminder.text) });
  const first = reminders.execute({ action: 'create', kind: 'alarm', text: 'cancel me', at: '2026-10-12T08:01:00Z' });
  assert.equal(first.ok, true);
  assert.equal(reminders.execute({ action: 'cancel', id: first.reminder.id }).ok, true);
  assert.equal(reminders.execute({ action: 'create', kind: 'reminder', text: 'Pause', at: '2026-10-12T08:01:00Z' }).ok, true);
  time += 60000; assert.equal((await reminders.tick())[0].status, 'fired');
  assert.deepEqual(calls, ['Pause']); assert.deepEqual(await reminders.tick(), []);
  assert.deepEqual(createReminders({ file: null }).list(), []);
});
test('terminal trimming preserves every pending reminder and serializes at most 50 entries', t => {
  const file = storage(t); const reminders = createReminders({ file, now: () => start });
  const activeIds = [];
  for (let i = 0; i < 50; i++) {
    const created = reminders.execute({ action: 'create', kind: 'reminder', text: 'Pause ' + i, at: '2026-10-12T08:01:00Z' });
    activeIds.push(created.reminder.id);
  }
  const cancelled = activeIds.splice(25, 1)[0];
  reminders.execute({ action: 'cancel', id: cancelled });
  const replacement = reminders.execute({ action: 'create', kind: 'alarm', text: 'replacement', at: '2026-10-12T08:01:00Z' });
  assert.equal(replacement.ok, true); activeIds.push(replacement.reminder.id);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 1); assert.equal(saved.items.length, 50);
  assert.deepEqual(saved.items.map(item => item.id).sort(), activeIds.sort());
  assert.equal(saved.items.some(item => item.id === cancelled), false);
});
test('privacy gate is checked before each claim after awaited delivery', async () => {
  let time = start, allowed = true; const calls = [];
  const reminders = createReminders({ file: null, now: () => time, onDue: async reminder => { calls.push(reminder.text); allowed = false; } });
  for (const text of ['first', 'second']) reminders.execute({ action: 'create', kind: 'reminder', text, at: '2026-10-12T08:01:00Z' });
  time += 60000;
  const first = await reminders.tick({ allowed: () => allowed });
  assert.equal(first.length, 1); assert.deepEqual(calls, ['first']);
  assert.deepEqual(reminders.list().map(item => item.status), ['fired', 'pending']);
  assert.deepEqual(await reminders.tick({ allowed: () => allowed }), []);
  allowed = true;
  const second = await reminders.tick({ allowed: () => allowed });
  assert.equal(second.length, 1); assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(reminders.list().map(item => item.status), ['fired', 'fired']);
});
