'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { redactContext } = require('./context-journal.cjs');
const { validDirectCommand } = require('./direct-commands.cjs');
const MAX_JOBS = 50, MAX_TEXT = 20000, MAX_FILE = 8 * 1024 * 1024;
const STATUSES = new Set(['queued', 'running', 'outcome-unknown', 'paused', 'agent-finished', 'completed', 'error', 'cancelled']);
const SETTLED = new Set(['agent-finished', 'completed', 'error', 'cancelled']);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const copy = value => value === null ? null : structuredClone(value);
const time = value => Number.isSafeInteger(value) && value >= 0;

function identity(value, name, limit = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Invalid ' + name + '.');
  return value;
}
function ownership(sessionId, profile) {
  identity(sessionId, 'sessionId');
  if (typeof profile !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(profile)) throw new TypeError('Invalid profile.');
}
function instructions(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT || text.includes('\0')) throw new TypeError('Invalid text: use 1–20000 characters.');
}
function app(value) {
  if (value !== null && (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value))) throw new TypeError('Invalid appId.');
}
function voiceTurn(value) {
  if (value !== null && (typeof value !== 'string' || !/^[a-z0-9._:-]{1,128}$/i.test(value))) throw new TypeError('Invalid turnId.');
}
function display(job) {
  const { text, sessionId, runtimeId, turnId, localCommand, ...safe } = job;
  return { ...safe, title: redactContext(job.title, 200), profile: redactContext(job.profile, 80), summary: redactContext(job.summary, 1200), reason: redactContext(job.reason, 450) };
}
function storedJob(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !UUID.test(value.id)) throw new TypeError('Invalid stored job.');
  instructions(value.text); ownership(value.sessionId, value.profile); app(value.appId); voiceTurn(value.turnId ?? null);
  const executor=value.executor??'hermes',localCommand=value.localCommand??null;
  if(!['hermes','local'].includes(executor)||executor==='local'&&(!validDirectCommand(localCommand)||value.runtimeId!=='local-windows')||executor==='hermes'&&localCommand!==null||value.status==='queued'&&executor!=='hermes')throw new TypeError('Invalid stored executor.');
  if (!STATUSES.has(value.status) || typeof value.speak !== 'boolean' || typeof value.verified !== 'boolean' || !Number.isSafeInteger(value.attempts) || value.attempts < 0) throw new TypeError('Invalid stored job state.');
  if (value.runtimeId !== null) identity(value.runtimeId, 'runtimeId');
  for (const key of ['createdAt', 'updatedAt']) if (!time(value[key])) throw new TypeError('Invalid stored time.');
  for (const key of ['startedAt', 'acceptedAt', 'finishedAt']) if (value[key] !== null && !time(value[key])) throw new TypeError('Invalid stored time.');
  for (const [key, limit] of [['title', 200], ['summary', 1200], ['reason', 450]]) if (typeof value[key] !== 'string' || value[key].length > limit) throw new TypeError('Invalid stored metadata.');
  if (value.verified !== (value.status === 'completed') || (value.acceptedAt === null) !== (value.runtimeId === null)) throw new TypeError('Invalid stored verification.');
  if (value.status === 'queued' && (value.startedAt !== null || value.acceptedAt !== null || value.finishedAt !== null || value.runtimeId !== null)) throw new TypeError('Invalid queued job.');
  if (!['queued', 'cancelled'].includes(value.status) && (value.startedAt === null || value.attempts < 1)) throw new TypeError('Invalid dispatched job.');
  if (['running', 'outcome-unknown'].includes(value.status) && (value.startedAt === null || value.attempts < 1 || value.finishedAt !== null)) throw new TypeError('Invalid active job.');
  if ((SETTLED.has(value.status) || value.status === 'paused') && value.finishedAt === null) throw new TypeError('Invalid settled job.');
  return {
    id: value.id, text: value.text, sessionId: value.sessionId, profile: value.profile, appId: value.appId, speak: value.speak, turnId: value.turnId ?? null,executor,localCommand:copy(localCommand),
    status: value.status, verified: value.verified, runtimeId: value.runtimeId, attempts: value.attempts,
    createdAt: value.createdAt, updatedAt: value.updatedAt, startedAt: value.startedAt, acceptedAt: value.acceptedAt, finishedAt: value.finishedAt,
    title: redactContext(value.title, 200) || 'Auftrag bearbeiten', summary: redactContext(value.summary, 1200), reason: redactContext(value.reason, 450),
  };
}

class JobQueue {
  #file; #now; #onChange; #jobs = []; #held = false; #holdReason = '';

