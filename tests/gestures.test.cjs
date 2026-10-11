'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GestureController } = require('../ui/gesture-controller.js');

function hand(pose = 'palm', dx = 0, angle = 0) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  points[0] = { x: 0.5, y: 0.8, z: 0 };
  [[5, 0.40], [9, 0.47], [13, 0.54], [17, 0.61]].forEach(([base, x]) => {
    points[base] = { x, y: 0.65, z: 0 };
    points[base + 1] = { x, y: 0.53, z: 0 };
    points[base + 2] = { x: x + (pose === 'fist' ? 0.03 : 0), y: pose === 'fist' ? 0.60 : 0.43, z: 0 };
    points[base + 3] = { x, y: pose === 'fist' ? 0.68 : 0.34, z: 0 };
  });
  return points.map(p => ({ x: 0.5 + (p.x - 0.5) * Math.cos(angle) - (p.y - 0.7) * Math.sin(angle) + dx,
    y: 0.7 + (p.x - 0.5) * Math.sin(angle) + (p.y - 0.7) * Math.cos(angle), z: p.z }));
}
function result(pose = 'palm', dx = 0, angle = 0, score = 0.99) {
  return { landmarks: [hand(pose, dx, angle)], worldLandmarks: [], handedness: [[{ score, index: 0, categoryName: 'Right', displayName: 'Right' }]] };
}
function fixture(t, options = {}) {
  let time = 0, closes = 0, loads = 0;
  const actions = [], states = [], detections = [];
  const track = new EventTarget(); track.readyState = 'live'; track.enabled = true;
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0,
    srcObject: { getVideoTracks: () => [track] } };
  const detector = { detectForVideo(input, timestamp) { assert.equal(input, video); detections.push(timestamp); return result(); }, close() { closes++; } };
  const controller = new GestureController({ loadDetector: async () => { loads++; return detector; }, now: () => time,
    onAction: action => actions.push(action), onState: state => states.push(state), ...options });
  t.after(() => controller.disable());
  return { controller, actions, states, video, track, detector, detections,
    setTime(value) { time = value; }, get closes() { return closes; }, get loads() { return loads; } };
}
function hold(controller, pose, start = 0, dx = 0, angle = 0) {
  for (let elapsed = 0; elapsed <= 750; elapsed += 125) controller.process(result(pose, dx, angle), start + elapsed);
}

function spatialResult(pinchRatio=null,dx=0,dy=0,score=.99){
  const points=hand('fist');const open=hand('palm');for(const i of [5,6,7,8])points[i]=open[i];
  points[4]={x:points[8].x+(pinchRatio===null?.3:pinchRatio*.21),y:points[8].y,z:0};
  for(const point of points){point.x+=dx;point.y+=dy;}
  return {landmarks:[points],worldLandmarks:[],handedness:[[{score,categoryName:'Right'}]]};
}

test('confident index pointing emits bounded calibrated object coordinates after a short hold',async t=>{
  const spatial=[];const f=fixture(t,{onSpatial:value=>spatial.push(value),spatialBounds:{left:.2,right:.8,top:.2,bottom:.8}});await f.controller.enable(f.video);
  for(const time of [0,125,250])f.controller.process(spatialResult(),time);
  assert.equal(spatial.length,1);assert.equal(spatial[0].kind,'pointer');assert.equal(spatial[0].pinching,false);
  assert.ok(Math.abs(spatial[0].x-1/3)<.0001);assert.ok(Math.abs(spatial[0].y-.14/.6)<.0001);assert.ok(Number.isSafeInteger(spatial[0].generation));assert.ok(Number.isSafeInteger(spatial[0].sequence));assert.ok(Number.isFinite(spatial[0].at));
  f.controller.process(spatialResult(null,-.4,-.3),375);assert.equal(spatial.at(-1).x,0);assert.equal(spatial.at(-1).y,0);assert.deepEqual(f.actions,[]);
});

test('pinch uses entry and release hysteresis and cancels on insecure or missing hands',async t=>{
  const spatial=[];const f=fixture(t,{onSpatial:value=>spatial.push(value)});await f.controller.enable(f.video);
  for(const time of [0,125,250])f.controller.process(spatialResult(.18),time);
  assert.equal(spatial.at(-1)?.pinching,true);f.controller.process(spatialResult(.32),375);assert.equal(spatial.at(-1).pinching,true);
  f.controller.process(spatialResult(.48),500);assert.equal(spatial.at(-1).pinching,false);
  f.controller.process(spatialResult(.18,0,0,.75),625);assert.equal(spatial.at(-1).kind,'cancel');
  for(const time of [750,875,1000])f.controller.process(spatialResult(.18),time);assert.equal(spatial.at(-1).kind,'pointer');
  f.controller.process({landmarks:[],handedness:[]},1125);assert.equal(spatial.at(-1).kind,'cancel');
  assert.deepEqual(f.actions,[]);
});

