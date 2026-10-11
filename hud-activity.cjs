'use strict';

const clean = (value, limit) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
  : '';
const outcome = status => /^(interrupted|cancelled|canceled|aborted)$/i.test(status || '')
  ? 'interrupted' : /^(complete|completed|success|ok)$/i.test(status || 'complete') ? 'complete' : 'error';

class HudActivity {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.state = 'idle';
    this.title = '';
    this.summary = '';
    this.alertUntil = null;
    this.startedAt = null;
    this.finishedAt = null;
    this.sessionId = null;
    this.completedTools = 0;
    this.tools = new Map();
  }

  start(title, { sessionId = null, kind = 'task' } = {}) {
    this.state = 'busy';
    this.title = clean(title, 160) || (kind === 'monitor' ? 'System prüfen' : 'Auftrag bearbeiten');
    this.summary = '';
    this.alertUntil = null;
    this.startedAt = this.now();
    this.finishedAt = null;
    this.sessionId = sessionId;
    this.completedTools = 0;
    this.tools.clear();
    return this.view();
  }

  toolStart({ id, name, sessionId = null } = {}) {
    if (this.state !== 'busy' || sessionId !== this.sessionId || typeof id !== 'string' || !id || id.length > 128 || this.tools.has(id)) return this.view();
    // ponytail: retain 128 observed tools per task; older rows leave the bounded history.
    if (this.tools.size >= 128) this.tools.delete(this.tools.keys().next().value);
    this.tools.set(id, { id, label: clean(name, 96) || 'Werkzeug', status: 'running' });
    return this.view();
  }

  toolEnd({ id, status, error, sessionId = null } = {}) {
    if (this.state !== 'busy' || sessionId !== this.sessionId) return this.view();
    const tool = this.tools.get(id);
    if (!tool || tool.status !== 'running') return this.view();
    tool.status = error ? 'error' : outcome(status);
    this.completedTools++;
    return this.view();
  }

  complete({ status = 'complete', text = '', sessionId = null } = {}) {
    if (this.state !== 'busy' || sessionId !== this.sessionId) return this.view();
    this.state = outcome(status);
    this.summary = clean(text, 240);
    this.alertUntil = null;
    this.finishedAt = this.now();
    for (const tool of this.tools.values()) {
      if (tool.status === 'running') tool.status = this.state === 'error' ? 'error' : 'interrupted';
    }
    return this.view();
  }

  alert(text) {
    if (this.state === 'busy') {
      this.summary = clean(text, 240);
      this.alertUntil = this.now() + 6000;
      return this.view();
    }
    this.state = 'alert';
    this.title = 'Systemhinweis';
    this.summary = clean(text, 240);
    this.alertUntil = null;
    this.startedAt = this.now();
    this.finishedAt = this.startedAt;
    this.sessionId = null;
    this.completedTools = 0;
    this.tools.clear();
    return this.view();
  }

  view() {
    return {
      visible: this.state === 'busy' || (this.finishedAt !== null && this.now() - this.finishedAt < 6000),
      state: this.state,
      title: this.title,
      steps: Array.from(this.tools.values()).slice(-4).map(tool => ({ ...tool })),
      summary: this.alertUntil !== null && this.now() >= this.alertUntil ? '' : this.summary,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      completedTools: this.completedTools,
      sessionId: this.sessionId
    };
  }
}

module.exports = { HudActivity };
