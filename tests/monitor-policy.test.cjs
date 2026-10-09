'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMonitorPolicy } = require('../monitor-policy.cjs');

test('CPU and memory need three high readings and do not repeat unchanged', () => {
  const policy = createMonitorPolicy();
  assert.deepEqual(policy.observe({ cpuPercent: 91, memoryPercent: 92 }, 0), []);
  assert.deepEqual(policy.observe({ cpuPercent: 91, memoryPercent: 92 }, 1000), []);
  const alerts = policy.observe({ cpuPercent: 91, memoryPercent: 92 }, 2000);
  assert.deepEqual(alerts.map(a => [a.kind, a.severity, a.value, a.unit]),
    [['cpu', 'warning', 91, '%'], ['memory', 'warning', 92, '%']]);
  for (const alert of alerts) {
    assert.equal(typeof alert.id, 'string');
    assert.equal(typeof alert.title, 'string');
    assert.equal(typeof alert.message, 'string');
  }
  assert.deepEqual(policy.observe({ cpuPercent: 91, memoryPercent: 92 }, 1800000), []);
});

test('high readings must be consecutive and recovery uses hysteresis', () => {
  const policy = createMonitorPolicy();
  policy.observe({ cpuPercent: 90 }, 0);
  policy.observe({ cpuPercent: 89 }, 1);
  policy.observe({ cpuPercent: 90 }, 2);
  assert.deepEqual(policy.observe({ cpuPercent: 90 }, 3), []);
  assert.equal(policy.observe({ cpuPercent: 90 }, 4).length, 1);
  assert.deepEqual(policy.observe({ cpuPercent: 81 }, 5), []);
  assert.deepEqual(policy.observe({ cpuPercent: 80 }, 6).map(a => a.severity), ['info']);
  assert.deepEqual(policy.observe({ cpuPercent: 80 }, 7), []);
  policy.observe({ cpuPercent: 90 }, 900005);
  policy.observe({ cpuPercent: 90 }, 900006);
  assert.equal(policy.observe({ cpuPercent: 90 }, 900007).length, 1);
});

test('disk needs both low thresholds and either recovery threshold', () => {
  const policy = createMonitorPolicy();
  assert.deepEqual(policy.observe({ diskFreeGiB: 10, diskTotalGiB: 50 }, 0), []);
  assert.deepEqual(policy.observe({ diskFreeGiB: 11, diskTotalGiB: 200 }, 1), []);
  assert.deepEqual(policy.observe({ diskFreeGiB: 10, diskTotalGiB: 100 }, 2)
    .map(a => [a.kind, a.severity]), [['disk', 'warning']]);
  assert.deepEqual(policy.observe({ diskFreeGiB: 10, diskTotalGiB: 100 }, 1800000), []);
  assert.deepEqual(policy.observe({ diskFreeGiB: 14, diskTotalGiB: 100 }, 1800001), []);
  assert.equal(policy.observe({ diskFreeGiB: 15, diskTotalGiB: 200 }, 1800002)[0].severity, 'info');
  policy.observe({ diskFreeGiB: 4, diskTotalGiB: 100 }, 2700002);
  assert.equal(policy.observe({ diskFreeGiB: 8, diskTotalGiB: 50 }, 2700003)[0].severity, 'info');
});

test('connections require three explicit failures and restore once', () => {
  const policy = createMonitorPolicy();
  assert.deepEqual(policy.observe({ gatewayOnline: true, mcpOnline: true }, 0), []);
  policy.observe({ gatewayOnline: false, mcpOnline: false }, 1);
  policy.observe({ gatewayOnline: false, mcpOnline: false }, 2);
  assert.deepEqual(policy.observe({ gatewayOnline: false, mcpOnline: false }, 3)
    .map(a => a.kind), ['gateway', 'mcp']);
  assert.deepEqual(policy.observe({}, 4), []);
  assert.deepEqual(policy.observe({ gatewayOnline: false, mcpOnline: false }, 1800000), []);
  assert.deepEqual(policy.observe({ gatewayOnline: true, mcpOnline: true }, 1800001)
    .map(a => a.severity), ['info', 'info']);
  assert.deepEqual(policy.observe({ gatewayOnline: true, mcpOnline: true }, 1800002), []);
});

test('invalid or unavailable readings break pending streaks without implying recovery', () => {
  const policy = createMonitorPolicy();
  policy.observe({ cpuPercent: 95, gatewayOnline: false }, 0);
  policy.observe({ cpuPercent: 95, gatewayOnline: false }, 1);
  assert.deepEqual(policy.observe({ cpuPercent: NaN, gatewayOnline: null }, 2), []);
  assert.deepEqual(policy.observe({ cpuPercent: 95, gatewayOnline: false }, 3), []);
  assert.deepEqual(policy.observe({ cpuPercent: 95, gatewayOnline: false }, 4), []);
  assert.equal(policy.observe({ cpuPercent: 95, gatewayOnline: false }, 5).length, 2);
  for (const sample of [null, {}, { cpuPercent: -1, memoryPercent: Infinity },
    { cpuPercent: '99', memoryPercent: 101, diskFreeGiB: -1, diskTotalGiB: 0 },
    { diskFreeGiB: 101, diskTotalGiB: 100, gatewayOnline: 0, mcpOnline: 'false' }]) {
    assert.deepEqual(policy.observe(sample, 6), []);
  }
});

test('significant escalation happens once after cooldown, never on elapsed time alone', () => {
  const policy = createMonitorPolicy();
  policy.observe({ cpuPercent: 91 }, 0);
  policy.observe({ cpuPercent: 91 }, 1);
  policy.observe({ cpuPercent: 91 }, 2);
  policy.observe({ cpuPercent: 99 }, 3);
  policy.observe({ cpuPercent: 99 }, 4);
  assert.deepEqual(policy.observe({ cpuPercent: 99 }, 5), []);
  assert.equal(policy.observe({ cpuPercent: 99 }, 900002)[0].severity, 'critical');
  assert.deepEqual(policy.observe({ cpuPercent: 99 }, 1800002), []);
  assert.deepEqual(policy.observe({ cpuPercent: 90 }, 2700002), []);
  assert.deepEqual(policy.observe({ cpuPercent: 99 }, 3600002), []);
});

test('monitoring and individual categories can be disabled', () => {
  for (const options of [{ enabled: false }, { cpu: false, memory: false, disk: false, gateway: false, mcp: false }]) {
    const policy = createMonitorPolicy(options);
    for (let now = 0; now < 5; now++) {
      assert.deepEqual(policy.observe({ cpuPercent: 100, memoryPercent: 100,
        diskFreeGiB: 0, diskTotalGiB: 100, gatewayOnline: false, mcpOnline: false }, now), []);
    }
  }
});
