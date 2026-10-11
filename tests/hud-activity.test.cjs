'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const modulePath = require('node:path').join(__dirname, '..', 'hud-activity.cjs');
const { HudActivity } = require(modulePath);

function fixture() {
  let time = 1000;
  return { hud: new HudActivity({ now: () => time }), advance: ms => { time += ms; } };
}

test('a task remains visible without invented steps or progress as time passes', () => {
  const { hud, advance } = fixture();
  assert.equal(hud.view().visible, false);
  hud.start('Öffne die Einstellungen', { sessionId: 'a' });
  advance(60000);
  assert.equal(hud.view().visible, true);
  assert.equal(hud.view().state, 'busy');
  assert.equal(hud.view().startedAt, 1000);
  assert.deepEqual(hud.view().steps, []);
  assert.equal(hud.view().completedTools, 0);
  assert.equal('progress' in hud.view(), false);
});

test('a real tool end updates its step exactly once without counting stale ends', () => {
  const { hud } = fixture();
  hud.start('Öffnen', { sessionId: 'a' });
  hud.toolEnd({ id: 'unknown', name: 'click', sessionId: 'a' });
  hud.toolStart({ id: '1', name: 'WindowsMCP.Click', sessionId: 'a' });
  hud.toolStart({ id: '1', name: 'WindowsMCP.Click', sessionId: 'a' });
  assert.deepEqual(hud.view().steps, [{ id: '1', label: 'WindowsMCP.Click', status: 'running' }]);
  hud.toolEnd({ id: '1', status: 'complete', sessionId: 'a' });
  hud.toolEnd({ id: '1', status: 'error', sessionId: 'a' });
  assert.equal(hud.view().steps[0].status, 'complete');
  assert.equal(hud.view().completedTools, 1);
});

test('session guards reject unrelated tools and task completion', () => {
  const { hud } = fixture();
  hud.start('Aktuell', { sessionId: 'new' });
  hud.toolStart({ id: 'old', name: 'click', sessionId: 'old' });
  hud.complete({ sessionId: 'old', text: 'Fertig' });
  hud.toolStart({ id: 'missing', name: 'click' });
  assert.equal(hud.view().state, 'busy');
  assert.deepEqual(hud.view().steps, []);
  hud.toolStart({ id: '1', name: 'click', sessionId: 'new' });
  hud.toolEnd({ id: '1', status: 'complete', sessionId: 'old' });
  assert.equal(hud.view().steps[0].status, 'running');
});

test('completion retracts after six seconds and rejects late tool events', () => {
  const { hud, advance } = fixture();
  hud.start('Datei öffnen', { sessionId: 'a' });
  advance(400);
  hud.complete({ sessionId: 'a', text: 'Die Datei ist geöffnet.' });
  hud.toolStart({ id: 'late', name: 'click', sessionId: 'a' });
  assert.equal(hud.view().state, 'complete');
  assert.equal(hud.view().finishedAt, 1400);
  assert.equal(hud.view().summary, 'Die Datei ist geöffnet.');
  assert.deepEqual(hud.view().steps, []);
  advance(5999);
  assert.equal(hud.view().visible, true);
  advance(1);
  assert.equal(hud.view().visible, false);
});

test('failure and interruption never become success when a task terminates', () => {
  for (const [status, expected] of [['failed', 'error'], ['error', 'error'], ['interrupted', 'interrupted'], ['cancelled', 'interrupted']]) {
    const { hud } = fixture();
    hud.start('Versuch');
    hud.toolStart({ id: '1', name: 'click' });
    hud.complete({ status });
    assert.equal(hud.view().state, expected);
    assert.equal(hud.view().steps[0].status, expected);
  }
});

test('tool failure remains visible while the agent continues', () => {
  const { hud } = fixture();
  hud.start('Versuch');
  hud.toolStart({ id: '1', name: 'click' });
  hud.toolEnd({ id: '1', error: 'Tool failed with private arguments' });
  assert.equal(hud.view().state, 'busy');
  assert.equal(hud.view().steps[0].status, 'error');
  assert.equal(hud.view().summary, '');
});

test('alerts expire, and a new task replaces an old terminal card', () => {
  const { hud, advance } = fixture();
  hud.alert('Verbindung verloren');
  assert.equal(hud.view().state, 'alert');
  assert.equal(hud.view().summary, 'Verbindung verloren');
  advance(6000);
  assert.equal(hud.view().visible, false);
  hud.start('Neu', { sessionId: 'b' });
  assert.equal(hud.view().state, 'busy');
  assert.equal(hud.view().summary, '');
  assert.equal(hud.view().finishedAt, null);
});

