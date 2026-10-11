'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CameraPresence } = require('../camera-presence.cjs');
const known = name => ({ name });

test('known names need three consecutive frames; duplicate detections count once', () => {
  const presence = new CameraPresence();
  assert.deepEqual(presence.observe([known('Pat'), known('Pat')], 0), []);
  assert.deepEqual(presence.observe([known('Pat')], 2000), []);
  assert.deepEqual(presence.observe([known('Pat')], 4000), ['Pat']);
  assert.deepEqual(presence.observe([known('Pat')], 200000), []);
});

test('unknown faces never greet and a gap breaks an unconfirmed streak', () => {
  const presence = new CameraPresence();
  presence.observe([known('Pat')], 0);
  presence.observe([known('Pat')], 2000);
  for (const now of [4000, 6000, 8000]) {
    assert.deepEqual(presence.observe([{ name: null }, { name: '' }, { name: 'Pat', known: false }], now), []);
  }
  assert.deepEqual(presence.observe([known('Pat')], 10000), []);
  assert.deepEqual(presence.observe([known('Pat')], 12000), []);
  assert.deepEqual(presence.observe([known('Pat')], 14000), ['Pat']);
});

test('short gaps preserve attendance, confirmed elapsed absence allows a later arrival', () => {
  const presence = new CameraPresence();
  for (const now of [0, 2000, 4000]) presence.observe([known('Pat')], now);
  presence.observe([], 6000);
  assert.deepEqual(presence.observe([known('Pat')], 22000), []);
  presence.observe([], 24000);
  presence.observe([], 44000);
  assert.deepEqual(presence.observe([known('Pat')], 130000), []);
  assert.deepEqual(presence.observe([known('Pat')], 132000), []);
  assert.deepEqual(presence.observe([known('Pat')], 134000), ['Pat']);
});

test('a brief absence cannot bypass cooldown or trigger a delayed greeting during attendance', () => {
  const presence = new CameraPresence({ confirmHits: 1, absenceMs: 10, cooldownMs: 100 });
  assert.deepEqual(presence.observe([known('Pat')], 0), ['Pat']);
  presence.observe([], 10);
  assert.deepEqual(presence.observe([known('Pat')], 20), []);
  assert.deepEqual(presence.observe([known('Pat')], 120), []);
  presence.observe([], 130);
  assert.deepEqual(presence.observe([known('Pat')], 140), ['Pat']);
});

test('reset clears confirmation and attendance but retains anti-spam cooldown', () => {
  const presence = new CameraPresence({ cooldownMs: 100 });
  presence.observe([known('Pat')], 0);
  presence.observe([known('Pat')], 1);
  presence.reset();
  assert.deepEqual(presence.observe([known('Pat')], 2), []);
  assert.deepEqual(presence.observe([known('Pat')], 3), []);
  assert.deepEqual(presence.observe([known('Pat')], 4), ['Pat']);
  presence.reset();
  for (const now of [5, 6, 7]) assert.deepEqual(presence.observe([known('Pat')], now), []);
  presence.reset();
  presence.observe([known('Pat')], 105);
  presence.observe([known('Pat')], 106);
  assert.deepEqual(presence.observe([known('Pat')], 107), ['Pat']);
});

test('each known profile is confirmed independently', () => {
  const presence = new CameraPresence({ confirmHits: 2 });
  assert.deepEqual(presence.observe([known('Pat'), known('Sam')], 0), []);
  assert.deepEqual(presence.observe([known('Pat')], 1), ['Pat']);
  assert.deepEqual(presence.observe([known('Pat'), known('Sam')], 2), []);
  assert.deepEqual(presence.observe([known('Sam')], 3), ['Sam']);
});