test('spatial control cancels on frame gaps camera loss and disable without replaying old frames',async t=>{
  const spatial=[];const f=fixture(t,{onSpatial:value=>spatial.push(value)});await f.controller.enable(f.video);
  for(const time of [0,125,250])f.controller.process(spatialResult(.18),time);const generation=spatial.at(-1).generation;
  f.controller.process(spatialResult(.18),900);assert.equal(spatial.at(-1).kind,'cancel');
  for(const time of [1025,1150])f.controller.process(spatialResult(.18),time);assert.equal(spatial.at(-1).kind,'pointer');
  f.controller.process(spatialResult(.18),1000);assert.equal(spatial.at(-1).kind,'cancel');
  for(const time of [1275,1400,1525])f.controller.process(spatialResult(.18),time);f.controller.disable();assert.equal(spatial.at(-1).kind,'cancel');assert.ok(spatial.at(-1).generation>=generation);
  const length=spatial.length;f.controller.process(spatialResult(.18),1650);assert.equal(spatial.length,length);
});

test('worker results older than the gesture freshness limit cannot start spatial control',async t=>{
  const spatial=[];let release;const f=fixture(t,{onSpatial:value=>spatial.push(value)});await f.controller.enable(f.video);
  for(const time of [0,125,250])f.controller.process(spatialResult(.18),time);assert.equal(spatial.at(-1)?.kind,'pointer');
  f.setTime(375);f.detector.detectForVideo=()=>new Promise(resolve=>{release=resolve;});const pending=f.controller.tick();f.setTime(1000);release(spatialResult(.18));await pending;
  assert.equal(spatial.at(-1).kind,'cancel');assert.deepEqual(f.actions,[]);
});

test('a pinch must persist across frames before it starts grabbing and loss of new frames cancels it',async t=>{
  const spatial=[];const f=fixture(t,{onSpatial:value=>spatial.push(value)});await f.controller.enable(f.video);
  for(const time of [0,125,250])f.controller.process(spatialResult(),time);
  f.controller.process(spatialResult(.18),375);assert.equal(spatial.at(-1).pinching,false);
  f.controller.process(spatialResult(.18),500);assert.equal(spatial.at(-1).pinching,true);
  f.detector.detectForVideo=()=>spatialResult(.18);f.setTime(625);await f.controller.tick();assert.equal(spatial.at(-1).kind,'pointer');f.setTime(1000);await f.controller.tick();assert.equal(spatial.at(-1).kind,'cancel');
});

test('a worker that stops responding cannot leave an active spatial grab behind',async t=>{
  const spatial=[];let release;const f=fixture(t,{onSpatial:value=>spatial.push(value)});await f.controller.enable(f.video);
  for(const time of [0,125,250])f.controller.process(spatialResult(.18),time);
  f.setTime(375);f.detector.detectForVideo=()=>new Promise(resolve=>{release=resolve;});const pending=f.controller.tick();
  f.setTime(1000);await f.controller.tick();assert.equal(spatial.at(-1).kind,'cancel');release(spatialResult(.18));await pending;
});

test('gestures start off and held palms and fists fire once after a stable hold', async t => {
  const f = fixture(t);
  hold(f.controller, 'palm');
  assert.deepEqual(f.actions, []);
  assert.equal(f.controller.active, false);
  await f.controller.enable(f.video);
  for (let time = 0; time <= 625; time += 125) f.controller.process(result(), time);
  assert.deepEqual(f.actions, []);
  f.controller.process(result(), 750);
  for (let time = 875; time <= 4000; time += 125) f.controller.process(result(), time);
  assert.deepEqual(f.actions, ['workbench-show']);
  hold(f.controller, 'fist', 4125);
  assert.deepEqual(f.actions, ['workbench-show', 'workbench-hide']);
});