  constructor({ file = null, now = Date.now, onChange = () => {} } = {}) {
    if (file !== null && (typeof file !== 'string' || !path.isAbsolute(file))) throw new TypeError('Job queue requires an absolute local file path or null.');
    if (typeof now !== 'function' || typeof onChange !== 'function') throw new TypeError('Invalid job queue callbacks.');
    this.#file = file; this.#now = now; this.#onChange = onChange;
    if (file === null) return;
    let recovered = false;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_FILE) throw new TypeError('Invalid queue storage.');
      const stored = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (!stored || stored.version !== 1 || !Array.isArray(stored.jobs) || stored.jobs.length > MAX_JOBS || typeof stored.held !== 'boolean' || typeof stored.holdReason !== 'string' || stored.holdReason.length > 450) throw new TypeError('Invalid queue schema.');
      const jobs = stored.jobs.map(storedJob);
      if (new Set(jobs.map(job => job.id)).size !== jobs.length || jobs.filter(job => ['running', 'outcome-unknown'].includes(job.status)).length > 1) throw new TypeError('Invalid queue ownership.');
      for (const job of jobs) if (job.status === 'running') {
        job.status = 'outcome-unknown'; job.reason = 'App neu gestartet; Ergebnis vor erneutem Senden prüfen.'; job.updatedAt = this.#timestamp(); recovered = true;
      }
      this.#jobs = jobs; this.#held = stored.held; this.#holdReason = redactContext(stored.holdReason, 450);
    } catch (error) {
      if (error.code !== 'ENOENT') { this.#jobs = []; this.#held = true; this.#holdReason = 'Lokale Auftragsdatei ungültig oder nicht lesbar; Warteschlange bewusst prüfen und fortsetzen.'; }
    }
    // A restart can never convert uncertain remote work back into queued instructions.
    if (recovered) this.#commit();
  }

  #timestamp() {
    const value = this.#now();
    if (!time(value)) throw new TypeError('Invalid queue clock.');
    return value;
  }

  #commit(jobs = this.#jobs, held = this.#held, holdReason = this.#holdReason) {
    const contents = JSON.stringify({ version: 1, held, holdReason, jobs });
    if (Buffer.byteLength(contents, 'utf8') > MAX_FILE) throw new RangeError('Job queue storage exceeds local limit.');
    if (this.#file !== null) {
      fs.mkdirSync(path.dirname(this.#file), { recursive: true });
      const temporary = this.#file + '.' + randomUUID() + '.tmp';
      let descriptor;
      try {
        descriptor = fs.openSync(temporary, 'wx', 0o600);
        fs.writeFileSync(descriptor, contents, 'utf8'); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
        fs.renameSync(temporary, this.#file);
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        try { fs.unlinkSync(temporary); } catch {}
      }
    }
    this.#jobs = jobs; this.#held = held; this.#holdReason = holdReason;
    try { this.#onChange(this.snapshot()); } catch { /* A view failure cannot roll back a durable transition. */ }
  }

  #update(id, allowed, change) {
    const index = this.#jobs.findIndex(job => job.id === id && allowed.includes(job.status));
    if (index < 0) return null;
    const job = { ...this.#jobs[index], ...change, updatedAt: this.#timestamp() };
    const jobs = this.#jobs.slice(); jobs[index] = job;
    this.#commit(jobs);
    return copy(job);
  }

  enqueue({ text, title = 'Auftrag bearbeiten', sessionId, profile = 'default', appId = null, speak = true, turnId = null } = {}) {
    instructions(text); ownership(sessionId, profile); app(appId); voiceTurn(turnId);
    if (typeof speak !== 'boolean') throw new TypeError('Invalid speak.');
    if (typeof title !== 'string') throw new TypeError('Invalid title.');
    const jobs = this.#jobs.slice();
    if (jobs.length === MAX_JOBS) {
      const discard = jobs.findIndex(job => SETTLED.has(job.status));
      if (discard < 0) throw new RangeError('Job queue is full (50 pending records).');
      jobs.splice(discard, 1);
    }
    const timestamp = this.#timestamp();
    const job = {
      id: randomUUID(), text, sessionId, profile, appId, speak, turnId, executor:'hermes',localCommand:null,status: 'queued', verified: false, runtimeId: null, attempts: 0,
      createdAt: timestamp, updatedAt: timestamp, startedAt: null, acceptedAt: null, finishedAt: null,
      title: redactContext(title, 200) || 'Auftrag bearbeiten', summary: '', reason: '',
    };
    this.#commit([...jobs, job]);
    return copy(job);
  }

  claim({ sessionId, profile = 'default' } = {}) {
    ownership(sessionId, profile);
    if (this.#held || this.active()) return null;
    const job = this.#jobs.find(item => item.status === 'queued' && item.sessionId === sessionId && item.profile === profile);
    if (!job) return null;
    return this.#update(job.id, ['queued'], { status: 'running', startedAt: this.#timestamp(), attempts: job.attempts + 1 });
  }

  accepted(id, { runtimeId } = {}) {
    if (!this.#jobs.some(job => job.id === id && job.status === 'running')) return null;
    identity(runtimeId, 'runtimeId');
    return this.#update(id, ['running'], { runtimeId, acceptedAt: this.#timestamp() });
  }

  setLocal(id,command){
    if(!validDirectCommand(command))throw new TypeError('Invalid local command.');
    const job=this.#jobs.find(item=>item.id===id&&item.status==='running'&&item.executor==='hermes'&&item.acceptedAt===null);
    if(!job)return null;
    return this.#update(id,['running'],{executor:'local',localCommand:copy(command),runtimeId:'local-windows',acceptedAt:this.#timestamp()});
  }

  finish(id, { status = 'agent-finished', summary = '', verified = false } = {}) {
    if (!this.#jobs.some(job => job.id === id && job.status === 'running')) return null;
    if (['disconnect', 'disconnected', 'timeout', 'outcome-unknown'].includes(status)) return this.unknown(id, summary || status);
    if (typeof verified !== 'boolean') throw new TypeError('Invalid verified.');
    let outcome;
    if (['agent-finished', 'complete', 'completed', 'success', 'ok'].includes(status)) outcome = verified ? 'completed' : 'agent-finished';
    else if (status === 'error') outcome = 'error';
    else if (['cancelled', 'canceled', 'interrupted', 'aborted'].includes(status)) return this.unknown(id, summary || 'Abbruch angefordert; Remote-Ergebnis prüfen.');
    else throw new TypeError('Invalid finish status.');
    return this.#update(id, ['running'], { status: outcome, verified: outcome === 'completed', summary: redactContext(summary, 1200), reason: '', finishedAt: this.#timestamp() });
  }

  unknown(id, reason = 'Remote-Ergebnis unbekannt.') {
    return this.#update(id, ['running', 'outcome-unknown'], { status: 'outcome-unknown', verified: false, reason: redactContext(reason, 450) || 'Remote-Ergebnis unbekannt.', finishedAt: null });
  }

  reconcile(id, { remoteRunning, verified = false, summary = '', runtimeId } = {}) {
    if (!this.#jobs.some(job => job.id === id && job.status === 'outcome-unknown')) return null;
    if (typeof remoteRunning !== 'boolean') throw new TypeError('Reconciliation requires a boolean remoteRunning.');
    if (typeof verified !== 'boolean') throw new TypeError('Invalid verified.');
    if (runtimeId !== undefined) identity(runtimeId, 'runtimeId');
    return this.#update(id, ['outcome-unknown'], {
      status: remoteRunning ? 'running' : verified ? 'completed' : 'paused', verified: !remoteRunning && verified,
      summary: redactContext(summary, 1200), reason: remoteRunning || verified ? '' : 'Remote geprüft; Ergebnis unbestätigt. Erneuten Versuch bewusst starten.',
      finishedAt: remoteRunning ? null : this.#timestamp(),
      ...(runtimeId === undefined ? {} : { runtimeId, acceptedAt: this.#timestamp() }),
    });
  }

  cancel(id) {
    const job = this.#jobs.find(item => item.id === id);
    if (job && ['running', 'outcome-unknown'].includes(job.status)) return this.unknown(id, 'Abbruch angefordert; Remote-Stopp und Ergebnis zuerst prüfen.');
    return this.#update(id, ['queued', 'paused', 'error'], { status: 'cancelled', verified: false, reason: 'Auftrag lokal abgebrochen.', finishedAt: this.#timestamp() });
  }

  retry(id) {
    // Each deliberate attempt gets a fresh event ID; delayed events from a previous send stay stale.
    return this.#update(id, ['paused', 'error'], { id: randomUUID(), status: 'queued', verified: false, executor:'hermes',localCommand:null,runtimeId: null, startedAt: null, acceptedAt: null, finishedAt: null, summary: '', reason: '' });
  }

  list() { return this.#jobs.map(display); }
  localContext({sessionId,profile='default'}={}){
    ownership(sessionId,profile);
    return this.#jobs.filter(job=>job.executor==='local'&&job.sessionId===sessionId&&job.profile===profile&&['completed','error','paused'].includes(job.status)).slice(-3).map(job=>({at:job.updatedAt,status:job.status,verified:job.verified,summary:redactContext(job.summary,350),action:{type:job.localCommand.type,action:job.localCommand.action||'open',...(job.localCommand.app?{app:redactContext(job.localCommand.app.name,80)}:{})}}));
  }
  active() { return copy(this.#jobs.find(job => ['running', 'outcome-unknown'].includes(job.status)) || null); }
  pending() { return this.#jobs.some(job => job.status === 'queued'); }
  snapshot() {
    return { version: 1, held: this.#held, holdReason: redactContext(this.#holdReason, 450), blocked: this.#jobs.some(job => job.status === 'outcome-unknown'), activeJobId: this.#jobs.find(job => ['running', 'outcome-unknown'].includes(job.status))?.id || null, jobs: this.list() };
  }
  pauseAll(reason = 'Warteschlange angehalten.') { this.#commit(this.#jobs, true, redactContext(reason, 450) || 'Warteschlange angehalten.'); return this.snapshot(); }
  resumeQueue() { this.#commit(this.#jobs, false, ''); return this.snapshot(); }
}

module.exports = { JobQueue };
