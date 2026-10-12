const { execFile: defaultExecFile } = require('node:child_process');
const path = require('node:path');

function validIdentity(value) {
  return value && typeof value.id === 'string' && /^[1-9]\d{0,18}$/.test(value.id) && BigInt(value.id) <= 9223372036854775807n
    && Number.isInteger(value.pid) && value.pid > 0 && value.pid <= 2147483647
    && typeof value.processStartedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,7}Z$/.test(value.processStartedAt)
    && Number.isFinite(Date.parse(value.processStartedAt));
}

function createWindowsControl({ execFile = defaultExecFile, platform = process.platform, windowsDir = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  const executable = path.win32.join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = path.join(__dirname, 'scripts', 'windows_control.ps1');
  const invoke = (action, target, signal) => new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action];
    if (target) args.push('-Id', target.id, '-ProcessId', String(target.pid), '-ProcessStartedAt', target.processStartedAt);
    try {
      execFile(executable, args, { shell: false, windowsHide: true, timeout: 10000, maxBuffer: 512 * 1024, encoding: 'utf8', signal }, (error, stdout) => {
        if (error) return reject(new Error('Fensterprüfung unter Windows nicht verfügbar.'));
        try { resolve(JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim())); }
        catch { reject(new Error('Fensterprüfung unter Windows lieferte keine gültige Beobachtung.')); }
      });
    } catch { reject(new Error('Fensterprüfung unter Windows nicht verfügbar.')); }
  });
  const fresh = data => typeof data?.observedAt === 'string' && Number.isFinite(Date.parse(data.observedAt))
    && Date.now() - Date.parse(data.observedAt) <= 5000 && Date.parse(data.observedAt) - Date.now() <= 1500;
  const sameIdentity = (first, second) => validIdentity(first) && validIdentity(second)
    && first.id === second.id && first.pid === second.pid && first.processStartedAt === second.processStartedAt;
  return {
    async read({ signal } = {}) {
      if (platform !== 'win32') throw new Error('Fensterprüfung braucht Windows.');
      const data = await invoke('list', null, signal);
      if (data?.kind !== 'list' || data.errorCode || !fresh(data) || data.activeDesktop !== true || !Number.isInteger(data.sessionId) || data.sessionId <= 0
        || !Array.isArray(data.windows) || data.windows.length > 2048 || !data.windows.every(value => validIdentity(value)
          && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 512 && typeof value.app === 'string' && value.app.length > 0 && value.app.length <= 260)) {
        throw new Error('Fensterprüfung unter Windows ist nicht aktuell oder nicht verfügbar.');
      }
      return { windows: data.windows.map(({ id, pid, title, app, processStartedAt }) => ({ id, pid, title, app, processStartedAt })), observedAt: data.observedAt };
    },
    async focus(target, { signal } = {}) {
      if (platform !== 'win32' || !validIdentity(target) || Object.keys(target).sort().join(',') !== 'id,pid,processStartedAt' || signal?.aborted) {
        return { verified: false, status: 'failed', message: 'Kein gültiges Windows-Fenster zum Wechseln.', evidence: null };
      }
      const snapshot = { id: target.id, pid: target.pid, processStartedAt: target.processStartedAt };
      let data;
      try { data = await invoke('focus', snapshot, signal); }
      catch { return { verified: false, status: 'unverified', message: 'Fensterwechsel konnte nicht überprüft werden.', evidence: null }; }
      const observation = data?.kind === 'focus' && fresh(data) && Number.isInteger(data.sessionId) && data.sessionId > 0 && sameIdentity(data.target, snapshot);
      const verified = observation && data.activeDesktop === true && data.accepted === true && data.identityMatched === true && data.minimized === false && !data.errorCode
        && data.foregroundId === snapshot.id && data.foregroundPid === snapshot.pid && data.foregroundProcessStartedAt === snapshot.processStartedAt;
      const failed = observation && data.accepted === false;
      // Only native identity/readback fields may become durable evidence; titles and error text stay out.
      const evidence = observation ? { target: snapshot, foregroundId: typeof data.foregroundId === 'string' && /^[0-9]{1,19}$/.test(data.foregroundId) ? data.foregroundId : null,
        foregroundPid: Number.isInteger(data.foregroundPid) && data.foregroundPid > 0 ? data.foregroundPid : null,
        sessionId: data.sessionId, observedAt: data.observedAt } : null;
      return { verified: Boolean(verified), status: verified ? 'completed' : failed ? 'failed' : 'unverified',
        message: verified ? 'Fenster ist im Vordergrund.' : failed ? 'Fenster ist nicht mehr verfügbar oder hat sich geändert.' : 'Fensterwechsel konnte nicht überprüft werden.', evidence };
    },
  };
}

module.exports = { createWindowsControl };
