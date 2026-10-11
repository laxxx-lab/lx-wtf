'use strict';
const TIMEOUT_MS = 15000, MAX_MESSAGES = 8, EXPANDED_MESSAGES = 128, MAX_CONTENT = 65536;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ROLES = new Set(['user', 'assistant', 'system', 'tool']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function bounded(action) {
  let timer;
  return Promise.race([
    Promise.resolve().then(action),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

async function verifyJobOutcome({ gateway, job } = {}) {
  let remoteRunning, runtimeId;
  const result = (correlated, reason) => ({
    correlated, remoteRunning, ...(runtimeId === undefined ? {} : { runtimeId }), ...(reason ? { reason } : {}),
  });
  if (!object(job) || typeof job.id !== 'string' || !UUID.test(job.id) || !identity(job.sessionId) ||
      typeof job.profile !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(job.profile) ||
      !gateway || typeof gateway.request !== 'function' || typeof gateway.json !== 'function') {
    return result(false, 'Auftragszuordnung kann nicht geprüft werden.');
  }
  const { id, sessionId, profile } = job;
  try {
    const resume = await bounded(() => gateway.request('session.resume', {
      session_id: sessionId, profile, omit_messages: true, inline_images: false,
    }, TIMEOUT_MS));
    const resolvedIds = object(resume) ? [resume.session_key, resume.resumed].filter(value => value !== undefined) : [];
    if (!object(resume) || typeof resume.running !== 'boolean' ||
        (resume.profile !== undefined && resume.profile !== profile) ||
        (resume.info?.profile_name !== undefined && resume.info.profile_name !== profile) ||
        (resume.session_id !== undefined && !identity(resume.session_id)) ||
        resolvedIds.some(value => !identity(value)) || new Set(resolvedIds).size > 1) {
      return result(false, 'Hermes liefert keinen eindeutigen Status für den Auftrag.');
    }
    remoteRunning = resume.running;
    runtimeId = resume.session_id;
    const resolvedSessionId = resolvedIds[0] ?? sessionId;
    const owned = value => value === undefined || value === sessionId || value === resolvedSessionId;
    const readHistory=limit=>bounded(()=>gateway.json('/api/sessions/'+encodeURIComponent(sessionId)+'/messages?limit='+limit+'&order=latest&inline_images=false&profile='+encodeURIComponent(profile)));
    let limit=MAX_MESSAGES,history=await readHistory(limit);
    if(object(history)&&Array.isArray(history.messages)&&history.messages.length<=limit&&owned(history.session_id)&&(history.profile===undefined||history.profile===profile)&&history.messages.every(message=>object(message)&&ROLES.has(message.role)&&owned(message.session_id)&&(message.profile===undefined||message.profile===profile))&&!history.messages.some(message=>message.role==='user')){
      // A normal tool-heavy turn can push its own user message out of eight
      // recent records. Expand once; still require the latest exact marker.
      limit=EXPANDED_MESSAGES;history=await readHistory(limit);
    }
    if (!object(history) || !Array.isArray(history.messages) || history.messages.length > limit ||
        !owned(history.session_id) ||
        (history.profile !== undefined && history.profile !== profile)) {
      return result(false, 'Hermes-Nachrichten lassen sich dem Auftrag nicht zuordnen.');
    }
    const users = [];
    for (const message of history.messages) {
      if (!object(message) || !ROLES.has(message.role) || !owned(message.session_id) ||
          (message.profile !== undefined && message.profile !== profile)) {
        return result(false, 'Hermes-Nachrichten haben ein unbekanntes Format.');
      }
      if (message.role === 'user') {
        if (typeof message.content !== 'string' || message.content.length > MAX_CONTENT) {
          return result(false, 'Hermes-Nutzernachrichten haben ein unbekanntes Format.');
        }
        users.push(message);
      }
    }
    if (!users.length) return result(false, 'Auftragsmarkierung fehlt in den aktuellen Nutzernachrichten.');
    let latest = users[0];
    if (users.length > 1) {
      const times = new Set();
      for (const message of users) {
        if (!timestamp(message.timestamp) || times.has(message.timestamp)) {
          return result(false, 'Reihenfolge der Nutzeraufträge ist nicht eindeutig.');
        }
        times.add(message.timestamp);
        if (message.timestamp > latest.timestamp) latest = message;
      }
    }
    if (!latest.content.startsWith('[Lilith-Auftrag: ' + id + ']')) {
      return result(false, 'Der neueste Nutzerauftrag gehört nicht zu diesem Auftrag.');
    }
    return result(true);
  } catch {
    return result(false, 'Hermes-Auftrag konnte nicht rechtzeitig geprüft werden.');
  }
}

module.exports = { verifyJobOutcome };
