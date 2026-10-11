'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TaskLedger, redactTaskText } = require('../task-ledger.cjs');

test('an explicitly tagged app task retains its app through completion',()=>{
 const ledger=new TaskLedger();ledger.start({title:'Foto verbessern',sessionId:'live',appId:'light'});ledger.finish({text:'Ein Foto angepasst.',sessionId:'live'});assert.equal(ledger.view().appId,'light');assert.equal(ledger.list()[0].appId,'light');
});

test('finishing an agent turn without observed proof stays unverified', () => {
  let time = 1000;
  const ledger = new TaskLedger({ now: () => time });
  assert.equal(ledger.view(), null);
  ledger.start({ title: 'Spiele Musik', sessionId: 'a' });
  assert.throws(() => ledger.start({ title: 'Parallel' }), /läuft/);
  ledger.toolStart({ id: '1', name: 'spotify_playback', sessionId: 'a' });
  ledger.toolEnd({ id: '1', result: { success: true, status: 204 }, sessionId: 'a' });
  time = 2000;
  const task = ledger.finish({ status: 'complete', text: 'Erledigt, läuft!', sessionId: 'a' });
  assert.equal(task.status, 'agent-finished');
  assert.equal(task.verification, 'unknown');
  assert.deepEqual(task.evidence, []);
  assert.equal(task.startedAt, 1000);
  assert.equal(task.finishedAt, 2000);
  assert.equal(task.completedTools, 1);
});

test('known Spotify result provides evidence only after a successful observed tool', () => {
  const ledger = new TaskLedger();
  ledger.start({ title: 'Titel starten' });
  ledger.toolStart({ id: '1', name: 'spotify_playback' });
  ledger.toolEnd({ id: '1', result: JSON.stringify({ success: true, playback_verified: true, token: 'SECRET' }) });
  assert.equal(ledger.view().status, 'running');
  assert.equal(ledger.view().verification, 'verified');
  assert.equal(ledger.finish({ status: 'complete' }).status, 'agent-finished');
  assert.equal(ledger.view().evidence[0].type, 'spotify-playback');
  assert.equal(ledger.view().evidence[0].scope, 'tool');
  assert.equal(JSON.stringify(ledger.view()).includes('SECRET'), false);
});

test('MCP text JSON proof is accepted but prose, nested page data and generic verified flags are not', () => {
  const cases = [
    [{ content: [{ type: 'text', text: '{"playback_verified":true,"success":true}' }] }, 'spotify_playback', 'verified'],
    [{ playback_verified: 'true' }, 'spotify_playback', 'unknown'],
    ['playback_verified=true', 'spotify_playback', 'unknown'],
    [{ verified: true, success: true }, 'windows_click', 'unknown'],
    [{ page: { playback_verified: true } }, 'spotify_playback', 'unknown'],
    [{ playback_verified: true }, 'browser_get_page', 'unknown'],
    [{ playback_verified: true, success: false }, 'spotify_playback', 'unknown'],
  ];
  for (const [result, name, expected] of cases) {
    const ledger = new TaskLedger();
    ledger.start({ title: 'Test' }); ledger.toolStart({ id: '1', name }); ledger.toolEnd({ id: '1', result });
    assert.equal(ledger.finish({ status: 'complete' }).verification, expected, name + JSON.stringify(result));
  }
});

test('unknown, duplicate, foreign-session and late tools cannot alter the task or fabricate proof', () => {
  const ledger = new TaskLedger(); ledger.start({ title: 'Test', sessionId: 'a' });
  ledger.toolEnd({ id: 'missing', name: 'spotify_playback', result: { playback_verified: true } });
  ledger.toolStart({ id: '1', name: 'spotify_playback', sessionId: 'old' });
  assert.equal(ledger.view().toolCount, 0);
  ledger.toolStart({ id: '1', name: 'spotify_playback', sessionId: 'a' });
  ledger.toolStart({ id: '1', name: 'spotify_playback', sessionId: 'a' });
  ledger.toolEnd({ id: '1', result: { playback_verified: true }, sessionId: 'old' });
  assert.equal(ledger.view().completedTools, 0);
  ledger.toolEnd({ id: '1', error: 'failed', result: { playback_verified: true }, sessionId: 'a' });
  ledger.toolEnd({ id: '1', result: { playback_verified: true }, sessionId: 'a' });
  assert.equal(ledger.view().verification, 'unknown');
  ledger.finish({ status: 'error', text: 'Fehler' });
  ledger.toolStart({ id: '2', name: 'spotify_playback' });
  assert.equal(ledger.view().toolCount, 1);
});

test('an explicitly failed later playback verification withdraws earlier playback evidence', () => {
  const ledger = new TaskLedger(); ledger.start({ title: 'Titel wechseln' });
  ledger.toolStart({ id: '1', name: 'spotify_playback' });
  ledger.toolEnd({ id: '1', result: { playback_verified: true } });
  ledger.toolStart({ id: '2', name: 'spotify_playback' });
  ledger.toolEnd({ id: '2', result: { playback_verified: false, success: false } });
  assert.equal(ledger.finish({ status: 'complete' }).verification, 'unknown');
  assert.deepEqual(ledger.view().evidence, []);
});

test('error, interruption and disconnect remain distinct even when an earlier tool had proof', () => {
  for (const [status, expected] of [['error', 'error'], ['cancelled', 'interrupted'], ['disconnected', 'disconnected']]) {
    const ledger = new TaskLedger(); ledger.start({ title: 'Test' });
    ledger.toolStart({ id: '1', name: 'spotify_playback' });
    ledger.toolEnd({ id: '1', result: { playback_verified: true } });
    ledger.toolStart({ id: '2', name: 'Windows-MCP' });
    const final = ledger.finish({ status });
    assert.equal(final.status, expected);
    assert.equal(final.tools.at(-1).status, expected === 'error' ? 'error' : 'interrupted');
  }
  const ledger = new TaskLedger(); ledger.start({ title: 'Test' });
  assert.equal(ledger.interrupt('Nutzer hat abgebrochen').status, 'interrupted');
});

test('history is bounded and snapshots cannot mutate ledger state', () => {
  const ledger = new TaskLedger({ maxTasks: 2 });
  for (const title of ['Eins', 'Zwei', 'Drei']) { ledger.start({ title }); ledger.finish({ status: 'complete' }); }
  assert.deepEqual(ledger.list().map(task => task.title), ['Drei', 'Zwei']);
  const copy = ledger.view(); copy.title = 'Manipuliert'; copy.evidence.push({ type: 'forged' });
  assert.equal(ledger.view().title, 'Drei'); assert.deepEqual(ledger.view().evidence, []);
  assert.equal(ledger.list({ limit: 1 }).length, 1);
});

test('task text strips credentials before truncation and omits URL query, fragment and login data', () => {
  const raw = 'Bearer TOKEN password="secret words" api_key=KEY {"refresh_token":"REFRESH"} https://user:pass@example.com/path?secret=OTHER#PRIVATE';
  const cleaned = redactTaskText(raw, 1000);
  for (const secret of ['TOKEN', 'secret words', 'KEY', 'REFRESH', 'OTHER', 'PRIVATE', 'user:pass']) assert.equal(cleaned.includes(secret), false, secret);
  assert.match(cleaned, /https:\/\/example\.com\/path/);
  const ledger = new TaskLedger(); ledger.start({ title: raw }); ledger.finish({ status: 'complete', text: raw });
  assert.equal(JSON.stringify(ledger.list()).includes('secret words'), false);
});
