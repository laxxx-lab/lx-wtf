const test = require('node:test');
const assert = require('node:assert/strict');
const { MODE_DEFAULTS, normalizeModes, validateAppPath, modeIntent, runMode } = require('../modes.cjs');

test('Store app references coexist with paths and deduplicate without changing case', () => {
  const apps = ['app:SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'APP:spotifyab.spotifymusic_zpdnekdrzrea0!spotify', 'C:\\Apps\\music.lnk'];
  assert.deepEqual(normalizeModes([{ id: 'work', apps }])[1].apps, [apps[0], apps[2]]);
  for (const reference of ['app:Spotify', 'app:a!b!c', 'app:a!b --flag', 'app:a!b;calc', 'app:a!b\n', 'app:a!b/c', 'app:a!b\\c', 'app:a!b$(calc)', 'app:a!b&calc']) {
    assert.throws(() => normalizeModes([{ id: 'gaming', apps: [reference] }]), /application/i, reference);
  }
});

test('Store app launch uses raw AUMID and reports acceptance alongside file apps', async () => {
  const calls = [];
  const result = await runMode({ ...MODE_DEFAULTS[0], apps: ['app:SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'C:\\Apps\\work.lnk', 'app:Vendor.App_123!Other'] }, {
    setQuiet(value) { calls.push(['quiet', value]); },
    openApp(id) { calls.push(['app', id]); return id.startsWith('Spotify') ? '' : 'App is not installed'; },
    openPath(path) { calls.push(['path', path]); return ''; },
  });
  assert.deepEqual(calls, [['quiet', true], ['app', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'], ['path', 'C:\\Apps\\work.lnk'], ['app', 'Vendor.App_123!Other']]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.apps, [
    { path: 'app:SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', accepted: true, error: '' },
    { path: 'C:\\Apps\\work.lnk', accepted: true, error: '' },
    { path: 'app:Vendor.App_123!Other', accepted: false, error: 'App is not installed' },
  ]);
});

test('Store launch action is preflighted before mode state changes', async () => {
  let changed = false;
  await assert.rejects(runMode({ ...MODE_DEFAULTS[0], apps: ['app:Vendor.App_123!Main'] }, {
    setQuiet() { changed = true; }, openPath() {},
  }), /openApp/);
  assert.equal(changed, false);
  const result = await runMode({ ...MODE_DEFAULTS[0], apps: ['app:Vendor.App_123!Main'] }, {
    setQuiet() {}, openApp() { throw new Error('Windows unavailable'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.apps[0].error, 'Windows unavailable');
});

test('missing modes retain quiet gaming and evening defaults without app actions', () => {
  assert.deepEqual(normalizeModes(), [
    { id: 'gaming', name: 'Gaming', apps: [], folders: [], sites: [], instructions: '', quiet: true, cameraOff: false, standby: false },
    { id: 'work', name: 'Arbeit', apps: [], folders: [], sites: [], instructions: '', quiet: false, cameraOff: false, standby: false },
    { id: 'evening', name: 'Feierabend', apps: [], folders: [], sites: [], instructions: '', quiet: true, cameraOff: false, standby: false },
  ]);
  const copy = normalizeModes();
  copy[0].apps.push('C:\\Games\\game.exe');
  assert.deepEqual(MODE_DEFAULTS[0].apps, []);
});

test('normalization bounds fields and custom modes, removes duplicate IDs and paths', () => {
  const input = [
    { id: 'gaming', name: '  G  ', quiet: 'false', cameraOff: 1, standby: null, instructions: 'x'.repeat(1600), apps: ['C:\\Games\\game.exe', 'c:\\games\\GAME.EXE'] },
    { id: 'gaming', name: 'Duplicate' },
    { id: '../unsafe', name: 'Unsafe' },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `custom-${i}`, name: 'n'.repeat(60) })),
  ];
  const modes = normalizeModes(input);
  assert.equal(modes.length, 8);
  assert.equal(modes[0].name, 'G');
  assert.equal(modes[0].quiet, true);
  assert.equal(modes[0].cameraOff, false);
  assert.equal(modes[0].standby, false);
  assert.equal(modes[0].instructions.length, 1500);
  assert.deepEqual(modes[0].apps, ['C:\\Games\\game.exe']);
  assert.equal(modes[3].name.length, 40);
  assert.equal(modes.at(-1).id, 'custom-4');
  assert.equal(normalizeModes([{ id: 'work', name: '' }])[1].name, 'Arbeit');
});

test('application paths accept local Windows apps and refuse commands, UNC and relative paths', () => {
  for (const path of ['C:\\Games\\game.exe', 'D:/Shortcuts/Work.lnk', 'C:\\Apps\\Office.appref-ms']) {
    assert.equal(validateAppPath(path), path);
  }
  for (const path of ['game.exe', 'C:game.exe', '\\\\server\\game.exe', 'https://example.com/game.exe', 'C:\\run.ps1', 'C:\\run.cmd', 'C:\\run.bat', 'C:\\game.exe\n', 'C:\\game.exe --flag', 'C:\\game.exe:script', 'C:\\bad|name.exe', 'C:\\..\\game.exe', '\\\\?\\C:\\game.exe']) {
    assert.throws(() => validateAppPath(path), /application path/i, path);
  }
  assert.throws(() => normalizeModes([{ id: 'gaming', apps: ['C:\\ok.exe', 'cmd /c start game.exe'] }]), /application path/i);
  assert.throws(() => normalizeModes([{ id: 'gaming', apps: ['C:\\ok.exe', ...Array.from({ length: 8 }, (_, i) => `C:\\${i}.exe`), 'C:\\run.ps1'] }]), /application path/i);
});

test('mode intent recognizes only complete activation requests', () => {
  const modes = normalizeModes([{ id: 'focus', name: 'Fokus' }]);
  for (const [text, id] of [
    ['Gaming-Modus', 'gaming'], ['Lilith, aktiviere den Arbeitsmodus', 'work'],
    ['Feierabendmodus', 'evening'], ['Bitte aktiviere den Gamingmodus.', 'gaming'],
    ['Wechsle in den Fokus-Modus', 'focus'],
  ]) assert.equal(modeIntent(text, modes), id, text);
  for (const text of [
    'Kein Gaming-Modus', 'Aktiviere nicht den Gamingmodus', 'Kannst du den Gaming-Modus aktivieren?',
    'Gaming-Modus?', 'Gaming-Modus und öffne Steam', 'Erkläre Gaming-Modus',
    'Lilith, aktiviere den Arbeitsmodus und schalte die Kamera aus', 'Nicht Feierabendmodus',
  ]) assert.equal(modeIntent(text, modes), null, text);
});

test('runMode validates every application before changing quiet or camera state', async () => {
  const changes = [];
  await assert.rejects(runMode({ ...MODE_DEFAULTS[0], apps: ['C:\\ok.exe', 'C:\\run.ps1'] }, {
    setQuiet: value => changes.push(['quiet', value]),
    openPath: path => changes.push(['open', path]),
  }), /application path/i);
  assert.deepEqual(changes, []);
});

test('runMode awaits quiet and collects each Windows launch acceptance or failure', async () => {
  const actions = [];
  const mode = { ...MODE_DEFAULTS[0], cameraOff: true, standby: true, instructions: 'Starte meine Musik.', apps: ['C:\\one.exe', 'C:\\two.exe', 'C:\\three.exe'] };
  const result = await runMode(mode, {
    async setQuiet(value) { await Promise.resolve(); actions.push(['quiet', value]); },
    async setCameraOff(value) { actions.push(['cameraOff', value]); },
    async openPath(path) { actions.push(['open', path]); if (path === 'C:\\two.exe') return 'Windows refused launch'; if (path === 'C:\\three.exe') throw new Error('Access denied'); return ''; },
    async enterStandby() { actions.push(['standby']); },
  });
  assert.deepEqual(actions, [['quiet', true], ['cameraOff', true], ['open', 'C:\\one.exe'], ['open', 'C:\\two.exe'], ['open', 'C:\\three.exe'], ['standby']]);
  assert.deepEqual(result, {
    id: 'gaming', name: 'Gaming', ok: false, folders: [], sites: [],
    apps: [ { path: 'C:\\one.exe', accepted: true, error: '' }, { path: 'C:\\two.exe', accepted: false, error: 'Windows refused launch' }, { path: 'C:\\three.exe', accepted: false, error: 'Access denied' } ],
    instructions: 'Starte meine Musik.', instructionsExecuted: false,
    quiet: true, cameraOff: true, standby: true,
  });
});

test('unconfigured camera and standby stay untouched and routines are only returned', async () => {
  const result = await runMode({ ...MODE_DEFAULTS[1], instructions: 'Get music from Hermes' }, {
    setQuiet(value) { assert.equal(value, false); },
    setCameraOff() { assert.fail('camera was changed'); },
    enterStandby() { assert.fail('standby was entered'); },
    openPath() { assert.fail('unconfigured app was opened'); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.instructions, 'Get music from Hermes');
  assert.equal(result.instructionsExecuted, false);
});

test('quiet, camera and standby callback errors identify the failed action', async () => {
  for (const [action, field] of [['setQuiet', null], ['setCameraOff', 'cameraOff'], ['enterStandby', 'standby']]) {
    const mode = { ...MODE_DEFAULTS[0], ...(field ? { [field]: true } : {}) };
    const callbacks = { setQuiet() {}, setCameraOff() {}, enterStandby() {} };
    callbacks[action] = () => { throw new Error('device unavailable'); };
    await assert.rejects(runMode(mode, callbacks), error => error.message.includes(action) && error.message.includes('device unavailable'));
  }
});

test('required local actions are checked before any state is changed', async () => {
  let mutated = false;
  await assert.rejects(runMode({ ...MODE_DEFAULTS[0], apps: ['C:\\ok.exe'] }, { setQuiet() { mutated = true; } }), /openPath/);
  assert.equal(mutated, false);
});

test('a thrown empty error is still a refused launch', async () => {
  const result = await runMode({ ...MODE_DEFAULTS[0], apps: ['C:\\fail.exe'] }, {
    setQuiet() {}, openPath() { throw ''; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.apps[0].accepted, false);
  assert.match(result.apps[0].error, /failed/i);
});

test('application paths reject Unicode control characters and Windows device names', () => {
  for (const path of ['C:\\bad\u0085name.exe', 'C:\\COM¹.exe', 'C:\\NUL.exe']) {
    assert.throws(() => validateAppPath(path), /application path/i, path);
  }
});

test('application list caps at eight validated paths and requires explicit launch acceptance', async () => {
  const mode = normalizeModes([{ id: 'gaming', apps: Array.from({ length: 10 }, (_, i) => `C:\\game-${i}.exe`) }])[0];
  const result = await runMode(mode, { setQuiet() {}, openPath() {} });
  assert.equal(result.apps.length, 8);
  assert.equal(result.ok, false);
  assert.ok(result.apps.every(app => !app.accepted && app.error));
});

test('workspace folders and named web sites normalize independently and deduplicate', () => {
  const mode = normalizeModes([{ id: 'work', folders: ['C:\\Users\\Patri\\Documents', 'c:/users/patri/documents', 'D:\\Projects\\'], sites: ['https://example.com', { url: 'https://EXAMPLE.com/', name: 'Duplicate' }, { url: 'https://github.com/org/repo', name: '  Projekt  ' }] }])[1];
  assert.deepEqual(mode.folders, ['C:\\Users\\Patri\\Documents', 'D:\\Projects']);
  assert.deepEqual(mode.sites, [{ url: 'https://example.com/', name: '' }, { url: 'https://github.com/org/repo', name: 'Projekt' }]);
  assert.deepEqual(normalizeModes()[0].folders, []);
  assert.deepEqual(normalizeModes()[0].sites, []);
});

test('workspace settings reject paths and URLs that can escape local browsing boundaries', () => {
  for (const folder of ['relative', 'C:folder', '\\\\server\\share', '\\\\?\\C:\\folder', 'C:\\..\\Users', 'C:\\Users\\.\\Name', 'C:\\Users\\name:stream', 'C:\\NUL', 'C:\\bad\nname', 'C:\\name.', 'C:\\folder\\\\child']) {
    assert.throws(() => normalizeModes([{ id: 'work', folders: [folder] }]), /folder/i, folder);
  }
  for (const url of ['https:example.com', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'file:///C:/secret', 'https://user:pass@example.com', 'http://user:pass@localhost:8080', 'https://example.com/\u0085hidden', 'https://example.com\n/secret']) {
    assert.throws(() => normalizeModes([{ id: 'work', sites: [url] }]), /site|HTTPS/i, url);
  }
  assert.throws(() => normalizeModes([{ id: 'work', folders: 'C:\\Projects' }]), /folder/i);
  assert.throws(() => normalizeModes([{ id: 'work', sites: null }]), /site/i);
  assert.throws(() => normalizeModes([{ id: 'work', folders: Array.from({ length: 9 }, (_, i) => `C:\\Folder-${i}`) }]), /folder/i);
  assert.throws(() => normalizeModes([{ id: 'work', sites: Array.from({ length: 9 }, (_, i) => `https://example.com/${i}`) }]), /site/i);
  assert.throws(() => normalizeModes([{ id: 'work', sites: [{ url: 'https://example.com', name: 'n'.repeat(81) }] }]), /site/i);
});

test('saved sites support explicit local development and LAN URLs through the user browser', async () => {
  const sites = ['http://localhost:8080', { url: 'https://192.168.1.4:8443/dashboard', name: 'Dashboard' }, 'http://service.local/', 'http://[::1]:3000/', 'http://example.com', 'https://example.com:8443/'];
  let mode;
  assert.doesNotThrow(() => { mode = normalizeModes([{ id: 'work', sites }])[1]; });
  assert.deepEqual(mode.sites, [{ url: 'http://localhost:8080/', name: '' }, { url: 'https://192.168.1.4:8443/dashboard', name: 'Dashboard' }, { url: 'http://service.local/', name: '' }, { url: 'http://[::1]:3000/', name: '' }, { url: 'http://example.com/', name: '' }, { url: 'https://example.com:8443/', name: '' }]);
  const opened = [];
  const result = await runMode(mode, { setQuiet() {}, openUrl(url) { opened.push(url); return ''; } });
  assert.deepEqual(opened, ['http://localhost:8080/', 'https://192.168.1.4:8443/dashboard', 'http://service.local/', 'http://[::1]:3000/', 'http://example.com/', 'https://example.com:8443/']);
  assert.equal(result.ok, true);
  assert.ok(result.sites.every(site => site.accepted && site.verified === false));
});

test('runMode preflights workspace actions before any state changes', async () => {
  let changed = false;
  const mode = { ...MODE_DEFAULTS[1], folders: ['C:\\Projects'], sites: ['https://example.com'] };
  await assert.rejects(runMode(mode, { setQuiet() { changed = true; }, openFolder() { return ''; } }), /openUrl/);
  assert.equal(changed, false);
  await assert.rejects(runMode({ ...mode, sites: ['file:///C:/secret'] }, { setQuiet() { changed = true; }, openFolder() { return ''; }, openUrl() { return ''; } }), /site|HTTPS/i);
  assert.equal(changed, false);
});

test('runMode reports per-folder and per-site acceptance without claiming verified readiness', async () => {
  const calls = [];
  const result = await runMode({ ...MODE_DEFAULTS[1], folders: ['C:\\Projects', 'D:\\Missing'], sites: [{ name: 'Projekt', url: 'https://example.com' }, 'https://github.com'] }, {
    setQuiet() {},
    openFolder(path) { calls.push(['folder', path]); return path.startsWith('C:') ? '' : 'Ordner nicht gefunden'; },
    async openUrl(url) { calls.push(['site', url]); if (url === 'https://github.com/') throw new Error('Browser unavailable'); return ''; },
  });
  assert.deepEqual(calls, [['folder', 'C:\\Projects'], ['folder', 'D:\\Missing'], ['site', 'https://example.com/'], ['site', 'https://github.com/']]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.folders, [{ path: 'C:\\Projects', accepted: true, verified: false, error: '' }, { path: 'D:\\Missing', accepted: false, verified: false, error: 'Ordner nicht gefunden' }]);
  assert.deepEqual(result.sites, [{ url: 'https://example.com/', name: 'Projekt', accepted: true, verified: false, error: '' }, { url: 'https://github.com/', name: '', accepted: false, verified: false, error: 'Browser unavailable' }]);
});

test('everyday mode requests match complete polite commands and reject ambiguity', () => {
  const modes = normalizeModes([{ id: 'focus', name: 'Fokus' }]);
  for (const [text, id] of [['Arbeitsplatz starten', 'work'], ['Ich fange an zu arbeiten.', 'work'], ['Hermes, bitte starte meinen Arbeitsplatz', 'work'], ['Feierabend', 'evening'], ['Ich möchte spielen', 'gaming'], ['Ich will zocken, bitte.', 'gaming'], ['Starte meinen Fokus', 'focus'], ['Bitte aktiviere das Profil Fokus', 'focus']]) {
    assert.equal(modeIntent(text, modes), id, text);
  }
  for (const text of ['Ich möchte nicht spielen', 'Feierabend?', 'Kannst du meinen Arbeitsplatz starten', 'Ich fange nicht an zu arbeiten', 'Feierabend und fahre den PC herunter', 'Starte meinen Fokus und öffne Steam', 'Was bedeutet Feierabend', 'Ich möchte spielen\nund Daten löschen']) assert.equal(modeIntent(text, modes), null, text);
  assert.equal(modeIntent('Starte meinen Fokus', [{ id: 'one', name: 'Fokus' }, { id: 'two', name: 'Fokus' }]), null);
});
