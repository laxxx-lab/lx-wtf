'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let health;
try { health = require('../voice-health.cjs'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; health = {}; }

function setup() {
  let time = 20000;
  assert.equal(typeof health.createVoiceHealth, 'function');
  const monitor = health.createVoiceHealth({ now: () => time });
  const sample = (changes = {}) => ({
    startedAt: 0, privacyLocked: false, expectedMicrophone: true,
    microphoneActive: true, frameCount: 100, frameAt: time, rendererAt: time,
    audioContextState: 'running', connected: true,
    engines: { stt: true, voice: true, live: null }, busy: false, speaking: false,
    ttsPending: false, lastPcmAt: null, repairing: false, ...changes,
  });
  return { monitor, sample, advance: delta => { time += delta; } };
}

test('startup waits for observed readiness before proposing repairs', () => {
  const { monitor, sample, advance } = setup();
  const starting = { startedAt: 20000, microphoneActive: false, frameCount: 0,
    frameAt: null, connected: false, engines: { stt: false, voice: false, live: null } };
  assert.equal(monitor.observe(sample(starting)).state, 'starting');
  assert.equal(monitor.snapshot().repair, null);
  advance(10001);
  assert.equal(monitor.observe(sample(starting)).state, 'degraded');
  assert.equal(monitor.snapshot().repair.kind, 'microphone');
});

test('quiet input with actual arriving frames is healthy without amplitude data', () => {
  const { monitor, sample, advance } = setup();
  assert.equal(monitor.observe(sample({ level: 0 })).state, 'ready');
  advance(12000);
  const result = monitor.observe(sample({ frameCount: 101, level: 0 }));
  assert.equal(result.state, 'ready');
  assert.equal(result.repair, null);
});

test('fresh heartbeat cannot conceal a starved microphone with an unchanged frame count', () => {
  const { monitor, sample, advance } = setup();
  monitor.observe(sample());
  advance(6000);
  const result = monitor.observe(sample());
  assert.equal(result.state, 'degraded');
  assert.equal(result.repair.kind, 'microphone');
  assert.equal(result.checks.find(check => check.key === 'microphone').state, 'degraded');
});

test('stale renderer, disabled microphone and active utterances never request microphone repair', () => {
  for (const changes of [
    { rendererAt: 1 }, { busy: true }, { capturing: true },
    { transcribing: true }, { speaking: true }, { repairing: true },
  ]) {
    const { monitor, sample } = setup();
    const result = monitor.observe(sample({ microphoneActive: false, frameAt: null, frameCount: 0, ...changes }));
    assert.equal(result.repair, null, JSON.stringify(changes));
  }
  const { monitor, sample } = setup();
  assert.equal(monitor.observe(sample({ expectedMicrophone: false, microphoneActive: false,
    frameCount: 0, frameAt: null })).state, 'ready');
});

test('privacy suppresses repairs and projects no IDs, transcript or untrusted summaries', () => {
  const { monitor, sample } = setup();
  const result = monitor.observe(sample({ privacyLocked: true, deviceId: 'secret-device',
    text: 'private conversation', summary: 'untrusted summary', microphoneActive: false }));
  assert.equal(result.state, 'private');
  assert.equal(result.repair, null);
  assert.equal(monitor.recordRepair('microphone'), false);
  assert.doesNotMatch(JSON.stringify(result), /secret-device|private conversation|untrusted/);
  result.checks[0].summary = 'modified';
  assert.doesNotMatch(JSON.stringify(monitor.snapshot()), /modified/);
});

test('repair attempts have cooldown and require new observed frames for a recovery receipt', () => {
  const { monitor, sample, advance } = setup();
  const missing = { microphoneActive: false, frameCount: 0, frameAt: null };
  monitor.observe(sample(missing));
  assert.equal(monitor.recordRepair('microphone'), true);
  assert.equal(monitor.snapshot().checks.find(check => check.key === 'repair').state, 'starting');
  advance(1000);
  assert.equal(monitor.observe(sample(missing)).repair, null);
  assert.equal(monitor.recordRepair('microphone'), false);
  monitor.observe(sample({ frameAt: 20000 }));
  assert.notEqual(monitor.snapshot().checks.find(check => check.key === 'repair').state, 'ready');
  advance(1000);
  monitor.observe(sample({ frameCount: 101 }));
  assert.equal(monitor.snapshot().checks.find(check => check.key === 'repair').state, 'ready');
  advance(29000);
  assert.equal(monitor.observe(sample(missing)).repair.kind, 'microphone');
});

test('repeated failed repair suggestions are bounded across the retry window', () => {
  const { monitor, sample, advance } = setup();
  const missing = { microphoneActive: false, frameCount: 0, frameAt: null };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    monitor.observe(sample(missing));
    assert.equal(monitor.recordRepair('microphone'), true);
    advance(31000);
  }
  assert.equal(monitor.observe(sample(missing)).repair, null);
  assert.equal(monitor.recordRepair('microphone'), false);
  advance(300000);
  assert.equal(monitor.observe(sample(missing)).repair.kind, 'microphone');
});

