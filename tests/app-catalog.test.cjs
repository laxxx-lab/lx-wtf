const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const catalog = require('../app-catalog.cjs');

test('catalog validates bounded AUMIDs without commands or arbitrary protocols', () => {
  for (const id of ['SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'Vendor-App_name!Main.App-1']) {
    assert.equal(catalog.validateAppId(id), id);
  }
  for (const id of ['', null, 'Spotify', 'app:Vendor!Main', 'Vendor!Main!Other', 'Vendor!Main\\Other', 'Vendor!Main/Other', 'Vendor!Main&calc', 'Vendor!Main;calc', 'Vendor!Main --flag', 'Vendor!Main\n', '.!Main', 'Vendor!..', 'a'.repeat(130) + '!Main']) {
    assert.throws(() => catalog.validateAppId(id), /application/i, String(id));
  }
});

test('catalog normalizes native app rows and desktop shortcuts, drops malformed entries and deduplicates', () => {
  assert.deepEqual(catalog.normalizeAppCatalog([
    { Name: ' Spotify ', AppID: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' },
    { name: 'Duplicate', id: 'app:spotifyab.spotifymusic_zpdnekdrzrea0!spotify' },
    { name: 'Work', id: 'C:\\Start Menu\\Work.lnk', ignored: 'private' },
    { name: 'Duplicate shortcut', id: 'c:/start menu/WORK.LNK' },
    { Name: 'Unsafe', AppID: 'steam://rungameid/123' },
    { Name: 'Opaque desktop ID', AppID: 'Chrome' },
    { Name: 'Command', AppID: 'Vendor!Main&calc' },
    { name: '', id: 'app:Vendor!Main' }, null,
    { name: 'Bad\nName', id: 'app:Vendor!Main' },
  ]), [
    { id: 'app:SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', name: 'Spotify' },
    { id: 'C:\\Start Menu\\Work.lnk', name: 'Work' },
  ]);
  assert.deepEqual(catalog.normalizeAppCatalog({ Name: 'Single', AppID: 'Vendor!Main' }), [{ id: 'app:Vendor!Main', name: 'Single' }]);
  assert.deepEqual(catalog.normalizeAppCatalog(null), []);
  const many = Array.from({ length: 600 }, (_, index) => ({ name: `App ${index}`, id: `app:Vendor!Main${index}` }));
  assert.equal(catalog.normalizeAppCatalog(many).length, 500);
});

test('catalog reads only a fixed local script and preserves UTF-8 JSON', async () => {
  const result = await catalog.readAppCatalog({ platform: 'win32', windowsDir: 'C:\\Windows', execFile(exe, args, options, callback) {
    assert.equal(exe, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args.slice(0, -1), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']);
    assert.equal(args.at(-1), path.join(__dirname, '../scripts/list_apps.ps1'));
    assert.equal(options.windowsHide, true);
    assert.equal(options.encoding, 'utf8');
    assert.ok(options.timeout > 0 && options.timeout <= 15000);
    callback(null, '\uFEFF[{"Name":"Müsik","AppID":"Vendor!Music"}]', '');
  } });
  assert.deepEqual(result, [{ id: 'app:Vendor!Music', name: 'Müsik' }]);
});

test('catalog read fails explicitly on unsupported systems, script failures and invalid JSON', async () => {
  await assert.rejects(catalog.readAppCatalog({ platform: 'linux', execFile() { assert.fail('script was executed'); } }), /Windows/);
  await assert.rejects(catalog.readAppCatalog({ platform: 'win32', execFile(exe, args, options, callback) { callback(new Error('timed out'), '', ''); } }), /catalog.*timed out/i);
  await assert.rejects(catalog.readAppCatalog({ platform: 'win32', execFile(exe, args, options, callback) { callback(null, 'not JSON', ''); } }), /catalog.*JSON/i);
});

test('catalog launch passes one validated AppsFolder argument and resolves spawn acceptance', async () => {
  const result = await catalog.launchCatalogApp('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', {
    platform: 'win32', windowsDir: 'C:\\Windows', spawn(exe, args, options) {
      assert.equal(exe, 'C:\\Windows\\explorer.exe');
      assert.deepEqual(args, ['shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify']);
      assert.equal(options.shell, false);
      assert.equal(options.stdio, 'ignore');
      const child = new EventEmitter(); child.unref = () => {};
      queueMicrotask(() => child.emit('spawn')); return child;
    },
  });
  assert.equal(result, '');
});

test('catalog launch rejects invalid references before spawning and surfaces local process failures', async () => {
  await assert.rejects(catalog.launchCatalogApp('Vendor!Main&calc', { platform: 'win32', spawn() { assert.fail('invalid input was launched'); } }), /application/i);
  await assert.rejects(catalog.launchCatalogApp('Vendor!Main', { platform: 'linux', spawn() { assert.fail('non-Windows launch attempted'); } }), /Windows/);
  await assert.rejects(catalog.launchCatalogApp('Vendor!Main', { platform: 'win32', spawn() {
    const child = new EventEmitter(); child.unref = () => {};
    queueMicrotask(() => child.emit('error', new Error('Access denied'))); return child;
  } }), /Access denied/);
});