test('rotated hands keep their pose and cooldown requires leaving and reentering', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  hold(f.controller, 'palm', 0, 0, Math.PI / 2);
  hold(f.controller, 'fist', 875, 0, Math.PI);
  assert.deepEqual(f.actions, ['workbench-show']);
  for (let time = 1750; time <= 3500; time += 125) f.controller.process(result('fist', 0, Math.PI), time);
  assert.deepEqual(f.actions, ['workbench-show']);
  f.controller.process({ landmarks: [], handedness: [], worldLandmarks: [] }, 3625);
  hold(f.controller, 'fist', 3750, 0, Math.PI);
  assert.deepEqual(f.actions, ['workbench-show', 'workbench-hide']);
});

test('missing, low confidence, malformed and ambiguous hands reset the hold', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  const invalid = [ { landmarks: [], handedness: [], worldLandmarks: [] }, result('palm', 0, 0, 0.4),
    { ...result(), landmarks: [hand().slice(0, 20)] }, { ...result(), landmarks: [hand(), hand()] },
    { ...result(), handedness: [] }, { ...result(), landmarks: [hand().map((p, i) => i === 3 ? { ...p, z: NaN } : p)] } ];
  for (const [index, bad] of invalid.entries()) {
    const start = index * 1200;
    for (let elapsed = 0; elapsed <= 500; elapsed += 125) f.controller.process(result(), start + elapsed);
    f.controller.process(bad, start + 625);
    f.controller.process(result(), start + 750);
    assert.deepEqual(f.actions, []);
    f.controller.process({ landmarks: [] }, start + 875);
  }
  hold(f.controller, 'palm', 8000);
  assert.deepEqual(f.actions, ['workbench-show']);
});

test('deliberate horizontal open-palm swipes navigate once and jitter does not navigate', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  [0, -0.08, -0.16, -0.25].forEach((dx, i) => f.controller.process(result('palm', dx), i * 125));
  assert.deepEqual(f.actions, ['workbench-next']);
  for (let time = 500; time <= 2400; time += 125) f.controller.process(result('palm', -0.25), time);
  assert.deepEqual(f.actions, ['workbench-next']);
  f.controller.process({ landmarks: [] }, 2500);
  [0, 0.08, 0.16, 0.25].forEach((dx, i) => f.controller.process(result('palm', dx), 2625 + i * 125));
  assert.deepEqual(f.actions, ['workbench-next', 'workbench-previous']);
  f.controller.process({ landmarks: [] }, 3250);
  for (let i = 0; i < 35; i++) f.controller.process(result('palm', i % 2 ? 0.018 : -0.018), 3375 + i * 125);
  assert.equal(f.actions.filter(action => /next|previous/.test(action)).length, 2);
});

test('large diagonal motions, fists and discontinuous frame gaps cannot swipe', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  for (let i = 0; i < 4; i++) {
    const diagonal = result('palm', -i * 0.09);
    diagonal.landmarks[0].forEach(p => { p.y -= i * 0.09; });
    f.controller.process(diagonal, i * 125);
  }
  f.controller.process({ landmarks: [] }, 500);
  [0, -0.08, -0.16, -0.25].forEach((dx, i) => f.controller.process(result('fist', dx), 625 + i * 125));
  f.controller.process({ landmarks: [] }, 1125);
  f.controller.process(result(), 1250);
  f.controller.process(result('palm', -0.3), 2250);
  assert.deepEqual(f.actions, []);
});

test('inference uses the existing stream at eight fps and skips duplicate frames', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  await f.controller.enable(f.video);
  assert.equal(f.loads, 1);
  await f.controller.tick();
  f.setTime(125); await f.controller.tick();
  f.video.currentTime = 0.1; f.setTime(100); await f.controller.tick();
  f.video.currentTime = 0.2; f.setTime(125); await f.controller.tick();
  f.video.currentTime = 0.3; f.setTime(200); await f.controller.tick();
  f.video.currentTime = 0.4; f.setTime(250); await f.controller.tick();
  assert.deepEqual(f.detections, [0, 125, 250]);
  assert.equal(f.video.srcObject.getVideoTracks()[0], f.track);
});

test('disable and camera loss close the detector and cannot stop shared camera tracks', async t => {
  const f = fixture(t); let trackStops = 0; f.track.stop = () => { trackStops++; };
  await f.controller.enable(f.video); await f.controller.tick();
  f.track.readyState = 'ended'; f.track.dispatchEvent(new Event('ended'));
  assert.equal(f.controller.active, false);
  assert.equal(f.closes, 1);
  f.video.currentTime++; f.setTime(500); f.controller.tick(); hold(f.controller, 'palm', 500);
  assert.equal(f.detections.length, 1);
  assert.deepEqual(f.actions, []);
  assert.equal(trackStops, 0);
  assert.match(f.states.at(-1).status, /Kamera/);
});

