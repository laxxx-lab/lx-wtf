'use strict';

const { randomUUID } = require('node:crypto');

function redactTaskText(value, limit = 1200) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 32000)
    .replace(/https?:\/\/[^\s"'<>]+/gi, raw => {
      try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
      catch { return '[URL redacted]'; }
    })
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|access[_-]?token|refresh[_-]?token|password|passwd|api[_-]?key|cookie|authorization|secret)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, '$1=[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, Number.isInteger(limit) ? Math.max(0, Math.min(limit, 6000)) : 1200);
}

function terminalStatus(status) {
  if (/^(interrupted|cancelled|canceled|aborted)$/i.test(status || '')) return 'interrupted';
  if (/^(disconnected|disconnect)$/i.test(status || '')) return 'disconnected';
  if (/^(complete|completed|success|ok|agent-finished|verified)$/i.test(status || 'complete')) return 'agent-finished';
  return 'error';
}

function spotifyProof(result, name) {
  // Only a known native tool's explicit root field counts; webpage prose and generic success do not.
  if (!/(?:^|[._:/])spotify(?:[._:/]|__)playback$/i.test(name || '')) return null;
  const parse = value => {
    if (typeof value !== 'string') return value;
    if (value.length > 64000) return null;
    try { return JSON.parse(value); } catch { return null; }
  };
  const output = parse(result);
  if (!output || typeof output !== 'object' || Array.isArray(output) || output.isError === true) return null;
  const explicit = data => {
    if (!data || Array.isArray(data) || typeof data !== 'object' || typeof data.playback_verified !== 'boolean') return null;
    return data.playback_verified === true && data.success !== false && data.isError !== true && !data.error;
  };
  const rootProof = explicit(output);
  if (rootProof !== null) return rootProof;
  if (Array.isArray(output.content)) {
    for (const block of output.content.slice(0, 8)) {
      if (block?.type !== 'text') continue;
      const proof = explicit(parse(block.text));
      if (proof !== null) return proof;
    }
  }
  return null;
}

class TaskLedger {
  constructor({ now = Date.now, maxTasks = 50 } = {}) {
    this.now = now;
    this.maxTasks = Number.isInteger(maxTasks) ? Math.max(1, Math.min(maxTasks, 100)) : 50;
    this.tasks = [];
    this.current = null;
    this.tools = new Map();
  }

  start({ title, sessionId = null, appId = null } = {}) {
    if (this.current?.status === 'running') throw new Error('Ein Auftrag läuft. Zuerst abschließen oder unterbrechen.');
    this.tools.clear();
    this.current = {
      id: randomUUID(), title: redactTaskText(title, 200) || 'Auftrag bearbeiten',
      sessionId: redactTaskText(sessionId, 128) || null,
      ...(typeof appId==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(appId)?{appId}:{}),
      status: 'running', verification: 'unknown', evidence: [],
      startedAt: this.now(), finishedAt: null, toolCount: 0, completedTools: 0,
      tools: [], summary: '',
    };
    this.tasks.unshift(this.current);
    this.tasks.length = Math.min(this.tasks.length, this.maxTasks);
    return this.view();
  }

  accepts(sessionId) {
    return this.current?.status === 'running' && (sessionId === undefined || sessionId === this.current.sessionId);
  }

  toolStart({ id, name, sessionId } = {}) {
    if (!this.accepts(sessionId) || typeof id !== 'string' || !id || id.length > 128 || this.tools.has(id)) return this.view();
    // ponytail: retain at most 128 tools in a turn; an unbounded agent loop is not a task progress bar.
    if (this.tools.size >= 128) return this.view();
    this.tools.set(id, { id: redactTaskText(id, 128), name: redactTaskText(name, 96) || 'Werkzeug', status: 'running' });
    this.current.toolCount++;
    return this.view();
  }

  toolEnd({ id, result, error, status = 'complete', sessionId } = {}) {
    if (!this.accepts(sessionId)) return this.view();
    const tool = this.tools.get(id);
    if (!tool || tool.status !== 'running') return this.view();
    tool.status = error ? 'error' : terminalStatus(status) === 'agent-finished' ? 'complete' : terminalStatus(status);
    this.current.completedTools++;
    const proof = spotifyProof(result, tool.name);
    if (proof === false) {
      this.current.evidence = this.current.evidence.filter(item => item.type !== 'spotify-playback');
      this.current.verification = this.current.evidence.length ? 'verified' : 'unknown';
    }
    if (tool.status === 'complete' && proof === true) {
      this.current.verification = 'verified';
      if (!this.current.evidence.some(item => item.type === 'spotify-playback')) {
        this.current.evidence.push({ type: 'spotify-playback', scope: 'tool', tool: tool.name, detail: 'Wiedergabe durch Spotify-Werkzeug bestätigt.' });
      }
    }
    return this.view();
  }

  finish({ status = 'complete', text = '', sessionId } = {}) {
    if (!this.accepts(sessionId)) return this.view();
    const outcome = terminalStatus(status);
    this.current.status = outcome;
    this.current.summary = redactTaskText(text, 1200);
    this.current.finishedAt = this.now();
    for (const tool of this.tools.values()) if (tool.status === 'running') tool.status = outcome === 'error' ? 'error' : 'interrupted';
    this.current.tools = [...this.tools.values()].slice(-8).map(tool => ({ ...tool }));
    return this.view();
  }

  interrupt(reason = 'Auftrag unterbrochen.') { return this.finish({ status: 'interrupted', text: reason }); }

  view() {
    if (!this.current) return null;
    return structuredClone({ ...this.current, tools: [...this.tools.values()].slice(-8) });
  }

  list({ limit = 20 } = {}) {
    const count = Number.isInteger(limit) ? Math.max(0, Math.min(limit, this.maxTasks)) : 20;
    return this.tasks.slice(0, count).map(task => task === this.current ? this.view() : structuredClone(task));
  }
}

module.exports = { TaskLedger, redactTaskText };
