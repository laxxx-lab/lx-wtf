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

test('a return before five minutes of observed absence preserves attendance', () => {
  const presence = new CameraPresence();
  for (const now of [0, 2000, 4000]) presence.observe([known('Pat')], now);
  presence.observe([], 6000);
  presence.observe([], 200000);
  for (const now of [305999, 306000, 306001]) assert.deepEqual(presence.observe([known('Pat')], now), []);
});

test('a return after five minutes of observed absence needs three fresh frames', () => {
  const presence = new CameraPresence();
  for (const now of [0, 2000, 4000]) presence.observe([known('Pat')], now);
  presence.observe([], 6000);
  assert.deepEqual(presence.observe([known('Pat')], 306000), []);
  assert.deepEqual(presence.observe([known('Pat')], 308000), []);
  assert.deepEqual(presence.observe([known('Pat')], 310000), ['Pat']);
});

test('absence starts with a missing observation even after a long camera outage', () => {
  const presence = new CameraPresence({ confirmHits: 1 });
  assert.deepEqual(presence.observe([known('Pat')], 0), ['Pat']);
  assert.deepEqual(presence.observe([known('Pat')], 900000), []);
  presence.observe([], 1800000);
  assert.deepEqual(presence.observe([known('Pat')], 1800001), []);
});

test('missing frames throughout five minutes allow a confirmed new arrival', () => {
  const presence = new CameraPresence({ confirmHits: 1 });
  assert.deepEqual(presence.observe([known('Pat')], 0), ['Pat']);
  presence.observe([], 2000);
  presence.observe([], 301999);
  assert.deepEqual(presence.observe([known('Pat')], 302000), ['Pat']);
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

test('confirmed absence is sufficient without an additional default greeting cooldown', () => {
  const presence = new CameraPresence({ confirmHits: 1, absenceMs: 10 });
  assert.deepEqual(presence.observe([known('Pat')], 0), ['Pat']);
  presence.observe([], 2);
  assert.deepEqual(presence.observe([known('Pat')], 12), ['Pat']);
});

test('reset clears incomplete confirmation without re-greeting a present person', () => {
  const presence = new CameraPresence();
  presence.observe([known('Pat')], 0);
  presence.observe([known('Pat')], 1);
  presence.reset();
  assert.deepEqual(presence.observe([known('Pat')], 2), []);
  assert.deepEqual(presence.observe([known('Pat')], 3), []);
  assert.deepEqual(presence.observe([known('Pat')], 4), ['Pat']);
  presence.reset();
  for (const now of [5, 6, 7]) assert.deepEqual(presence.observe([known('Pat')], now), []);
  presence.reset();
  for (const now of [900000, 900001, 900002]) assert.deepEqual(presence.observe([known('Pat')], now), []);
});

test('reset discards absence evidence when camera observations were stopped', () => {
  const presence = new CameraPresence({ confirmHits: 1 });
  assert.deepEqual(presence.observe([known('Pat')], 0), ['Pat']);
  presence.observe([], 2000);
  presence.reset();
  assert.deepEqual(presence.observe([known('Pat')], 900000), []);
  presence.observe([], 902000);
  assert.deepEqual(presence.observe([known('Pat')], 1202000), ['Pat']);
});

test('each known profile is confirmed independently', () => {
  const presence = new CameraPresence({ confirmHits: 2 });
  assert.deepEqual(presence.observe([known('Pat'), known('Sam')], 0), []);
  assert.deepEqual(presence.observe([known('Pat')], 1), ['Pat']);
  assert.deepEqual(presence.observe([known('Pat'), known('Sam')], 2), []);
  assert.deepEqual(presence.observe([known('Sam')], 3), ['Sam']);
});
