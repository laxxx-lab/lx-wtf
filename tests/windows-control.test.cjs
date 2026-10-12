const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let createWindowsControl;
try { ({ createWindowsControl } = require('../windows-control.cjs')); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const target = { id: '123456', pid: 42, processStartedAt: '2026-10-12T10:00:00.1234567Z' };
const window = { ...target, title: 'Example', app: 'example' };
function backend(output, check = () => {}) {
  assert.equal(typeof createWindowsControl, 'function', 'window control is missing');
  return createWindowsControl({ platform: 'win32', windowsDir: 'C:\\Windows', execFile(exe, args, options, callback) {
    check(exe, args, options);
    callback(null, JSON.stringify({ observedAt: new Date().toISOString(), sessionId: 2, activeDesktop: true, ...output }), '');
  } });
}
function focused(extra = {}) { return { kind: 'focus', accepted: true, identityMatched: true, minimized: false, target, foregroundId: target.id, foregroundPid: target.pid, foregroundProcessStartedAt: target.processStartedAt, ...extra }; }

test('window inventory returns stable identities through a fixed shell-free helper', async () => {
  const signal = new AbortController().signal;
  const result = await backend({ kind: 'list', windows: [window] }, (exe, args, options) => {
    assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../scripts/windows_control.ps1'), '-Action', 'list']);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(options.signal, signal);
    assert.ok(options.timeout > 0 && options.timeout < 15000);
  }).read({ signal });
  assert.deepEqual(result.windows, [window]);
  assert.ok(Date.parse(result.observedAt));
  assert.deepEqual((await backend({ kind: 'list', windows: [] }).read()).windows, []);
});

test('focus completion requires a fresh exact handle, owner and process start readback', async () => {
  const result = await backend(focused(), (exe, args) => {
    assert.deepEqual(args.slice(-8), ['-Action', 'focus', '-Id', '123456', '-ProcessId', '42', '-ProcessStartedAt', '2026-10-12T10:00:00.1234567Z']);
  }).focus(target);
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, true);
  assert.equal(result.evidence.foregroundId, '123456');
  for (const extra of [
    { foregroundId: '654321' }, { foregroundPid: 99 }, { foregroundProcessStartedAt: '2026-10-12T10:00:01.1234567Z' },
    { identityMatched: false }, { minimized: true }, { activeDesktop: false }, { sessionId: 0 }, { observedAt: '2001-01-01T00:00:00.000Z' },
    { target: { ...target, pid: 99 } }, { kind: 'list' }, { errorCode: 'WINDOW_CHANGED' },
  ]) {
    const rejected = await backend(focused(extra)).focus(target);
    assert.equal(rejected.status, 'unverified', JSON.stringify(extra));
    assert.equal(rejected.verified, false);
  }
});

test('synchronous transport exceptions do not expose private native error details', async () => {
  const instance = createWindowsControl({ platform: 'win32', execFile() { throw new Error('PRIVATE WINDOWS ERROR'); } });
  await assert.rejects(instance.read(), error => !error.message.includes('PRIVATE') && /Fenster/.test(error.message));
  assert.equal((await instance.focus(target)).status, 'unverified');
});

test('invalid or incomplete target identities never invoke native focus', async () => {
  assert.equal(typeof createWindowsControl, 'function');
  const instance = createWindowsControl({ platform: 'win32', execFile() { assert.fail('invalid target executed'); } });
  for (const invalid of [null, {}, { id: '123456', pid: 42 }, { ...target, id: '1;calc' }, { ...target, id: '0' }, { ...target, id: '01' },
    { ...target, id: '9223372036854775808' }, { ...target, pid: 0 }, { ...target, pid: 1.5 }, { ...target, pid: 2147483648 },
    { ...target, processStartedAt: 'tomorrow' }, { ...target, command: 'calc' }]) {
    assert.equal((await instance.focus(invalid)).status, 'failed');
  }
  const controller = new AbortController(); controller.abort();
  assert.equal((await instance.focus(target, { signal: controller.signal })).status, 'failed');
});

test('inventory rejects inactive, stale or malformed native data instead of claiming no windows', async () => {
  for (const extra of [
    { activeDesktop: false }, { sessionId: 0 }, { observedAt: '2001-01-01T00:00:00.000Z' },
    { windows: null }, { windows: [{ ...window, pid: 0 }] }, { windows: [{ ...window, title: null }] },
    { windows: [{ ...window, processStartedAt: '' }] }, { kind: 'focus' }, { errorCode: 'DESKTOP_INACTIVE' },
  ]) await assert.rejects(backend({ kind: 'list', windows: [window], ...extra }).read(), /Fenster/);
});

test('pre-action identity rejection fails; unknown transport effects remain unverified and private errors are discarded', async () => {
  const rejection = await backend(focused({ accepted: false, identityMatched: false, errorCode: 'WINDOW_CHANGED' })).focus(target);
  assert.equal(rejection.status, 'failed');
  for (const output of ['not JSON', JSON.stringify({ error: 'PRIVATE WINDOW CONTENT' })]) {
    const instance = createWindowsControl({ platform: 'win32', execFile(exe, args, options, callback) { callback(null, output, 'PRIVATE STDERR'); } });
    const result = await instance.focus(target);
    assert.equal(result.status, 'unverified');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    await assert.rejects(instance.read(), /Fenster/);
  }
  const broken = createWindowsControl({ platform: 'win32', execFile(exe, args, options, callback) { callback(new Error('PRIVATE ERROR'), '', ''); } });
  assert.equal((await broken.focus(target)).status, 'unverified');
  await assert.rejects(broken.read(), /Fenster/);
  const unsupported = createWindowsControl({ platform: 'linux', execFile() { assert.fail('unsupported OS'); } });
  assert.equal((await unsupported.focus(target)).status, 'failed');
  await assert.rejects(unsupported.read(), /Windows/);
});