test('switching camera streams stops gestures even when the old track is still live', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  f.video.srcObject = { getVideoTracks: () => [f.track] };
  f.controller.tick();
  assert.equal(f.controller.active, false);
  assert.equal(f.closes, 1);
});

test('disable during model loading disposes a late detector without restarting the loop', async t => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const f = fixture(t, { loadDetector: () => pending });
  const activation = f.controller.enable(f.video);
  f.controller.disable(); resolve(f.detector);
  assert.equal(await activation, false);
  assert.equal(f.closes, 1);
  assert.equal(f.controller.active, false);
  assert.equal(f.controller.timer, null);
  assert.equal(f.states.some(state => state.active), false);
});

test('camera must already be live and loading failures leave gestures off', async t => {
  const f = fixture(t); f.video.srcObject = null;
  assert.equal(await f.controller.enable(f.video), false);
  assert.equal(f.loads, 0);
  const failed = fixture(t, { loadDetector: async () => { throw new Error('model missing'); } });
  assert.equal(await failed.controller.enable(failed.video), false);
  assert.equal(failed.controller.active, false);
  assert.match(failed.states.at(-1).error, /model missing/);
  assert.match(failed.states.at(-1).status, /nicht verfügbar/);
});

test('camera loss during loading disposes the late detector and clears its listeners', async t => {
  let resolve;
  const pending = new Promise(yes => { resolve = yes; });
  const f = fixture(t, { loadDetector: () => pending });
  const activation = f.controller.enable(f.video);
  f.track.readyState = 'ended'; f.track.dispatchEvent(new Event('ended'));
  resolve(f.detector);
  assert.equal(await activation, false);
  assert.equal(f.closes, 1);
  assert.equal(f.controller.timer, null);
  const states = f.states.length;
  f.track.dispatchEvent(new Event('ended'));
  assert.equal(f.states.length, states);
});

test('an inference failure closes the detector and cancels future work', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  f.detector.detectForVideo = () => { throw new Error('inference failed'); };
  f.controller.tick();
  assert.equal(f.controller.active, false);
  assert.equal(f.closes, 1);
  assert.equal(f.controller.timer, null);
  assert.match(f.states.at(-1).error, /inference failed/);
  assert.deepEqual(f.actions, []);
});

test('the frame timer stops after disabling without affecting the existing video stream', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(t); await f.controller.enable(f.video);
  const stream = f.video.srcObject;
  for (let i = 1; i <= 3; i++) {
    f.video.currentTime = i * 0.125; f.setTime(i * 125); t.mock.timers.tick(125);
    await Promise.resolve();
  }
  assert.equal(f.detections.length, 3);
  f.controller.disable();
  f.video.currentTime = 1; f.setTime(1000); t.mock.timers.tick(1000);
  assert.equal(f.detections.length, 3);
  assert.equal(f.video.srcObject, stream);
  assert.equal(f.closes, 1);
});

test('a renderer action can disable gestures safely during its callback', async t => {
  let controller;
  const f = fixture(t, { onAction: () => controller.disable() });
  controller = f.controller; await controller.enable(f.video);
  assert.doesNotThrow(() => hold(controller, 'palm'));
  assert.equal(controller.active, false);
  assert.equal(f.states.at(-1).status, 'Gesten aus');
});

test('asynchronous worker detections never overlap and late results after disabling cannot act', async t => {
  let resolve, calls = 0;
  const work = new Promise(yes => { resolve = yes; });
  const f = fixture(t); await f.controller.enable(f.video);
  f.detector.detectForVideo = () => { calls++; return work; };
  const detection = f.controller.tick();
  f.setTime(125); f.video.currentTime = 0.125; await f.controller.tick();
  assert.equal(calls, 1);
  f.controller.disable(); resolve(result()); await detection;
  assert.deepEqual(f.actions, []);
  assert.equal(f.controller.active, false);
  assert.equal(f.controller.timer, null);
});

test('asynchronous detections drive the same stable hold actions as synchronous results', async t => {
  const f = fixture(t); await f.controller.enable(f.video);
  f.detector.detectForVideo = async () => result();
  for (let i = 0; i <= 6; i++) {
    f.setTime(i * 125); f.video.currentTime = i * 0.125;
    await f.controller.tick();
  }
  assert.deepEqual(f.actions, ['workbench-show']);
});
