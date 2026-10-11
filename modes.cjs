const MODE_DEFAULTS = Object.freeze([
  { id: 'gaming', name: 'Gaming', quiet: true },
  { id: 'work', name: 'Arbeit', quiet: false },
  { id: 'evening', name: 'Feierabend', quiet: true },
].map(mode => Object.freeze({ ...mode, apps: Object.freeze([]), folders: Object.freeze([]), sites: Object.freeze([]), instructions: '', cameraOff: false, standby: false })));

function validateAppPath(path) {
  if (typeof path !== 'string' || path.length > 1000 || !/^[a-z]:[\\/]/i.test(path)
      || /[\p{Cc}<>"|?*]/u.test(path) || /:/.test(path.slice(2))
      || !/\.(exe|lnk|appref-ms)$/i.test(path)) {
    throw new Error('Invalid application path: choose an absolute local Windows .exe, .lnk or .appref-ms file.');
  }
  const parts = path.slice(3).split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || /[.\s]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw new Error('Invalid application path: ambiguous or reserved Windows path segment.');
  }
  return path;
}

function validateAppId(id) {
  // AUMIDs are bounded ASCII package/application names, never paths or commands.
  if (typeof id !== 'string' || id.length > 128 || /[^A-Za-z0-9._!-]/.test(id)
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*![A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error('Invalid application ID: choose a Windows Store namespace!app identifier.');
  }
  return id;
}

function validateAppReference(reference) {
  if (typeof reference === 'string' && /^app:/i.test(reference)) return 'app:' + validateAppId(reference.slice(4));
  return validateAppPath(reference);
}

function validateFolderPath(value) {
  if (typeof value !== 'string' || value.length > 1000 || !/^[a-z]:[\\/]/i.test(value)
      || /[\p{Cc}\p{Cf}<>"|?*]/u.test(value) || /:/.test(value.slice(2))) {
    throw new Error('Invalid folder path: choose an absolute local Windows directory.');
  }
  const path = value.length > 3 ? value.replace(/[\\/]$/, '') : value;
  const parts = path.slice(3).split(/[\\/]/);
  if (path.length > 3 && parts.some(part => !part || part === '.' || part === '..' || /[.\s]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw new Error('Invalid folder path: ambiguous or reserved Windows path segment.');
  }
  return path.replace(/\//g, '\\');
}

function validateSiteUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value.trim()) || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new Error('Invalid site: choose a complete HTTP or HTTPS address.');
  }
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Invalid site: choose a complete HTTP or HTTPS address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Invalid site: only HTTP/HTTPS addresses without credentials are allowed.');
  }
  return url.href;
}

