const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let direct;
try { direct = require('../direct-commands.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; direct = {}; }
const apps = [{ id: 'app:SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', name: 'Spotify' }, { id: 'C:\\Start Menu\\Chrome.lnk', name: 'Google Chrome' }];

test('complete German commands resolve known apps and allowlisted volume/media actions', () => {
  assert.equal(typeof direct.parseDirectCommand, 'function', 'direct command parser is missing');
  const cases = [
    ['Öffne Spotify.', { type: 'app.open', app: apps[0] }],
    ['Bitte starte Google Chrome', { type: 'app.open', app: apps[1] }],
    ['lauter', { type: 'volume', action: 'up' }],
    ['Mach den Ton leiser!', { type: 'volume', action: 'down' }],
    ['Stelle die Lautstärke auf 0 Prozent', { type: 'volume', action: 'set', value: 0 }],
    ['Lautstärke auf 100%', { type: 'volume', action: 'set', value: 100 }],
    ['Schalte den Ton aus', { type: 'volume', action: 'mute' }],
    ['Ton an', { type: 'volume', action: 'unmute' }],
    ['Spiele Musik in Spotify', { type: 'spotify', action: 'play' }],
    ['Pausiere Spotify', { type: 'spotify', action: 'pause' }],
    ['Nächster Titel in Spotify', { type: 'spotify', action: 'next' }],
    ['Vorheriger Titel in Spotify', { type: 'spotify', action: 'previous' }],
  ];
  for (const [text, expected] of cases) assert.deepEqual(direct.parseDirectCommand(text, { apps }), expected, text);
});

test('questions, negation, multiple actions, searches, fuzzy/unknown apps and invalid values stay with Hermes', () => {
  assert.equal(typeof direct.parseDirectCommand, 'function');
  for (const text of [
    'Kannst du Spotify öffnen?', 'Wie öffne ich Spotify', 'Öffne Spotify?', 'Öffne Spotify nicht',
    'Öffne Spotify und mach es lauter', 'Öffne Spotify; öffne Chrome', 'Spiele Yesterday in Spotify',
    'Suche Musik in Spotify', 'Öffne Spotifi', 'Öffne unbekannt', 'Lautstärke auf 101%',
    'Lautstärke auf -1', 'Lautstärke auf 2.5', 'Lautstärke auf 50 und dann mute',
    'Öffne Spotify\n', null, '', 'x'.repeat(501),
  ]) assert.equal(direct.parseDirectCommand(text, { apps }), null, String(text));
  assert.equal(direct.parseDirectCommand('lauter', { apps, enabled: false }), null);
  assert.equal(direct.parseDirectCommand('Öffne Spotify', { apps: [...apps, { id: 'C:\\Other\\Spotify.exe', name: 'Spotify' }] }), null);
  assert.equal(direct.parseDirectCommand('Öffne Unsafe', { apps: [{ id: 'cmd.exe & calc', name: 'Unsafe' }] }), null);
});

function backend(output, checks = () => {}) {
  return direct.createDirectCommands({ getApps: () => apps, platform: 'win32', windowsDir: 'C:\\Windows', execFile(exe, args, options, callback) {
    checks(exe, args, options); callback(null, JSON.stringify({ observedAt: Date.now(), ...output }), '');
  } });
}

test('volume completes only when fresh native readback matches requested state', async () => {
  assert.equal(typeof direct.createDirectCommands, 'function');
  const command = { type: 'volume', action: 'set', value: 42 };
  const result = await backend({ kind: 'volume', action: 'set', accepted: true, before: { level: 20, muted: false }, after: { level: 42, muted: false } }, (exe, args, options) => {
    assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../scripts/direct_commands.ps1'), '-Kind', 'volume', '-Action', 'set', '-Value', '42']);
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true); assert.ok(options.timeout > 0 && options.timeout < 20000);
  }).execute(command);
  assert.equal(result.status, 'completed'); assert.equal(result.verified, true);
  const unchanged = await backend({ kind: 'volume', action: 'set', accepted: true, before: { level: 20, muted: false }, after: { level: 20, muted: false } }).execute(command);
  assert.equal(unchanged.status, 'unverified'); assert.equal(unchanged.verified, false);
  const stale = await backend({ kind: 'volume', action: 'set', accepted: true, observedAt: 1, before: { level: 20, muted: false }, after: { level: 42, muted: false } }).execute(command);
  assert.equal(stale.status, 'unverified');
});

test('app launch requires a fresh catalog entry and matching desktop window', async () => {
  const command = { type: 'app.open', app: apps[0] };
  const evidence = { kind: 'app.open', reference: apps[0].id, accepted: true, installed: true, desktopSessionId: 2, window: { handle: '123', processId: 18, sessionId: 2, visible: true, matchedReference: apps[0].id } };
  assert.equal((await backend(evidence).execute(command)).status, 'completed');
  assert.equal((await backend({ ...evidence, window: null }).execute(command)).status, 'unverified');
  assert.equal((await backend({ ...evidence, window: { ...evidence.window, sessionId: 0 } }).execute(command)).status, 'unverified');
  const missing = direct.createDirectCommands({ getApps: () => [], execFile() { assert.fail('stale app launch'); } });
  assert.equal((await missing.execute(command)).status, 'failed');
});

test('Spotify completion requires exact source, playback state and track change for skip commands', async () => {
  const media = { kind: 'spotify', action: 'next', accepted: true, before: { sourceAppId: 'Spotify.exe', playbackState: 'Playing', title: 'Before', artist: 'Artist' }, after: { sourceAppId: 'Spotify.exe', playbackState: 'Playing', title: 'After', artist: 'Artist' } };
  assert.equal((await backend(media).execute({ type: 'spotify', action: 'next' })).status, 'completed');
  assert.equal((await backend({ ...media, after: media.before }).execute({ type: 'spotify', action: 'next' })).status, 'unverified');
  assert.equal((await backend({ ...media, after: { ...media.after, sourceAppId: 'chrome.exe' } }).execute({ type: 'spotify', action: 'next' })).status, 'unverified');
  assert.equal((await backend({ ...media, action: 'pause' }).execute({ type: 'spotify', action: 'pause' })).status, 'unverified');
  assert.equal((await backend({ ...media, action: 'pause', after: { ...media.after, playbackState: 'Paused' } }).execute({ type: 'spotify', action: 'pause' })).status, 'completed');
});

test('invalid commands, transport errors and malformed responses fail without shell execution or success', async () => {
  const guarded = direct.createDirectCommands({ getApps: () => apps, execFile() { assert.fail('unsafe command executed'); } });
  for (const command of [{ type: 'shell', action: 'calc' }, { type: 'volume', action: 'set', value: 101 }, { type: 'volume', action: 'up;calc' }, { type: 'app.open', app: { id: 'cmd.exe & calc', name: 'Spotify' } }]) assert.equal((await guarded.execute(command)).status, 'failed');
  const failed = direct.createDirectCommands({ platform: 'win32', execFile(exe, args, options, callback) { callback(new Error('timeout'), '', ''); } });
  assert.equal((await failed.execute({ type: 'volume', action: 'up' })).status, 'unverified');
  const malformed = direct.createDirectCommands({ platform: 'win32', execFile(exe, args, options, callback) { callback(null, 'not JSON', ''); } });
  assert.equal((await malformed.execute({ type: 'volume', action: 'up' })).status, 'unverified');
});

test('durable commands reject additional keys and observation never repeats an action', async () => {
  assert.equal(typeof direct.validDirectCommand, 'function');
  assert.equal(direct.validDirectCommand({ type: 'volume', action: 'up', injected: 'calc' }), false);
  assert.equal(direct.validDirectCommand({ type: 'app.open', app: { ...apps[0], extra: 'argument' } }), false);
  assert.equal(direct.validDirectCommand({ type: 'volume', action: 'set', value: 0 }), true);
  const instance = backend({ kind: 'volume', action: 'set', accepted: true, before: { level: 42, muted: false }, after: { level: 42, muted: false } }, (exe, args) => assert.equal(args.at(-1), '-ObserveOnly'));
  assert.equal(typeof instance.observe, 'function');
  assert.equal((await instance.observe({ type: 'volume', action: 'set', value: 42 })).status, 'completed');
  assert.equal((await backend({ kind: 'volume', action: 'up', accepted: true, before: { level: 100, muted: false }, after: { level: 100, muted: false } }).observe({ type: 'volume', action: 'up' })).status, 'unverified');
});

test('volume and Spotify parsing remains local without reading the application catalog', async () => {
  const instance = direct.createDirectCommands({ getApps() { assert.fail('media/volume read app catalog'); } });
  assert.deepEqual(await instance.parse('lauter'), { type: 'volume', action: 'up' });
  assert.deepEqual(await instance.parse('Pausiere Spotify'), { type: 'spotify', action: 'pause' });
});

test('native errors or malformed window identity never become a completion claim', async () => {
  const volume = { kind: 'volume', action: 'set', accepted: true, before: { level: 20, muted: false, endpointId: 'old' }, after: { level: 42, muted: false, endpointId: 'new' } };
  assert.equal((await backend(volume).execute({ type: 'volume', action: 'set', value: 42 })).status, 'unverified');
  assert.equal((await backend({ ...volume, after: { ...volume.after, endpointId: 'old' }, error: 'device changed', effectUnknown: true }).execute({ type: 'volume', action: 'set', value: 42 })).status, 'unverified');
  const badWindow = { kind: 'app.open', reference: 1, accepted: true, installed: true, desktopSessionId: 2, window: { handle: '123', processId: 18, sessionId: 2, visible: true, matchedReference: 2 } };
  assert.equal((await backend(badWindow).execute({ type: 'app.open', app: apps[0] })).status, 'unverified');
});

test('native transport uses the validated command snapshot across asynchronous catalog lookup', async () => {
  let release;
  const command = { type: 'app.open', app: { ...apps[0] } };
  const instance = direct.createDirectCommands({ platform: 'win32', getApps: () => new Promise(resolve => { release = () => resolve(apps); }), execFile(exe, args, options, callback) {
    assert.equal(args.at(-1), apps[0].id);
    callback(null, JSON.stringify({ kind: 'app.open', accepted: true, installed: true, reference: apps[0].id, observedAt: Date.now(), desktopSessionId: 2, window: null }), '');
  } });
  const result = instance.execute(command);
  command.app.id = 'C:\\Unlisted\\Unsafe.exe';
  release();
  assert.equal((await result).status, 'unverified');
});
