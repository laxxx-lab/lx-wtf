'use strict';

/** Pure alert policy. Missing readings interrupt streaks but never mean recovery. */
function createMonitorPolicy(options = {}) {
  options = options || {};
  const cooldownMs = Number.isFinite(options.cooldownMs) && options.cooldownMs >= 0
    ? options.cooldownMs : 15 * 60 * 1000;
  const states = {};
  let sequence = 0;
  const validPercent = value => Number.isFinite(value) && value >= 0 && value <= 100;

  return {
    observe(sample, nowMs = Date.now()) {
      if (options.enabled === false || !Number.isFinite(nowMs)) return [];
      sample = sample && typeof sample === 'object' ? sample : {};
      const alerts = [];

      function check(kind, label, value, unit, valid, high, critical, recovered, persistence) {
        if (options[kind] === false) return;
        const state = states[kind] ||= { high: 0, critical: 0, active: null, lastAlert: -Infinity };
        if (!valid) {
          state.high = state.critical = 0;
          return;
        }
        state.high = high ? Math.min(persistence, state.high + 1) : 0;
        state.critical = critical ? Math.min(persistence, state.critical + 1) : 0;

        function emit(severity) {
          const connection = unit === 'online';
          const title = severity === 'info' ? `${label} recovered`
            : connection ? `${label} connection lost` : `${label} ${kind === 'disk' ? 'space low' : 'usage high'}`;
          const reading = connection ? (value ? 'online' : 'offline')
            : `${Math.round(value * 10) / 10}${unit === '%' ? '%' : ` ${unit}`}`;
          alerts.push({ id: `${kind}-${++sequence}`, kind, severity, title,
            message: `${title}: ${reading}.`, value, unit });
        }

        if (state.active && recovered) {
          emit('info');
          state.active = null;
          state.high = state.critical = 0;
          return;
        }
        if (nowMs - state.lastAlert < cooldownMs) return;
        if (!state.active && state.high >= persistence) {
          state.active = state.critical >= persistence ? 'critical' : 'warning';
          emit(state.active);
          state.lastAlert = nowMs;
        } else if (state.active === 'warning' && state.critical >= persistence) {
          state.active = 'critical';
          emit('critical');
          state.lastAlert = nowMs;
        }
      }

      for (const [kind, key, label] of [['cpu', 'cpuPercent', 'CPU'], ['memory', 'memoryPercent', 'Memory']]) {
        const value = sample[key];
        check(kind, label, value, '%', validPercent(value), value >= 90, value >= 98, value <= 80, 3);
      }
      const free = sample.diskFreeGiB;
      const total = sample.diskTotalGiB;
      const diskValid = Number.isFinite(free) && Number.isFinite(total) && free >= 0 && total > 0 && free <= total;
      const freePercent = free / total * 100;
      check('disk', 'Disk', free, 'GiB', diskValid, free <= 10 && freePercent <= 10,
        free <= 2 && freePercent <= 2, free >= 15 || freePercent >= 15, 1);
      for (const [kind, key, label] of [['gateway', 'gatewayOnline', 'Gateway'], ['mcp', 'mcpOnline', 'MCP']]) {
        if(kind==='mcp'&&Number.isFinite(sample.mcpCheckedAt)){
          const state=states[kind]||={high:0,critical:0,active:null,lastAlert:-Infinity};
          if(state.sampleStamp===sample.mcpCheckedAt)continue;
          state.sampleStamp=sample.mcpCheckedAt;
        }
        const value = sample[key];
        check(kind, label, value, 'online', typeof value === 'boolean', value === false, false, value === true, 3);
      }
      return alerts;
    }
  };
}

module.exports = { createMonitorPolicy };
