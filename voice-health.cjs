'use strict';

const STARTUP_MS = 10000;
const FRAME_MS = 5000;
const OUTPUT_MS = 30000;
const COOLDOWN_MS = 30000;
const RETRY_WINDOW_MS = 300000;
const REPAIR_KINDS = new Set(['microphone', 'audio-output', 'engines', 'gateway']);
const boolean = value => typeof value === 'boolean' ? value : null;
const timestamp = (value, at) => Number.isFinite(value) && value >= 0 && value <= at ? value : null;

function createVoiceHealth({ now = Date.now } = {}) {
  let observation, firstAt, microphoneSince, frameCount, frameAt, pendingOutputAt;
  let sequence = 0, attempts = [], receipt = null;

  function clear() {
    observation = firstAt = microphoneSince = frameCount = frameAt = pendingOutputAt = null;
    sequence = 0;
    attempts = [];
    receipt = null;
  }
  clear();

  function observe(value = {}) {
    const at = now();
    const input = value && typeof value === 'object' ? value : {};
    const previous = observation;
    firstAt ??= timestamp(input.startedAt, at) ?? at;
    const expected = boolean(input.expectedMicrophone);
    if (expected === true && previous?.expectedMicrophone !== true) {
      microphoneSince = previous ? at : firstAt;
      frameCount = frameAt = null;
    }
    if (expected !== true) microphoneSince = frameCount = frameAt = null;
    const count = Number.isSafeInteger(input.frameCount) && input.frameCount >= 0 ? input.frameCount : null;
    const pcmAt = timestamp(input.frameAt, at);
    if (expected === true && count !== null) {
      // A heartbeat may repeat a timestamp; only actual counter progress renews PCM evidence.
      if (count > 0 && (frameCount === null || count > frameCount)) frameAt = pcmAt;
      if (frameCount !== null && count < frameCount) frameAt = null;
      frameCount = count;
    }
    const ttsPending = boolean(input.ttsPending);
    if (ttsPending === true && previous?.ttsPending !== true) pendingOutputAt = at;
    if (ttsPending !== true) pendingOutputAt = null;
    observation = {
      privacyLocked: boolean(input.privacyLocked), expectedMicrophone: expected,
      microphoneActive: boolean(input.microphoneActive), rendererAt: timestamp(input.rendererAt, at),
      audioContextState: ['running', 'suspended', 'closed'].includes(input.audioContextState) ? input.audioContextState : null,
      connected: boolean(input.connected),
      engines: { stt: boolean(input.engines?.stt), voice: boolean(input.engines?.voice),
        live: boolean(input.engines?.live), vad: boolean(input.engines?.vad), wake: boolean(input.engines?.wake) },
      busy: boolean(input.busy), speaking: boolean(input.speaking), ttsPending,
      lastPcmAt: timestamp(input.lastPcmAt, at), repairing: boolean(input.repairing),
      capturing: input.capturing === true, transcribing: input.transcribing === true,
    };
    sequence += 1;
    if (receipt && !receipt.recovered && observation.privacyLocked === false && sequence > receipt.sequence && at > receipt.at) {
      const check = snapshot().checks.find(item => item.key === receipt.kind);
      if (check?.state === 'ready' && (receipt.kind !== 'microphone' || frameAt > receipt.at) &&
          (receipt.kind !== 'audio-output' || observation.audioContextState === 'running')) receipt.recovered = true;
    }
    return snapshot();
  }

  function snapshot() {
    if (!observation) return { state: 'starting', summary: 'Sprachbereitschaft wird noch gemessen.', checks: [], repair: null };
    const value = observation, at = now();
    if (value.privacyLocked !== false) return {
      state: 'private', summary: 'Privatsphäre schützt Mikrofon und Sprachdiagnose.',
      checks: [{ key: 'privacy', state: 'private', summary: 'Keine automatische Sprachreparatur.' }], repair: null,
    };
    const grace = at - firstAt < STARTUP_MS;
    const rendererFresh = value.rendererAt !== null && at - value.rendererAt <= STARTUP_MS;
    const checks = [];
    const add = (key, state, summary) => checks.push({ key, state, summary });
    const waiting = grace ? 'starting' : 'degraded';
    add('renderer', rendererFresh ? 'ready' : waiting,
      rendererFresh ? 'Renderer meldet sich.' : 'Aktuelle Renderer-Messung fehlt.');

    let microphoneReady = value.expectedMicrophone === false;
    if (value.expectedMicrophone === true) microphoneReady = rendererFresh && value.microphoneActive === true &&
      frameAt !== null && at - frameAt <= FRAME_MS;
    const microphoneGrace = grace || (microphoneSince !== null && at - microphoneSince < STARTUP_MS && frameAt === null);
    add('microphone', microphoneReady ? 'ready' : microphoneGrace ? 'starting' : 'degraded',
      value.expectedMicrophone === false ? 'Mikrofon ist absichtlich aus.' : microphoneReady ?
        'Mikrofon liefert Audiobloecke; Stille ist gesund.' : 'Erwartete Mikrofon-Audiobloecke fehlen.');

    const outputNotRequired = value.audioContextState === null && value.expectedMicrophone === false &&
      value.ttsPending === false && value.speaking === false;
    add('audio-output', value.audioContextState === 'running' || outputNotRequired ? 'ready' : waiting,
      outputNotRequired ? 'Audioausgabe wird derzeit nicht benoetigt.' : value.audioContextState === 'running' ? 'Audioausgabe ist bereit.' :
        value.audioContextState === 'suspended' ? 'Audioausgabe ist angehalten.' : 'Audioausgabe ist noch nicht bestaetigt.');
    const engineValues = [value.engines.stt, value.engines.voice];
    for (const worker of ['live', 'vad', 'wake']) {
      if (value.engines[worker] !== null) engineValues.push(value.engines[worker]);
    }
    const enginesReady = engineValues.every(state => state === true);
    add('engines', enginesReady ? 'ready' : waiting,
      enginesReady ? 'Sprachmodelle sind bereit.' : 'Sprachmodell-Bereitschaft fehlt.');
    add('gateway', value.connected === true ? 'ready' : waiting,
      value.connected === true ? 'Hermes-Transport ist verbunden.' : 'Hermes-Transport ist noch nicht verbunden.');
    const outputAt = Math.max(pendingOutputAt ?? at, value.lastPcmAt ?? 0);
    const outputWaiting = value.ttsPending === true && !value.speaking && at - outputAt >= OUTPUT_MS;
    add('speech-output', outputWaiting ? 'degraded' : 'ready',
      outputWaiting ? 'Sprachausgabe wartet noch auf Audiobloecke.' : 'Kein beobachteter Audioblock-Stau.');

    const state = checks.some(check => check.state === 'degraded') ? 'degraded' :
      checks.some(check => check.state === 'starting') ? 'starting' : 'ready';
    add('conversation', value.busy === true ? 'starting' : 'ready',
      value.busy === true ? 'Auftrag laeuft; Modellwartezeit belegt keinen Verbindungsfehler.' : 'Gesprächsspur ist frei.');
    if (receipt) add('repair', receipt.recovered ? 'ready' : at - receipt.at < STARTUP_MS ? 'starting' : 'degraded',
      receipt.recovered ? 'Sprachreparatur durch neue Bereitschaftsmessung bestaetigt.' :
        'Reparatur versucht; neue Bereitschaftsmessung steht aus.');

    const idle = value.busy === false && value.speaking === false && value.repairing === false &&
      !value.capturing && !value.transcribing;
    let repair = null;
    if (!grace && idle) {
      if (value.expectedMicrophone === true && !microphoneReady && !microphoneGrace && rendererFresh &&
          (value.microphoneActive === false || (value.microphoneActive === true && frameAt !== null && at - frameAt > FRAME_MS) ||
            (value.microphoneActive === true && frameCount === 0))) {
        repair = { kind: 'microphone', reason: 'Erwarteter Eingang liefert keine aktuellen Audiobloecke.' };
      } else if (rendererFresh && value.audioContextState === 'suspended') {
        repair = { kind: 'audio-output', reason: 'Vorhandene Audioausgabe ist angehalten.' };
      } else if (engineValues.includes(false)) {
        repair = { kind: 'engines', reason: 'Ein erwartetes Sprachmodell ist nicht bereit.' };
      } else if (value.connected === false) {
        repair = { kind: 'gateway', reason: 'Hermes-Transport ist getrennt; Verbindung darf wieder angefragt werden.' };
      }
    }
    const recent = attempts.filter(attempt => at - attempt.at < RETRY_WINDOW_MS);
    if (repair && (recent.length >= 3 || recent.some(attempt => attempt.kind === repair.kind && at - attempt.at < COOLDOWN_MS))) repair = null;
    return { state, summary: state === 'ready' ? 'Sprachweg ist bereit.' : state === 'starting' ?
      'Sprachweg startet; Bereitschaft wird gemessen.' : 'Sprachweg braucht Aufmerksamkeit.', checks, repair };
  }

  function recordRepair(kind) {
    if (!REPAIR_KINDS.has(kind) || snapshot().repair?.kind !== kind) return false;
    const at = now();
    attempts = attempts.filter(attempt => at - attempt.at < RETRY_WINDOW_MS);
    attempts.push({ kind, at });
    receipt = { kind, at, sequence, recovered: false };
    return true;
  }

  return { observe, snapshot, clear, recordRepair };
}

module.exports = { createVoiceHealth };
