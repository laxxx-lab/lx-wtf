'use strict';
const path = require('node:path');
const childProcess = require('node:child_process');
const { validateAppId, validateAppReference } = require('./modes.cjs');

function normalizeAppCatalog(raw) {
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const seen = new Set(), entries = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const displayName = row.name ?? row.Name;
    let id = row.id ?? row.AppID;
    if (typeof displayName !== 'string' || /[\p{Cc}\p{Cf}]/u.test(displayName)) continue;
    const name = displayName.trim().slice(0, 200);
    if (!name || typeof id !== 'string') continue;
    try {
      if (!/^app:/i.test(id) && !/^[a-z]:[\\/]/i.test(id)) id = 'app:' + validateAppId(id);
      id = validateAppReference(id);
    } catch { continue; }
    const key = id.replace(/\//g, '\\').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ id, name });
    if (entries.length === 500) break;
  }
  return entries;
}

async function readAppCatalog({ execFile = childProcess.execFile, platform = process.platform, windowsDir = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (platform !== 'win32') throw new Error('Application catalog requires Windows.');
  const exe = path.win32.join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const stdout = await new Promise((resolve, reject) => {
    execFile(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'scripts', 'list_apps.ps1')],
      { windowsHide: true, shell: false, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
      (error, output) => error ? reject(new Error(`Application catalog unavailable: ${error.message}`, { cause: error })) : resolve(output));
  });
  let raw;
  try { raw = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()); }
  catch (error) { throw new Error('Application catalog returned invalid JSON.', { cause: error }); }
  if (!Array.isArray(raw) && (!raw || typeof raw !== 'object')) throw new Error('Application catalog returned invalid JSON rows.');
  return normalizeAppCatalog(raw);
}

async function launchCatalogApp(id, { spawn = childProcess.spawn, platform = process.platform, windowsDir = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  validateAppId(id);
  if (platform !== 'win32') throw new Error('Application launch requires Windows.');
  // Explorer forwards AppsFolder activation to the signed-in desktop shell.
  // Spawn acceptance does not prove the application's window or task is ready.
  return new Promise((resolve, reject) => {
    const child = spawn(path.win32.join(windowsDir, 'explorer.exe'), ['shell:AppsFolder\\' + id], { windowsHide: true, shell: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(''); });
  });
}

module.exports = { readAppCatalog, normalizeAppCatalog, validateAppId, launchCatalogApp };
