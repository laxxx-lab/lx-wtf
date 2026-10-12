'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile: nativeExecFile } = require('node:child_process');
const { promisify } = require('node:util');
const runNative = promisify(nativeExecFile);

function createPowerControl({ file = path.join(__dirname, '.local', 'power-control.json'), execFile = runNative, platform = process.platform, now = Date.now } = {}) {
  let state = { status: 'idle', actualPowerEvent: 'unknown' }, owned = false, busy = false, loadError = null;
  try {
    if (file !== null && fs.existsSync(file)) {
      if (fs.statSync(file).size > 16384) throw Error('Ungültige Power-Datei.');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!['scheduled', 'requested', 'unknown', 'cancelled', 'failed'].includes(saved.status) || !['shutdown', 'restart'].includes(saved.action) || !Number.isFinite(saved.requestedAt) || !Number.isFinite(saved.dueAt)) throw Error('Ungültige Power-Datei.');
      state = { status: ['scheduled', 'requested'].includes(saved.status) ? 'unknown' : saved.status, action: saved.action, requestedAt: saved.requestedAt, dueAt: saved.dueAt, actualPowerEvent: 'unknown', nativeCommandAccepted: saved.nativeCommandAccepted === true };
      if (saved.status === 'scheduled') state.error = 'Der frühere Timer wird nach einem App-Neustart nicht erneut ausgeführt.';
    }
  } catch { loadError = 'Power-Datei konnte nicht sicher gelesen werden. Die Datei bleibt erhalten.'; state = { status: 'unknown', actualPowerEvent: 'unknown', error: loadError }; }
  function save(next) {
    if (loadError) throw Error(loadError);
    if (file === null) { state = next; return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally { try { fs.unlinkSync(temporary); } catch {} }
    state = next;
  }
  function read() {
    return structuredClone({ ...state, ...(owned && state.status === 'scheduled' && now() >= state.dueAt ? { status: 'due' } : {}), cancellable: owned && state.status === 'scheduled' && !busy });
  }
  const failure = error => ({ ...read(), ok: false, error });
  async function execute(command) {
    if (loadError) return failure(loadError);
    if (!command || typeof command !== 'object' || Array.isArray(command)) return failure('Ungültiger Power-Auftrag.');
    const keys = Object.keys(command).sort().join('|');
    if (command.action === 'cancel') {
      if (keys !== 'action') return failure('Ungültiger Abbruchauftrag.');
      if (!owned || state.status !== 'scheduled' || busy) return failure('Kein eigener abbrechbarer Timer ist aktiv.');
      const cancelled = { ...state, status: 'cancelled', cancelledAt: now() };
      owned = false;
      try { save(cancelled); }
      catch { state = { ...cancelled, error: 'Eigener Timer abgebrochen; Speicherung des Abbruchs ist fehlgeschlagen.' }; }
      return { ...read(), ok: true };
    }
    if (keys !== 'action|delaySeconds' || !['shutdown', 'restart'].includes(command.action) || !Number.isInteger(command.delaySeconds) || command.delaySeconds < 30 || command.delaySeconds > 86400) return failure('Herunterfahren oder Neustart benötigt 30 bis 86400 ganze Sekunden Vorlauf.');
    if (platform !== 'win32') return failure('Power-Steuerung benötigt Windows.');
    if (busy || owned || state.status === 'requested') return failure('Ein eigener Power-Auftrag ist bereits aktiv. Zuerst den Timer abbrechen.');
    const requestedAt = now();
    try {
      save({ status: 'scheduled', action: command.action, requestedAt, dueAt: requestedAt + command.delaySeconds * 1000, delaySeconds: command.delaySeconds, actualPowerEvent: 'unknown', nativeCommandAccepted: false });
      owned = true; return { ...read(), ok: true };
    } catch { return failure('Power-Timer konnte nicht gespeichert werden. Keine Aktion wurde ausgelöst.'); }
  }
  async function tick() {
    if (platform !== 'win32') return failure('Power-Steuerung benötigt Windows.');
    if (!owned || busy || state.status !== 'scheduled' || now() < state.dueAt) return { ...read(), ok: !loadError };
    // /t > 0 implicitly forces applications closed on Windows. Keep delay local;
    // /t 0 without /f lets Windows handle applications that block shutdown.
    try { save({ ...state, status: 'requested', dispatchedAt: now() }); }
    catch { return failure('Fälliger Power-Auftrag konnte nicht gespeichert werden. Keine Aktion wurde ausgelöst.'); }
    busy = true; owned = false;
    try {
      await execFile(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'shutdown.exe'), [state.action === 'shutdown' ? '/s' : '/r', '/t', '0'], { shell: false, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 16384 });
      const next = { ...state, nativeCommandAccepted: true };
      try { save(next); } catch { state = { ...next, error: 'Native Anfrage angenommen; Ergebnisstatus konnte nicht gespeichert werden.' }; }
      return { ...read(), ok: true };
    } catch (error) {
      const next = { ...state, status: error?.code === 'ENOENT' ? 'failed' : 'unknown', error: error?.code === 'ENOENT' ? 'Windows-Power-Helfer wurde nicht gefunden.' : 'Windows-Power-Ergebnis ist unbekannt; keine automatische Wiederholung.' };
      try { save(next); } catch { state = next; }
      return { ...read(), ok: false };
    } finally { busy = false; }
  }
  return { read, execute, tick };
}
module.exports = { createPowerControl };