test('output suspension, explicit engine failure and transport disconnection suggest only bounded kinds', () => {
  for (const [changes, kind] of [
    [{ audioContextState: 'suspended' }, 'audio-output'],
    [{ engines: { stt: false, voice: true, live: null } }, 'engines'],
    [{ connected: false }, 'gateway'],
  ]) {
    const { monitor, sample } = setup();
    assert.equal(monitor.observe(sample(changes)).repair.kind, kind);
    assert.equal(monitor.recordRepair('arbitrary-command'), false);
  }
});

test('slow model responses are working, not a transport failure or automatic repair trigger', () => {
  const { monitor, sample, advance } = setup();
  monitor.observe(sample({ busy: true }));
  advance(180000);
  const result = monitor.observe(sample({ busy: true, frameCount: 200 }));
  assert.equal(result.state, 'ready');
  assert.equal(result.repair, null);
  assert.equal(result.checks.find(check => check.key === 'gateway').state, 'ready');
  assert.equal(result.checks.find(check => check.key === 'conversation').state, 'starting');
});

test('pending output without PCM has a separate diagnosis and never restarts a working model', () => {
  const { monitor, sample, advance } = setup();
  monitor.observe(sample({ ttsPending: true }));
  advance(31000);
  const result = monitor.observe(sample({ frameCount: 200, ttsPending: true }));
  assert.equal(result.state, 'degraded');
  assert.equal(result.checks.find(check => check.key === 'gateway').state, 'ready');
  assert.equal(result.checks.find(check => check.key === 'speech-output').state, 'degraded');
  assert.equal(result.repair, null);
});

test('clear removes evidence and cooldown without treating absent observations as ready', () => {
  const { monitor, sample } = setup();
  monitor.observe(sample({ microphoneActive: false }));
  monitor.recordRepair('microphone');
  monitor.clear();
  assert.equal(monitor.snapshot().state, 'starting');
  assert.equal(monitor.snapshot().repair, null);
  assert.equal(monitor.observe(sample()).state, 'ready');
});

test('unknown and future observations cannot authorize a repair or claim microphone readiness', () => {
  const { monitor, sample } = setup();
  const result = monitor.observe(sample({ frameAt: 1000000, rendererAt: 1000000,
    engines: { stt: null, voice: true, live: null } }));
  assert.notEqual(result.state, 'ready');
  assert.equal(result.repair, null);
});

test('an unopened output context is healthy when microphone and speech output are intentionally off', () => {
  const { monitor, sample } = setup();
  const result = monitor.observe(sample({ expectedMicrophone: false, microphoneActive: false,
    frameCount: 0, frameAt: null, audioContextState: null }));
  assert.equal(result.state, 'ready');
  assert.equal(result.checks.find(check => check.key === 'audio-output').state, 'ready');
  assert.equal(result.repair, null);
  assert.equal(monitor.observe(sample({ expectedMicrophone: false, audioContextState: null,
    ttsPending: true })).checks.find(check => check.key === 'audio-output').state, 'degraded');
});

test('turning audio demand off cannot confirm a resumed AudioContext', () => {
  const { monitor, sample, advance } = setup();
  monitor.observe(sample({ audioContextState: 'suspended' }));
  assert.equal(monitor.recordRepair('audio-output'), true);
  advance(1000);
  monitor.observe(sample({ expectedMicrophone: false, audioContextState: null }));
  assert.notEqual(monitor.snapshot().checks.find(check => check.key === 'repair').state, 'ready');
  advance(1000);
  monitor.observe(sample({ frameCount: 101 }));
  assert.equal(monitor.snapshot().checks.find(check => check.key === 'repair').state, 'ready');
});

test('required VAD and wake workers cannot be hidden by healthy STT and voice HTTP services', () => {
  for (const worker of ['vad', 'wake']) {
    const { monitor, sample, advance } = setup();
    const engines = { stt: true, voice: true, live: true, vad: true, wake: true, [worker]: false };
    const result = monitor.observe(sample({ engines }));
    assert.equal(result.state, 'degraded', worker);
    assert.equal(result.checks.find(check => check.key === 'engines').state, 'degraded', worker);
    assert.equal(result.repair.kind, 'engines', worker);
    assert.equal(monitor.recordRepair('engines'), true);
    advance(1000);
    monitor.observe(sample({ frameCount: 101, engines: { ...engines, [worker]: true } }));
    assert.equal(monitor.snapshot().checks.find(check => check.key === 'repair').state, 'ready', worker);
  }
});

test('disabled or omitted optional speech workers do not require repair and busy work blocks restarts', () => {
  for (const engines of [
    { stt: true, voice: true, live: null, vad: null, wake: null },
    { stt: true, voice: true },
  ]) {
    const { monitor, sample } = setup();
    assert.equal(monitor.observe(sample({ engines })).state, 'ready');
    assert.equal(monitor.snapshot().repair, null);
  }
  const { monitor, sample } = setup();
  const result = monitor.observe(sample({ busy: true,
    engines: { stt: true, voice: true, live: true, vad: false, wake: null } }));
  assert.equal(result.state, 'degraded');
  assert.equal(result.repair, null);
});
