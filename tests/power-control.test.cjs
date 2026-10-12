'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let createPowerControl;
try { ({ createPowerControl } = require('../power-control.cjs')); } catch {}
function storage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-power-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'power.json');
}
test('power control has an owned local timer service', () => assert.equal(typeof createPowerControl, 'function'));
test('delayed shutdown stays local until due and never implies forced close', async t => {
  let time = 1000; const calls = []; const file = storage(t);
  const power = createPowerControl({ file, platform: 'win32', now: () => time, execFile: async (exe, args, options) => {
    assert.equal(JSON.parse(fs.readFileSync(file)).status, 'requested');
    calls.push({ exe, args, options }); return { stdout: '', stderr: '' };
  } });
  const scheduled = await power.execute({ action: 'shutdown', delaySeconds: 30 });
  assert.equal(scheduled.status, 'scheduled'); assert.equal(scheduled.dueAt, 31000);
  await power.tick(); assert.equal(calls.length, 0);
  time = 31000;
  assert.equal(power.read().status, 'due');
  const result = await power.tick();
  assert.equal(result.status, 'requested'); assert.equal(result.actualPowerEvent, 'unknown');
  assert.equal(result.nativeCommandAccepted, true);
  assert.match(calls[0].exe, /System32[\\/]shutdown\.exe$/i);
  assert.deepEqual(calls[0].args, ['/s', '/t', '0']); assert.equal(calls[0].options.shell, false);
  await power.tick(); assert.equal(calls.length, 1);
});
test('restart uses only the fixed non-forcing zero-time native action', async t => {
  let time = 1000; const calls = [];
  const power = createPowerControl({ file: storage(t), platform: 'win32', now: () => time, execFile: async (exe, args) => { calls.push(args); } });
  await power.execute({ action: 'restart', delaySeconds: 86400 }); time = 86401000;
  await power.tick(); assert.deepEqual(calls, [['/r', '/t', '0']]);
});
test('cancel clears only owned pending timer without any Windows global abort', async t => {
  let time = 1000; let calls = 0;
  const power = createPowerControl({ file: storage(t), platform: 'win32', now: () => time, execFile: async () => calls++ });
  assert.equal((await power.execute({ action: 'cancel' })).ok, false);
  await power.execute({ action: 'shutdown', delaySeconds: 30 });
  assert.equal((await power.execute({ action: 'cancel' })).status, 'cancelled');
  time = 31000; await power.tick(); assert.equal(calls, 0);
});
test('process restart never replays or cancels a prior timer', async t => {
  const file = storage(t); let time = 1000; let calls = 0;
  const options = { file, platform: 'win32', now: () => time, execFile: async () => calls++ };
  await createPowerControl(options).execute({ action: 'restart', delaySeconds: 30 });
  const resumed = createPowerControl(options); assert.equal(resumed.read().status, 'unknown');
  time = 31000; await resumed.tick(); assert.equal(calls, 0);
  assert.equal((await resumed.execute({ action: 'cancel' })).ok, false);
});
test('invalid commands and unsupported platforms cannot arm a power action', async t => {
  const file = storage(t); let calls = 0;
  const power = createPowerControl({ file, platform: 'win32', now: () => 1000, execFile: async () => calls++ });
  for (const command of [ { action: 'shutdown', delaySeconds: 29 }, { action: 'shutdown', delaySeconds: 86401 }, { action: 'shutdown', delaySeconds: 30.5 }, { action: 'restart', delaySeconds: '30' }, { action: 'shutdown', delaySeconds: 30, force: true }, { action: ';shell', delaySeconds: 30 }, { action: 'cancel', delaySeconds: 30 } ]) assert.equal((await power.execute(command)).ok, false);
  assert.equal((await createPowerControl({ file, platform: 'linux' }).execute({ action: 'shutdown', delaySeconds: 30 })).ok, false);
  assert.equal(power.read().status, 'idle'); assert.equal(calls, 0);
});
test('replacement and concurrent due ticks cannot dispatch twice', async t => {
  let time = 1000; let release; let calls = 0;
  const power = createPowerControl({ file: storage(t), platform: 'win32', now: () => time, execFile: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  await power.execute({ action: 'shutdown', delaySeconds: 30 });
  assert.equal((await power.execute({ action: 'restart', delaySeconds: 30 })).ok, false);
  time = 31000; const due = power.tick(); await power.tick();
  assert.equal((await power.execute({ action: 'cancel' })).ok, false);
  release(); await due; assert.equal(calls, 1);
});
test('persist failure prevents native dispatch; native failure remains honestly unknown', async t => {
  const file = storage(t); let time = 1000; let calls = 0;
  const power = createPowerControl({ file, platform: 'win32', now: () => time, execFile: async () => { calls++; throw Error('unknown native result'); } });
  await power.execute({ action: 'shutdown', delaySeconds: 30 });
  fs.rmSync(file); fs.mkdirSync(file); time = 31000;
  assert.equal((await power.tick()).ok, false); assert.equal(calls, 0);
  fs.rmdirSync(file);
  const result = await power.tick(); assert.equal(result.status, 'unknown'); assert.equal(result.actualPowerEvent, 'unknown'); assert.equal(calls, 1);
  await power.tick(); assert.equal(calls, 1);
});
test('storage failure cannot prevent emergency cancellation of the local timer', async t => {
  const file = storage(t); let time = 1000; let calls = 0;
  const power = createPowerControl({ file, platform: 'win32', now: () => time, execFile: async () => calls++ });
  await power.execute({ action: 'shutdown', delaySeconds: 30 });
  fs.rmSync(file); fs.mkdirSync(file);
  const cancelled = await power.execute({ action: 'cancel' });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cancellable, false);
  time = 31000; await power.tick(); assert.equal(calls, 0);
});
test('corrupt power file is preserved without dispatch or replacing it', async t => {
  const file = storage(t); fs.writeFileSync(file, 'invalid private data'); let calls = 0;
  const power = createPowerControl({ file, platform: 'win32', execFile: async () => calls++ });
  assert.equal(power.read().status, 'unknown');
  assert.equal((await power.execute({ action: 'shutdown', delaySeconds: 30 })).ok, false);
  await power.tick(); assert.equal(calls, 0); assert.equal(fs.readFileSync(file, 'utf8'), 'invalid private data');
});
test('explicit memory mode schedules cancels and dispatches only an owned due request', async () => {
  let time = 1000; const calls = [];
  const power = createPowerControl({ file: null, platform: 'win32', now: () => time, execFile: async (exe, args) => { calls.push(args); } });
  await power.tick(); assert.equal(calls.length, 0);
  assert.equal((await power.execute({ action: 'shutdown', delaySeconds: 30 })).status, 'scheduled');
  assert.equal((await power.execute({ action: 'cancel' })).status, 'cancelled');
  time = 31000; await power.tick(); assert.equal(calls.length, 0);
  assert.equal((await power.execute({ action: 'restart', delaySeconds: 30 })).ok, true);
  await power.tick(); assert.equal(calls.length, 0);
  time = 61000; assert.equal((await power.tick()).nativeCommandAccepted, true);
  await power.tick(); assert.deepEqual(calls, [['/r', '/t', '0']]);
  const unsupported = createPowerControl({ file: null, platform: 'linux', now: () => time, execFile: async () => calls.push('unsafe') });
  assert.equal((await unsupported.execute({ action: 'shutdown', delaySeconds: 30 })).ok, false);
  time += 30000; await unsupported.tick(); assert.equal(calls.length, 1);
});
