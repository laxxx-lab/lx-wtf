'use strict';
const path = require('node:path');
const { execFile: nativeExecFile } = require('node:child_process');
const { normalizeAppCatalog, readAppCatalog } = require('./app-catalog.cjs');
const { validateAppReference } = require('./modes.cjs');
const {audioOutputIntent,validAudioTarget}=require('./audio-output.cjs');
const {bluetoothIntent,validBluetoothCommand}=require('./bluetooth.cjs');
const SPOTIFY_SOURCES = new Set(['Spotify.exe', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify']);
const key = value => typeof value === 'string' ? value.replace(/\//g, '\\').toLocaleLowerCase('de') : '';
const nameKey = value => value.normalize('NFKC').toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();

function commandText(text, enabled) {
  if (!enabled || typeof text !== 'string' || !text.trim() || text.length > 500 || /[\p{Cc}\p{Cf}?;:]/u.test(text)) return null;
  const value = nameKey(text).replace(/[.!]$/, '').trim().replace(/^bitte /, '').replace(/ bitte$/, '');
  return /\b(?:nicht|kein|keine|keinen|keinem|keiner|niemals)\b/.test(value) ? null : value;
}

function parseDirectCommand(text, { apps = [], enabled = true } = {}) {
  const value = commandText(text, enabled);
  if (!value) return null;
  const output=audioOutputIntent(text);if(output)return output;
  const bluetooth=bluetoothIntent(text);if(bluetooth)return bluetooth;
  if (/^(?:lauter|(?:mach|mache) (?:es|den ton|die lautstärke) lauter|(?:erhöhe|erhoehe) (?:die )?lautstärke|lautstärke erhöhen)$/.test(value)) return { type: 'volume', action: 'up' };
  if (/^(?:leiser|(?:mach|mache) (?:es|den ton|die lautstärke) leiser|(?:senke|verringere) (?:die )?lautstärke|lautstärke verringern)$/.test(value)) return { type: 'volume', action: 'down' };
  if (/^(?:ton aus|stummschalten|(?:schalte|schalt) (?:den )?ton aus|(?:schalte|schalt) (?:den )?ton stumm)$/.test(value)) return { type: 'volume', action: 'mute' };
  if (/^(?:ton an|(?:schalte|schalt) (?:den )?ton an|stummschaltung aufheben)$/.test(value)) return { type: 'volume', action: 'unmute' };
  const volume = /^(?:(?:stelle|stell|setze) (?:die )?)?lautstärke auf (\d{1,3})(?: ?%| prozent)?$/.exec(value);
  if (volume) return Number(volume[1]) <= 100 ? { type: 'volume', action: 'set', value: Number(volume[1]) } : null;
  const media = [
    ['play', /^(?:spiele spotify|spiele (?:musik )?in spotify|spotify (?:abspielen|weiter)|setze spotify fort)$/],
    ['pause', /^(?:pausiere spotify|spotify (?:pausieren|pause)|pausiere (?:die )?musik in spotify)$/],
    ['next', /^(?:nächster (?:titel|song) in spotify|spotify nächster (?:titel|song)|überspringe (?:den )?(?:titel|song) in spotify)$/],
    ['previous', /^(?:vorheriger (?:titel|song) in spotify|spotify vorheriger (?:titel|song))$/],
  ];
  for (const [action, pattern] of media) if (pattern.test(value)) return { type: 'spotify', action };
  const opening = /^(?:öffne|oeffne|starte|öffnen|starten) (.+)$/.exec(value);
  if (!opening) return null;
  const matches = normalizeAppCatalog(apps).filter(app => nameKey(app.name) === opening[1]);
  return matches.length === 1 ? { type: 'app.open', app: matches[0] } : null;
}

const exactKeys = (object, keys) => Object.keys(object).sort().join('|') === keys.sort().join('|');
function validDirectCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
  if(command.type==='audio.output')return exactKeys(command,['type','target'])&&validAudioTarget(command.target);
  if(command.type==='bluetooth')return validBluetoothCommand(command);
  if (command.type === 'volume') return exactKeys(command, ['type', 'action']) && ['up', 'down', 'mute', 'unmute'].includes(command.action)
    || exactKeys(command, ['type', 'action', 'value']) && command.action === 'set' && Number.isInteger(command.value) && command.value >= 0 && command.value <= 100;
  if (command.type === 'spotify') return exactKeys(command, ['type', 'action']) && ['play', 'pause', 'next', 'previous'].includes(command.action);
  if (command.type !== 'app.open' || !exactKeys(command, ['type', 'app']) || !command.app || !exactKeys(command.app, ['id', 'name'])
    || typeof command.app.name !== 'string' || !command.app.name.trim() || command.app.name.length > 200 || /[\p{Cc}\p{Cf}]/u.test(command.app.name)) return false;
  try { return validateAppReference(command.app.id) === command.app.id && normalizeAppCatalog([command.app]).length === 1; } catch { return false; }
}

function verified(command, evidence, startedAt) {
  if (!evidence || evidence.accepted !== true || evidence.kind !== command.type || evidence.error !== undefined || evidence.effectUnknown === true || !Number.isSafeInteger(evidence.observedAt)
    || evidence.observedAt < startedAt - 1000 || evidence.observedAt > Date.now() + 1000) return false;
  if (command.type === 'app.open') {
    const window = evidence.window;
    return evidence.installed === true && key(evidence.reference || '') === key(command.app.id) && Number.isInteger(evidence.desktopSessionId) && evidence.desktopSessionId > 0
      && window && window.visible === true && /^\d+$/.test(window.handle) && Number(window.handle) > 0 && Number.isInteger(window.processId) && window.processId > 0
      && window.sessionId === evidence.desktopSessionId && key(window.matchedReference || '') === key(command.app.id);
  }
  if (evidence.action !== command.action) return false;
  const { before, after } = evidence;
  if (!before || !after) return false;
  if (command.type === 'volume') {
    if (![before.level, after.level].every(level => typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 100)
      || typeof before.muted !== 'boolean' || typeof after.muted !== 'boolean') return false;
    if ((before.endpointId !== undefined || after.endpointId !== undefined) && (typeof before.endpointId !== 'string' || !before.endpointId || after.endpointId !== before.endpointId)) return false;
    if (command.action === 'mute' || command.action === 'unmute') return after.muted === (command.action === 'mute');
    const expected = command.action === 'set' ? command.value : Math.max(0, Math.min(100, before.level + (command.action === 'up' ? 10 : -10)));
    return Math.abs(after.level - expected) <= 1 && after.muted === before.muted;
  }
  if (!SPOTIFY_SOURCES.has(before.sourceAppId) || after.sourceAppId !== before.sourceAppId || !['Playing', 'Paused', 'Stopped'].includes(before.playbackState)
    || !['Playing', 'Paused', 'Stopped'].includes(after.playbackState)) return false;
  if (command.action === 'play') return after.playbackState === 'Playing';
  if (command.action === 'pause') return after.playbackState === 'Paused';
  return typeof before.title === 'string' && before.title.trim() && typeof after.title === 'string' && after.title.trim()
    && typeof before.artist === 'string' && typeof after.artist === 'string' && (before.title !== after.title || before.artist !== after.artist)
    && after.playbackState === before.playbackState;
}

function successMessage(command, evidence) {
  if (command.type === 'app.open') return `${command.app.name} ist geöffnet.`;
  if (command.type === 'volume') return command.action === 'mute' ? 'Ton ist stummgeschaltet.' : command.action === 'unmute' ? 'Ton ist eingeschaltet.' : `Lautstärke ist bei ${Math.round(evidence.after.level)} Prozent.`;
  return { play: 'Spotify spielt.', pause: 'Spotify ist pausiert.', next: 'Spotify hat zum nächsten Titel gewechselt.', previous: 'Spotify hat zum vorherigen Titel gewechselt.' }[command.action];
}

function createDirectCommands({ getApps, audio, bluetooth, execFile = nativeExecFile, platform = process.platform, windowsDir = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  const apps = getApps || (() => readAppCatalog({ execFile, platform, windowsDir }));
  async function run(command, { signal, observeOnly = false } = {}) {
      const failure = (message, evidence = null) => ({ status: 'failed', verified: false, message, evidence });
      try { command = structuredClone(command); } catch { return failure('Ungültiger direkter Befehl.'); }
      if (!validDirectCommand(command)) return failure('Ungültiger direkter Befehl.');
      if (signal?.aborted) return failure('Direkter Befehl wurde abgebrochen.');
      if (platform !== 'win32') return failure('Direkte Befehle benötigen Windows.');
      if(command.type==='bluetooth')return bluetooth?(observeOnly?bluetooth.observe(command,{signal}):bluetooth.execute(command,{signal})):failure('Bluetooth-Steuerung ist nicht verfügbar.');
      if(command.type==='audio.output'){
        if(!audio)return failure('Windows-Audioausgabe ist nicht verfügbar.');
        if(['speakers','headphones'].includes(command.target))return failure('Bitte Boxen und Kopfhörer einmal in den Audio-Einstellungen zuordnen.');
        return observeOnly?audio.observe(command.target,{signal}):audio.switch(command.target,{signal});
      }
      try {
        if (command.type === 'app.open' && !normalizeAppCatalog(await apps()).some(app => key(app.id) === key(command.app.id) && nameKey(app.name) === nameKey(command.app.name))) return failure('Die Anwendung ist nicht mehr im bekannten App-Katalog.');
      } catch (error) { return failure('App-Katalog ist nicht verfügbar: ' + error.message); }
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'scripts', 'direct_commands.ps1'), '-Kind', command.type];
      if (command.type === 'app.open') args.push('-Reference', command.app.id);
      else args.push('-Action', command.action);
      if (command.action === 'set') args.push('-Value', String(command.value));
      if (observeOnly) args.push('-ObserveOnly');
      const startedAt = Date.now();
      let evidence;
      try {
        const output = await new Promise((resolve, reject) => execFile(path.win32.join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args,
          { windowsHide: true, shell: false, encoding: 'utf8', timeout: 18000, maxBuffer: 256 * 1024, ...(signal ? { signal } : {}) }, (error, stdout) => error ? reject(error) : resolve(stdout)));
        evidence = JSON.parse(output.replace(/^\uFEFF/, '').trim());
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Ungültige native Antwort.');
      } catch (error) { return { status: observeOnly ? 'failed' : 'unverified', verified: false, message: 'Direkter Befehl konnte nicht geprüft werden: ' + error.message.slice(0, 300), evidence: { effectUnknown: !observeOnly, startedAt } }; }
      if (evidence.accepted !== true) return failure('Direkter Befehl wurde nicht ausgeführt: ' + (typeof evidence.error === 'string' ? evidence.error.slice(0, 400) : 'Windows hat die Aktion abgelehnt.'), evidence);
      const relativeObservation = observeOnly && (command.type === 'volume' && ['up', 'down'].includes(command.action) || command.type === 'spotify' && ['next', 'previous'].includes(command.action));
      const complete = !relativeObservation && Boolean(verified(command, evidence, startedAt));
      return { status: complete ? 'completed' : 'unverified', verified: complete, message: complete ? successMessage(command, evidence) : 'Die Aktion wurde angefordert; ihre Wirkung ist nicht sicher bestätigt.', evidence };
  }
  return {
    async parse(text, { enabled = true } = {}) {
      const quick = parseDirectCommand(text, { enabled });
      if(quick?.type==='bluetooth'&&quick.name){try{const selected=await bluetooth?.resolve(quick.name);return selected?{type:'bluetooth',action:quick.action,deviceId:selected.id}:null;}catch{return null;}}
      if(quick?.type==='audio.output'&&audio){try{return {...quick,target:(await audio.resolve(quick.target)).id};}catch{return quick;}}
      if (quick || !commandText(text, enabled) || !/^(?:öffne|oeffne|starte|öffnen|starten) /.test(commandText(text, enabled))) return quick;
      try { return parseDirectCommand(text, { enabled, apps: await apps() }); } catch { return null; }
    },
    execute: run,
    observe: (command, options = {}) => run(command, { ...options, observeOnly: true }),
  };
}

module.exports = { parseDirectCommand, validDirectCommand, createDirectCommands };
