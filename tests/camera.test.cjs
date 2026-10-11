'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CameraController } = require('../ui/camera.js');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks };
  const video = { readyState: 2, videoWidth: 1920, videoHeight: 1080, srcObject: null, async play() {} };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: type => { assert.equal(type, 'image/jpeg'); return 'data:image/jpeg;base64,aGVsbG8='; } };
  const states = [];
  const camera = new CameraController({ video, canvas, getUserMedia: async () => stream, enumerateDevices: async () => [], onState: state => states.push(state), ...options });
  return { camera, tracks, stream, video, canvas, states };
}

test('starts off, enumerates only video devices and captures bounded current JPEG frames', async t => {
  let constraints;
  const fixture = setup({ enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'mic' }, { kind: 'videoinput', deviceId: 'cam', label: 'Camera' }], getUserMedia: async value => { constraints = value; return fixture.stream; } });
  const { camera, video, canvas } = fixture;
  t.after(() => camera.disable());
  assert.equal(camera.active, false);
  assert.throws(() => camera.capture(), /camera|active/i);
  assert.deepEqual(await camera.devices(), [{ kind: 'videoinput', deviceId: 'cam', label: 'Camera' }]);
  await camera.enable('cam');
  assert.equal(camera.active, true);
  assert.equal(video.srcObject, fixture.stream);
  assert.equal(constraints.audio, false);
  assert.deepEqual(constraints.video.deviceId, { exact: 'cam' });
  assert.equal(camera.capture(), 'aGVsbG8=');
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 540);
  video.videoWidth = 1080; video.videoHeight = 1920;
  camera.capture();
  assert.equal(canvas.width, 405);
  assert.equal(canvas.height, 720);
  video.readyState = 1;
  assert.throws(() => camera.capture(), /ready|frame/i);
  video.readyState = 2; video.videoWidth = 0;
  assert.throws(() => camera.capture(), /ready|frame/i);
});

test('disable immediately releases tracks and cancels a late permission grant', async () => {
  const grant = deferred();
  const { camera, stream, tracks, video, states } = setup({ getUserMedia: () => grant.promise });
  const pending = camera.enable();
  const generation = camera.generation;
  camera.disable();
  assert.ok(camera.generation > generation);
  grant.resolve(stream);
  await pending;
  assert.equal(tracks[0].stopped, true);
  assert.equal(camera.active, false);
  assert.equal(video.srcObject, null);
  assert.equal(states.some(state => state.active), false);
});

test('an older permission grant cannot replace an already enabled replacement device', async t => {
  const oldGrant = deferred();
  const newGrant = deferred();
  let acquisitions = 0;
  const { camera, stream, tracks, video } = setup({ getUserMedia: () => (++acquisitions === 1 ? oldGrant.promise : newGrant.promise) });
  t.after(() => camera.disable());
  const oldEnable = camera.enable('old');
  const newEnable = camera.enable('new');
  const replacementTracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const replacement = { getTracks: () => replacementTracks };
  newGrant.resolve(replacement);
  assert.equal(await newEnable, true);
  oldGrant.resolve(stream);
  assert.equal(await oldEnable, false);
  assert.equal(tracks[0].stopped, true);
  assert.equal(replacementTracks[0].stopped, false);
  assert.equal(video.srcObject, replacement);
});

test('disable during video startup releases the stream and suppresses activation', async () => {
  const playback = deferred();
  const { camera, video, tracks, states } = setup();
  video.play = () => playback.promise;
  const pending = camera.enable();
  await settle();
  camera.disable();
  assert.equal(tracks[0].stopped, true);
  playback.resolve();
  assert.equal(await pending, false);
  assert.equal(states.some(state => state.active), false);
});

test('device switches release old tracks and do not publish old frame results', async t => {
  const analysis = deferred();
  const fixture = setup({ onFrame: () => analysis.promise });
  const { camera, tracks, states, video } = fixture;
  t.after(() => camera.disable());
  await camera.enable('first');
  const oldGeneration = camera.generation;
  const nextTracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const nextStream = { getTracks: () => nextTracks };
  camera.getUserMedia = async () => nextStream;
  await camera.enable('second');
  assert.equal(tracks[0].stopped, true);
  assert.equal(video.srcObject, nextStream);
  assert.ok(camera.generation > oldGeneration);
  analysis.resolve({ faces: [{ name: 'Old person' }] });
  await settle();
  assert.equal(states.some(state => state.result), false);
  camera.disable();
  assert.equal(nextTracks[0].stopped, true);
});

test('the frame loop never overlaps and reports current results', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const work = deferred();
  let calls = 0, seenGeneration, seenImage;
  const { camera, states } = setup({ onFrame: (image, generation) => { calls++; seenImage = image; seenGeneration = generation; return calls === 1 ? work.promise : Promise.resolve({ faces: [] }); } });
  t.after(() => camera.disable());
  await camera.enable();
  assert.equal(calls, 1);
  assert.equal(seenImage, 'aGVsbG8=');
  assert.equal(seenGeneration, camera.generation);
  t.mock.timers.tick(6000);
  assert.equal(calls, 1);
  work.resolve({ faces: [{ name: 'Pat' }] });
  await settle();
  assert.deepEqual(states.at(-1), { active: true, result: { faces: [{ name: 'Pat' }] } });
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(calls, 2);
  camera.disable();
  t.mock.timers.tick(6000);
  assert.equal(calls, 2);
});

test('permission and analysis failures surface through state and stale failures are discarded', async t => {
  const denied = setup({ getUserMedia: async () => { throw new Error('Permission denied'); } });
  await denied.camera.enable();
  assert.equal(denied.camera.active, false);
  assert.match(denied.states.at(-1).error, /Permission denied/);
  const work = deferred();
  const { camera, states } = setup({ onFrame: () => work.promise });
  t.after(() => camera.disable());
  await camera.enable();
  work.reject(new Error('Worker unavailable'));
  await settle();
  assert.equal(states.at(-1).active, true);
  assert.match(states.at(-1).error, /Worker unavailable/);
  const late = deferred();
  camera.onFrame = () => late.promise;
  await camera.enable();
  camera.disable();
  const count = states.length;
  late.reject(new Error('Obsolete failure'));
  await settle();
  assert.equal(states.length, count);
});