test('bounded recent steps and strings keep the overlay compact', () => {
  const { hud } = fixture();
  hud.start('a'.repeat(2000));
  for (let i = 0; i < 10; i++) {
    hud.toolStart({ id: String(i), name: 'n'.repeat(1000) });
    hud.toolEnd({ id: String(i) });
  }
  assert.deepEqual(hud.view().steps.map(step => step.id), ['6', '7', '8', '9']);
  assert.equal(hud.view().completedTools, 10);
  assert.ok(hud.view().title.length <= 160);
  assert.ok(hud.view().steps.every(step => step.label.length <= 96));
  hud.complete({ text: 's'.repeat(2000) });
  assert.ok(hud.view().summary.length <= 240);
});

test('a returned view cannot mutate the event tracker', () => {
  const { hud } = fixture();
  hud.start('Auftrag');
  hud.toolStart({ id: '1', name: 'click' });
  hud.view().steps[0].status = 'complete';
  hud.view().steps.length = 0;
  assert.equal(hud.view().steps[0].status, 'running');
});

test('new tasks reset tools and reject unmatched old completions', () => {
  const { hud } = fixture();
  hud.start('Alt', { sessionId: 'a' });
  hud.toolStart({ id: 'old', name: 'click', sessionId: 'a' });
  hud.start('Neu', { sessionId: 'b' });
  hud.toolEnd({ id: 'old', sessionId: 'a' });
  assert.equal(hud.view().completedTools, 0);
  assert.deepEqual(hud.view().steps, []);
});

test('completion counts concurrent tools even when their rows left the recent view', () => {
  const { hud } = fixture();
  hud.start('Parallel');
  for (let i = 0; i < 6; i++) hud.toolStart({ id: String(i), name: 'click' });
  for (let i = 0; i < 6; i++) hud.toolEnd({ id: String(i) });
  assert.equal(hud.view().completedTools, 6);
  assert.equal(hud.view().steps.length, 4);
  assert.ok(hud.view().steps.every(step => step.status === 'complete'));
});

test('an alert during a task preserves the running tool and session', () => {
  const { hud, advance } = fixture();
  hud.start('Auftrag', { sessionId: 'a' });
  hud.toolStart({ id: '1', name: 'click', sessionId: 'a' });
  hud.alert('Systemhinweis');
  assert.equal(hud.view().state, 'busy');
  assert.equal(hud.view().sessionId, 'a');
  assert.equal(hud.view().steps[0].status, 'running');
  advance(6000);
  assert.equal(hud.view().summary, '');
  assert.equal(hud.view().visible, true);
  hud.toolEnd({ id: '1', sessionId: 'a' });
  assert.equal(hud.view().completedTools, 1);
});

test('a task completion does not invent successful tool-end events', () => {
  const { hud } = fixture();
  hud.start('Auftrag');
  hud.toolStart({ id: '1', name: 'click' });
  hud.complete({ text: 'Antwort angekommen' });
  assert.equal(hud.view().completedTools, 0);
  assert.equal(hud.view().steps[0].status, 'interrupted');
});

function rendererFixture() {
  const jsPath = require('node:path').join(__dirname, '..', 'ui', 'hud.js');
  assert.ok(fs.existsSync(jsPath), 'HUD must render real events through the dedicated channel');
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.hidden = false; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    set innerHTML(_) { throw new Error('HUD must render external strings as text'); }
  }
  const elements = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement() { return new Element(); }
  };
  let receive, tick, time = 1000;
  const context = { document, window: { hud: { on(fn) { receive = fn; } } }, Date: { now: () => time },
    setInterval(fn) { tick = fn; return 1; } };
  require('node:vm').runInNewContext(fs.readFileSync(jsPath, 'utf8'), context);
  return { elements, send: value => receive(value), advance(ms) { time += ms; tick(); } };
}

test('renderer uses text for untrusted content and maps observed Windows tools', () => {
  const { elements, send } = rendererFixture();
  send({ type: 'hud', visible: true, state: 'busy', title: '<img src=x>',
    summary: '<script>secret()</script>', startedAt: 1000, finishedAt: null, completedTools: 0,
    steps: [{ id: '1', label: 'mcp__windows__click', status: 'running' }] });
  assert.equal(elements.get('hud-title').textContent, '<img src=x>');
  assert.equal(elements.get('hud-summary').textContent, '<script>secret()</script>');
  assert.equal(elements.get('hud-steps').children[0].children[1].textContent, 'Klicken');
});

test('renderer advances elapsed time only while busy and ignores other channels', () => {
  const { elements, send, advance } = rendererFixture();
  send({ type: 'hud', visible: true, state: 'busy', title: 'Aktuell',
    summary: '', startedAt: 1000, finishedAt: null, completedTools: 1, steps: [] });
  advance(3000);
  assert.equal(elements.get('hud-elapsed').textContent, '00:03');
  send({ type: 'stats', title: 'Nicht dieser Kanal' });
  assert.equal(elements.get('hud-title').textContent, 'Aktuell');
  send({ type: 'hud', visible: true, state: 'complete', title: 'Aktuell',
    summary: 'Fertig', startedAt: 1000, finishedAt: 4000, completedTools: 1, steps: [] });
  advance(2000);
  assert.equal(elements.get('hud-elapsed').textContent, '00:03');
});
