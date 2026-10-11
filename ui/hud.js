'use strict';
(() => {
  const card = document.getElementById('hud-card');
  const title = document.getElementById('hud-title');
  const status = document.getElementById('hud-status');
  const steps = document.getElementById('hud-steps');
  const empty = document.getElementById('hud-empty');
  const summary = document.getElementById('hud-summary');
  const elapsed = document.getElementById('hud-elapsed');
  const count = document.getElementById('hud-count');
  const states = { busy: 'AKTIV', complete: 'ERLEDIGT', error: 'FEHLER', interrupted: 'GESTOPPT', alert: 'HINWEIS', idle: 'BEREIT' };
  const toolStates = { running: ['','AKTIV'], complete: ['✓','FERTIG'], error: ['×','FEHLER'], interrupted: ['−','GESTOPPT'] };
  const tools = {
    click: 'Klicken', doubleclick: 'Doppelklicken', rightclick: 'Rechtsklicken', type: 'Text eingeben',
    scroll: 'Scrollen', move: 'Maus bewegen', drag: 'Ziehen', shortcut: 'Tastenkürzel',
    key: 'Taste drücken', keypress: 'Taste drücken', presskey: 'Taste drücken',
    snapshot: 'Bildschirm prüfen', screenshot: 'Bildschirm erfassen',
    state: 'Desktop prüfen', getstate: 'Desktop prüfen', app: 'Anwendung steuern',
    launch: 'Anwendung öffnen', openapp: 'Anwendung öffnen', search: 'Suchen',
    powershell: 'Windows-Befehl ausführen', shell: 'Windows-Befehl ausführen',
    execute: 'Befehl ausführen', clipboard: 'Zwischenablage', wait: 'Warten', scrape: 'Inhalt lesen'
  };
  let current = null;
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  function toolLabel(raw) {
    const label = text(raw, 96);
    if (!/windows|mcp/i.test(label)) return label || 'Werkzeug';
    const key = label.split(/__|[.:/]/).pop().replace(/[-_\s]/g, '').toLowerCase();
    return tools[key] || label;
  }
  function updateElapsed() {
    if (!current || !Number.isFinite(current.startedAt)) return;
    const end = Number.isFinite(current.finishedAt) ? current.finishedAt : Date.now();
    const seconds = Math.max(0, Math.floor((end - current.startedAt) / 1000));
    elapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function render(data) {
    if (!data || data.type !== 'hud') return;
    current = data;
    card.hidden = !data.visible;
    card.dataset.state = Object.hasOwn(states, data.state) ? data.state : 'idle';
    title.textContent = text(data.title, 160);
    status.textContent = states[card.dataset.state];
    summary.textContent = text(data.summary, 240);
    summary.hidden = !summary.textContent;
    const rows = Array.isArray(data.steps) ? data.steps.slice(-4) : [];
    steps.replaceChildren();
    for (const step of rows) {
      if (!step || typeof step !== 'object') continue;
      const row = document.createElement('li');
      row.className = 'hud-step';
      row.dataset.status = Object.hasOwn(toolStates, step.status) ? step.status : 'interrupted';
      const mark = document.createElement('span');
      mark.className = 'hud-step-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = toolStates[row.dataset.status][0];
      const label = document.createElement('span');
      label.className = 'hud-step-label';
      label.textContent = toolLabel(step.label);
      const detail = document.createElement('span');
      detail.className = 'hud-step-status';
      detail.textContent = toolStates[row.dataset.status][1];
      row.append(mark, label, detail);
      steps.append(row);
    }
    empty.hidden = rows.length > 0 || data.state !== 'busy';
    steps.hidden = rows.length === 0;
    count.textContent = `${Number.isSafeInteger(data.completedTools) && data.completedTools >= 0 ? data.completedTools : 0} WERKZEUGE BEENDET`;
    elapsed.textContent = '00:00';
    updateElapsed();
  }
  window.hud?.on(render);
  setInterval(() => { if (current?.state === 'busy' && current.visible) updateElapsed(); }, 1000);
})();