function normalizeWorkspace(values, kind, validate, key) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 8) throw new Error(`Mode ${kind} must be an array with at most eight entries.`);
  const seen = new Set();
  return values.map(validate).filter(value => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeMode(mode, fallback) {
  if (mode.apps !== undefined && !Array.isArray(mode.apps)) throw new Error('Mode apps must be an array of application references.');
  // Validate the entire list, including entries beyond the launch limit.
  const apps = (mode.apps || []).map(validateAppReference);
  const seen = new Set();
  const name = typeof mode.name === 'string' ? mode.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40) : '';
  return {
    id: fallback.id,
    name: name || fallback.name,
    apps: apps.filter(path => {
      const key = path.replace(/\//g, '\\').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8),
    folders: normalizeWorkspace(mode.folders, 'folders', validateFolderPath, path => path.toLowerCase()),
    sites: normalizeWorkspace(mode.sites, 'sites', value => {
      const site = typeof value === 'string' ? { url: value } : value;
      if (!site || typeof site !== 'object' || Array.isArray(site)
          || site.name !== undefined && (typeof site.name !== 'string' || site.name.trim().length > 80 || /[\p{Cc}\p{Cf}]/u.test(site.name))) {
        throw new Error('Invalid site name: use at most 80 visible characters.');
      }
      return { url: validateSiteUrl(site.url), name: site.name?.trim() || '' };
    }, site => site.url),
    instructions: typeof mode.instructions === 'string' ? mode.instructions.slice(0, 1500) : '',
    quiet: typeof mode.quiet === 'boolean' ? mode.quiet : fallback.quiet,
    cameraOff: typeof mode.cameraOff === 'boolean' ? mode.cameraOff : false,
    standby: typeof mode.standby === 'boolean' ? mode.standby : false,
  };
}

function validId(id) { return typeof id === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && id.length <= 40; }

function normalizeModes(input) {
  const configured = new Map();
  for (const mode of Array.isArray(input) ? input : []) {
    // First entry wins; duplicate IDs never create multiple selectable modes.
    if (mode && typeof mode === 'object' && validId(mode.id) && !configured.has(mode.id)) configured.set(mode.id, mode);
  }
  const modes = MODE_DEFAULTS.map(defaults => normalizeMode(configured.get(defaults.id) || {}, defaults));
  for (const [id, mode] of configured) {
    if (MODE_DEFAULTS.some(defaults => defaults.id === id)) continue;
    const normalized = normalizeMode(mode, { id, name: id, quiet: false });
    if (modes.length < 8) modes.push(normalized);
  }
  return modes;
}

function modeIntent(text, modes) {
  if (typeof text !== 'string' || text.length > 300 || /[?\p{Cc}\p{Cf}]/u.test(text)) return null;
  const request = text.trim().toLocaleLowerCase('de-DE').replace(/^(?:hey\s+)?(?:lilith|lillis|hermes)[,\s]+/, '').replace(/[.!]+$/, '').trim().replace(/^bitte\s+/, '').replace(/,?\s+bitte$/, '').replace(/^(aktiviere|aktivier|starte|wechsle|wechsel|schalte) bitte\s+/, '$1 ');
  const aliases = { gaming: ['gaming'], work: ['arbeit', 'arbeits'], evening: ['feierabend'] };
  const everyday = {
    gaming: ['ich möchte spielen', 'ich will spielen', 'ich möchte zocken', 'ich will zocken'],
    work: ['arbeitsplatz starten', 'starte meinen arbeitsplatz', 'starte den arbeitsplatz', 'ich fange an zu arbeiten', 'ich beginne zu arbeiten', 'ich möchte arbeiten', 'ich will arbeiten'],
    evening: ['feierabend', 'ich habe feierabend', 'ich mache feierabend'],
  };
  const matches = new Set();
  for (const mode of normalizeModes(modes)) {
    if (everyday[mode.id]?.includes(request)) matches.add(mode.id);
    const names = [...(aliases[mode.id] || []), mode.name.toLowerCase()];
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const target = `${escaped}(?:[ -]?modus)`;
      if (new RegExp(`^(?:${target}|(?:aktiviere|aktivier|starte) (?:(?:den|meinen) )?${target}|(?:wechsle|wechsel) in (?:den )?${target}|schalte (?:den )?${target} ein|(?:aktiviere|aktivier|starte) (?:(?:den|meinen) )?${escaped}|(?:aktiviere|aktivier|starte) (?:das|mein) profil ${escaped}|${escaped} starten)$`, 'u').test(request)) matches.add(mode.id);
    }
  }
  return matches.size === 1 ? [...matches][0] : null;
}

async function runMode(mode, actions = {}) {
  if (!mode || !validId(mode.id)) throw new Error('Invalid mode ID.');
  const selected = normalizeMode(mode, MODE_DEFAULTS.find(defaults => defaults.id === mode.id) || { id: mode.id, name: mode.id, quiet: false });
  const required = ['setQuiet', ...(selected.cameraOff ? ['setCameraOff'] : []),
    ...(selected.apps.some(app => app.startsWith('app:')) ? ['openApp'] : []),
    ...(selected.apps.some(app => !app.startsWith('app:')) ? ['openPath'] : []),
    ...(selected.folders.length ? ['openFolder'] : []),
    ...(selected.sites.length ? ['openUrl'] : []),
    ...(selected.standby ? ['enterStandby'] : [])];
  for (const action of required) if (typeof actions[action] !== 'function') throw new Error(`Mode action ${action} is unavailable.`);
  async function perform(action, ...args) {
    try { await actions[action](...args); }
    catch (error) { throw new Error(`Mode action ${action} failed: ${error?.message || String(error)}`, { cause: error }); }
  }
  await perform('setQuiet', selected.quiet);
  if (selected.cameraOff) await perform('setCameraOff', true);
  const apps = [];
  for (const path of selected.apps) {
    let error = '';
    try {
      const response = path.startsWith('app:') ? await actions.openApp(path.slice(4)) : await actions.openPath(path);
      if (response !== '') error = typeof response === 'string' && response ? response : 'Windows did not report launch acceptance.';
    } catch (failure) { error = failure?.message || String(failure) || 'Windows launch failed.'; }
    apps.push({ path, accepted: error === '', error });
  }
  async function openWorkspace(action, entries, argument) {
    const results = [];
    for (const entry of entries) {
      let error = '';
      try {
        const response = await actions[action](entry[argument]);
        if (response !== '') error = typeof response === 'string' && response ? response : 'Windows did not report open acceptance.';
      } catch (failure) { error = failure?.message || String(failure) || 'Windows open failed.'; }
      results.push({ ...entry, accepted: error === '', verified: false, error });
    }
    return results;
  }
  const folders = await openWorkspace('openFolder', selected.folders.map(path => ({ path })), 'path');
  const sites = await openWorkspace('openUrl', selected.sites, 'url');
  if (selected.standby) await perform('enterStandby');
  return { id: selected.id, name: selected.name, ok: [...apps, ...folders, ...sites].every(step => step.accepted), apps, folders, sites, instructions: selected.instructions, instructionsExecuted: false, quiet: selected.quiet, cameraOff: selected.cameraOff, standby: selected.standby };
}

module.exports = { MODE_DEFAULTS, normalizeModes, validateAppPath, validateAppId, validateAppReference, validateFolderPath, validateSiteUrl, modeIntent, runMode };
