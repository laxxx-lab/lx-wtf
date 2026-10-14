'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const modulePath = path.join(__dirname, '../job-queue.cjs');

test('delegated jobs free the lane and finish only from their own child result',()=>{
 const {JobQueue}=require(modulePath),q=new JobQueue(),owner={sessionId:'s',profile:'default'},a=q.enqueue({...owner,text:'Analyse'}),b=q.enqueue({...owner,text:'Hallo'});q.claim(owner);q.accepted(a.id,{runtimeId:'r'});q.delegate(a.id);assert.equal(q.active(),null);assert.equal(q.list()[0].status,'delegated');assert.equal(q.claim(owner).id,b.id);q.finish(a.id,{status:'agent-finished',summary:'Analyse gemeldet'});assert.equal(q.list()[0].status,'agent-finished');assert.equal(q.active().id,b.id);
});
test('a waiting resource conflict does not block a later conversation',()=>{
 const {JobQueue}=require(modulePath),q=new JobQueue(),owner={sessionId:'s',profile:'default'},a=q.enqueue({...owner,text:'Desktop wartet'}),b=q.enqueue({...owner,text:'Hallo'});assert.equal(q.claim({...owner,canRun:job=>job.id!==a.id}).id,b.id);
});
test('a fresh user turn takes priority over queued background summaries',()=>{
 const {JobQueue}=require(modulePath),q=new JobQueue(),owner={sessionId:'s',profile:'default'};q.enqueue({...owner,text:'Summary',kind:'background-result',sourceJobId:'00000000-0000-4000-8000-000000000001'});const spoken=q.enqueue({...owner,text:'Neue Nutzerfrage'});assert.equal(q.claim(owner).id,spoken.id);
});

function fixture(t, initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-queue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'jobs.json');
  if (initial !== undefined) fs.writeFileSync(file, initial);
  assert.ok(fs.existsSync(modulePath), 'durable job queue is not implemented');
  return { file, dir, create: options => new (require(modulePath).JobQueue)({ file, now: () => 1000, ...options }) };
}
function enqueue(queue, extra = {}) { return queue.enqueue({ text: 'Do this task.', sessionId: 'session-a', ...extra }); }

test('queued correction preserves ID and ownership while atomically persisting a redacted revision', t => {
  const events = [], f = fixture(t), queue = f.create({ onChange: value => events.push(value) });
  const job = enqueue(queue, { profile: 'work', speak: false, turnId: 'turn-1', resource: 'desktop' });
  assert.equal(typeof queue.amendQueued, 'function'); assert.equal(typeof queue.owned, 'function');
  assert.equal(job.revision, 1);
  assert.equal(queue.owned(job.id, { sessionId: 'foreign', profile: 'work' }), null);
  const original = queue.owned(job.id, { sessionId: 'session-a', profile: 'work' }); original.text = 'Changed copy';
  const changed = queue.amendQueued(job.id, { sessionId: 'session-a', profile: 'work', expectedRevision: 1, text: 'PRIVATE CORRECTION token=SECRET-TEXT', title: 'Revision token=SECRET-TITLE' });
  assert.equal(changed.id, job.id); assert.equal(changed.revision, 2); assert.equal(changed.status, 'queued');
  assert.equal(changed.text, 'PRIVATE CORRECTION token=SECRET-TEXT'); assert.equal(changed.sessionId, 'session-a'); assert.equal(changed.profile, 'work');
  assert.equal(changed.speak, false); assert.equal(changed.turnId, 'turn-1'); assert.equal(changed.resource, 'desktop');
  assert.equal(changed.attempts, 0); assert.equal(changed.acceptedAt, null);
  const shown = JSON.stringify([queue.snapshot(), events]); assert.doesNotMatch(shown, /PRIVATE CORRECTION|SECRET-TEXT|SECRET-TITLE/);
  assert.equal(queue.list()[0].revision, 2); assert.equal(queue.list()[0].updatedAt, 1000);
  assert.equal(f.create().claim({ sessionId: 'session-a', profile: 'work' }).text, changed.text);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).jobs[0].revision, 2);
});

test('correction rejects foreign ownership, stale revisions and every dispatched or non-user job', t => {
  const q = fixture(t).create(), job = enqueue(q), change = { sessionId: 'session-a', text: 'Changed' };
  assert.equal(typeof q.amendQueued, 'function');
  for (const extra of [{ sessionId: 'foreign' }, { profile: 'other' }, { expectedRevision: 2 }]) assert.equal(q.amendQueued(job.id, { ...change, ...extra }), null);
  assert.equal(q.amendQueued('missing', change), null);
  for (const extra of [{ text: '' }, { text: 'x'.repeat(20001) }, { text: 'bad\0input' }, { sessionId: '' }, { profile: '../other' }, { title: {} }, { expectedRevision: 0 }, { expectedRevision: 1.5 }]) assert.throws(() => q.amendQueued(job.id, { ...change, ...extra }));
  assert.equal(q.owned(job.id, { sessionId: 'session-a' }).text, 'Do this task.');
  const report = enqueue(q, { kind: 'background-result', sourceJobId: job.id }); assert.equal(q.amendQueued(report.id, change), null);
  q.claim({ sessionId: 'session-a' }); assert.equal(q.amendQueued(job.id, change), null);
  q.accepted(job.id, { runtimeId: 'remote' }); assert.equal(q.amendQueued(job.id, change), null);
  q.unknown(job.id); assert.equal(q.amendQueued(job.id, change), null);
  q.delegate(job.id); assert.equal(q.amendQueued(job.id, change), null);
  q.finish(job.id); assert.equal(q.amendQueued(job.id, change), null);
});

test('failed queued amendment preserves old instructions, revision, storage and observers', t => {
  const events = [], f = fixture(t), q = f.create({ onChange: value => events.push(value) }), job = enqueue(q);
  assert.equal(typeof q.amendQueued, 'function');
  const saved = fs.readFileSync(f.file, 'utf8'); fs.unlinkSync(f.file); fs.mkdirSync(f.file);
  assert.throws(() => q.amendQueued(job.id, { sessionId: 'session-a', text: 'Replacement' }));
  assert.equal(q.owned(job.id, { sessionId: 'session-a' }).text, 'Do this task.'); assert.equal(q.list()[0].revision, 1); assert.equal(events.length, 1);
  assert.deepEqual(fs.readdirSync(f.dir), ['jobs.json']); fs.rmdirSync(f.file); fs.writeFileSync(f.file, saved);
  assert.equal(f.create().claim({ sessionId: 'session-a' }).text, 'Do this task.');
});

test('old queue records get revision one and malformed persisted revisions fail closed', t => {
  const f = fixture(t), q = f.create(), job = enqueue(q); const stored = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  delete stored.jobs[0].revision; fs.writeFileSync(f.file, JSON.stringify(stored));
  const old = f.create(); assert.equal(old.list()[0].revision, 1);
  assert.equal(old.amendQueued(job.id, { sessionId: 'session-a', text: 'Updated old job' }).revision, 2);
  for (const revision of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    stored.jobs[0].revision = revision; fs.writeFileSync(f.file, JSON.stringify(stored)); const invalid = f.create();
    assert.deepEqual(invalid.list(), []); assert.equal(invalid.snapshot().held, true);
  }
});

test('stale queued editor cannot change a claimed request and revision exhaustion preserves its text', t => {
  const f = fixture(t), q = f.create(), job = enqueue(q), editor = q.owned(job.id, { sessionId: 'session-a' });
  const claimed = q.claim({ sessionId: 'session-a' });
  assert.equal(q.amendQueued(editor.id, { sessionId: 'session-a', expectedRevision: editor.revision, text: 'Late change' }), null);
  assert.equal(claimed.text, 'Do this task.'); assert.equal(q.active().text, 'Do this task.');
  const stored = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  Object.assign(stored.jobs[0], { status: 'queued', startedAt: null, attempts: 0, revision: Number.MAX_SAFE_INTEGER });
  fs.writeFileSync(f.file, JSON.stringify(stored)); const exhausted = f.create();
  assert.throws(() => exhausted.amendQueued(job.id, { sessionId: 'session-a', text: 'Too many changes' }), /revision/i);
  assert.equal(exhausted.owned(job.id, { sessionId: 'session-a' }).text, 'Do this task.');
});

test('owned undisbursed preparation can be durably cancelled only at its exact revision', t => {
  const f = fixture(t), q = f.create(), job = enqueue(q); q.claim({ sessionId: 'session-a' });
  assert.equal(typeof q.cancelPrepared, 'function');
  const input = { sessionId: 'session-a', expectedRevision: 1 };
  for (const extra of [{ sessionId: 'foreign' }, { profile: 'other' }, { expectedRevision: 2 }]) assert.equal(q.cancelPrepared(job.id, { ...input, ...extra }), null);
  assert.equal(q.cancelPrepared('missing', input), null);
  for (const expectedRevision of [undefined, 0, -1, 1.5, '1']) assert.throws(() => q.cancelPrepared(job.id, { ...input, expectedRevision }), /Revision/i);
  const cancelled = q.cancelPrepared(job.id, input);
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.verified, false); assert.equal(cancelled.finishedAt, 1000);
  assert.equal(cancelled.reason, 'Vor Ausführung durch Änderung ersetzt.'); assert.equal(cancelled.id, job.id); assert.equal(cancelled.revision, 1);
  assert.equal(cancelled.acceptedAt, null); assert.equal(cancelled.runtimeId, null); assert.equal(q.active(), null);
  cancelled.text = 'Changed copy'; assert.equal(q.owned(job.id, { sessionId: 'session-a' }).text, 'Do this task.');
  assert.equal(f.create().list()[0].status, 'cancelled'); assert.equal(q.cancelPrepared(job.id, input), null);
});

test('prepared cancellation never releases accepted, local, unknown, delegated or report work', () => {
  const { JobQueue } = require(modulePath), owner = { sessionId: 'session-a', expectedRevision: 1 };
  for (const state of ['queued', 'accepted', 'local', 'unknown', 'delegated', 'report']) {
    const q = new JobQueue(), job = enqueue(q, state === 'report' ? { kind: 'background-result', sourceJobId: '00000000-0000-4000-8000-000000000001' } : {});
    if (state !== 'queued') q.claim(owner);
    if (state === 'accepted') q.accepted(job.id, { runtimeId: 'remote' });
    if (state === 'local') q.setLocal(job.id, { type: 'volume', action: 'mute' });
    if (state === 'unknown') q.unknown(job.id);
    if (state === 'delegated') q.delegate(job.id);
    assert.equal(q.cancelPrepared(job.id, owner), null, state);
  }
});

test('failed prepared cancellation retains ownership gate and sends no safe event', t => {
  const events = [], f = fixture(t), q = f.create({ onChange: value => events.push(value) }), job = enqueue(q); q.claim({ sessionId: 'session-a' });
  assert.equal(typeof q.cancelPrepared, 'function');
  const saved = fs.readFileSync(f.file, 'utf8'); fs.unlinkSync(f.file); fs.mkdirSync(f.file);
  assert.throws(() => q.cancelPrepared(job.id, { sessionId: 'session-a', expectedRevision: 1 }));
  assert.equal(q.active().id, job.id); assert.equal(q.active().status, 'running'); assert.equal(events.length, 2);
  fs.rmdirSync(f.file); fs.writeFileSync(f.file, saved);
});
test('pending voice identity belongs to the first queued request of that exact owner',t=>{
 const q=fixture(t).create();enqueue(q,{sessionId:'foreign',turnId:'foreign-turn'});const own=enqueue(q,{turnId:'own-first'});enqueue(q,{turnId:'own-second'});
 assert.equal(q.pendingTurn({sessionId:'session-a'}),'own-first');assert.equal(q.pendingTurn({sessionId:'session-a',profile:'other'}),null);q.claim({sessionId:'session-a'});assert.equal(q.pendingTurn({sessionId:'session-a'}),'own-second');q.finish(own.id);assert.equal(q.pendingTurn({sessionId:'session-a'}),'own-second');assert.throws(()=>q.pendingTurn({sessionId:''}));
});

test('local execution identity survives restart without exposing the native command or replaying it', t => {
 const f=fixture(t),queue=f.create(),job=enqueue(queue,{text:'Lautstärke auf 25 Prozent'});queue.claim({sessionId:'session-a'});
 assert.equal(typeof queue.setLocal,'function');queue.setLocal(job.id,{type:'volume',action:'set',value:25});
 assert.equal(queue.active().executor,'local');assert.equal(JSON.stringify(queue.snapshot()).includes('localCommand'),false);
 const resumed=f.create();assert.equal(resumed.active().executor,'local');assert.deepEqual(resumed.active().localCommand,{type:'volume',action:'set',value:25});assert.equal(resumed.active().status,'outcome-unknown');
 resumed.reconcile(job.id,{remoteRunning:false});const retried=resumed.retry(job.id);assert.equal(retried.executor,'hermes');assert.equal(retried.localCommand,null);
});
test('only allowlisted commands can be recorded as local and a remote accepted job cannot change executor', t => {
 const q=fixture(t).create(),job=enqueue(q);q.claim({sessionId:'session-a'});assert.equal(typeof q.setLocal,'function');
 assert.throws(()=>q.setLocal(job.id,{type:'shell',command:'anything'}));q.accepted(job.id,{runtimeId:'remote'});assert.equal(q.setLocal(job.id,{type:'volume',action:'mute'}),null);
});
test('local handover context stays bound to the original owner and excludes paths or instructions', t => {
 const q=fixture(t).create(),job=enqueue(q,{text:'Öffne Test',title:'Öffne Test'});q.claim({sessionId:'session-a'});q.setLocal(job.id,{type:'app.open',app:{id:'C:\\Private\\Test.exe',name:'Test'}});q.finish(job.id,{status:'complete',summary:'Test geöffnet.',verified:true});
 assert.equal(typeof q.localContext,'function');assert.equal(q.localContext({sessionId:'session-b'}).length,0);const data=q.localContext({sessionId:'session-a'});assert.equal(data.length,1);assert.equal(data[0].verified,true);assert.equal(data[0].action.app,'Test');assert.doesNotMatch(JSON.stringify(data),/Private|session-a|localCommand|Öffne Test/);
});

test('claims once serially for the exact stored session and profile without changing instructions', t => {
  const f = fixture(t), queue = f.create();
  const text = '  Exact instructions.\nKeep this spacing and token=PRIVATE.  ';
  const first = enqueue(queue, { text, profile: 'work', appId: 'osiris', speak: false });
  const second = enqueue(queue, { sessionId: 'session-b' });
  assert.equal(queue.claim({ sessionId: 'session-a' }), null);
  const claimed = queue.claim({ sessionId: 'session-a', profile: 'work' });
  assert.equal(claimed.id, first.id);
  assert.equal(claimed.text, text);
  assert.equal(claimed.sessionId, 'session-a');
  assert.equal(claimed.profile, 'work');
  assert.equal(claimed.appId, 'osiris');
  assert.equal(claimed.speak, false);
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attempts, 1);
  assert.equal(queue.claim({ sessionId: 'session-b' }), null);
  assert.equal(queue.accepted(first.id, { runtimeId: 'runtime-1' }).runtimeId, 'runtime-1');
  assert.equal(queue.finish(first.id).status, 'agent-finished');
  assert.equal(queue.claim({ sessionId: 'session-b' }).id, second.id);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).jobs[0].text, text);
  assert.deepEqual(fs.readdirSync(f.dir), ['jobs.json']);
});

test('agent completion remains distinct from verified completion and late IDs cannot finish another job', t => {
  const queue = fixture(t).create(), first = enqueue(queue), second = enqueue(queue);
  queue.claim({ sessionId: 'session-a' });
  assert.equal(queue.finish(first.id, { status: 'completed', summary: 'Agent says done.' }).status, 'agent-finished');
  assert.equal(queue.list()[0].verified, false);
  queue.claim({ sessionId: 'session-a' });
  assert.equal(queue.finish(first.id, { verified: true }), null);
  assert.equal(queue.accepted(first.id, { runtimeId: 'late' }), null);
  assert.equal(queue.active().id, second.id);
  assert.equal(queue.finish(second.id, { verified: true }).status, 'completed');
  assert.equal(queue.list()[1].verified, true);
  assert.equal(queue.active(), null);
});

test('unknown remote outcome blocks unrelated queued jobs until explicit reconciliation', t => {
  const queue = fixture(t).create(), first = enqueue(queue), second = enqueue(queue, { sessionId: 'session-b' });
  queue.claim({ sessionId: 'session-a' });
  queue.unknown(first.id, 'Timeout after send.');
  assert.equal(queue.snapshot().blocked, true);
  assert.equal(queue.retry(first.id), null);
  assert.equal(queue.finish(first.id, { verified: true }), null);
  queue.resumeQueue();
  assert.equal(queue.claim({ sessionId: 'session-b' }), null);
  assert.equal(queue.reconcile(first.id, { remoteRunning: false, summary: 'Remote checked, effect uncertain.' }).status, 'paused');
  assert.equal(queue.snapshot().blocked, false);
  assert.equal(queue.claim({ sessionId: 'session-b' }).id, second.id);
});

test('reconciliation can reattach remote running work or settle only with verification', t => {
  const queue = fixture(t).create(), first = enqueue(queue), second = enqueue(queue);
  queue.claim({ sessionId: 'session-a' }); queue.unknown(first.id, 'Disconnect');
  assert.throws(() => queue.reconcile(first.id, { remoteRunning: 'false' }), /remoteRunning/);
  assert.equal(queue.snapshot().blocked, true);
  const running = queue.reconcile(first.id, { remoteRunning: true, runtimeId: 'reattached', verified: true });
  assert.equal(running.status, 'running');
  assert.equal(running.verified, false);
  assert.equal(running.runtimeId, 'reattached');
  assert.equal(queue.claim({ sessionId: 'session-a' }), null);
  assert.equal(queue.accepted(first.id, { runtimeId: 'reattached' }).runtimeId, 'reattached');
  queue.unknown(first.id, 'Disconnected again');
  assert.equal(queue.reconcile(first.id, { remoteRunning: false, verified: true }).status, 'completed');
  assert.equal(queue.claim({ sessionId: 'session-a' }).id, second.id);
});

test('restart converts running work to outcome-unknown and never blindly replays it', t => {
  const f = fixture(t), queue = f.create(), first = enqueue(queue, { profile: 'research' });
  enqueue(queue, { sessionId: 'session-b' });
  queue.claim({ sessionId: 'session-a', profile: 'research' });
  queue.accepted(first.id, { runtimeId: 'hermes-42' });
  const recovered = f.create({ now: () => 2000 });
  assert.equal(recovered.active().status, 'outcome-unknown');
  assert.equal(recovered.active().sessionId, 'session-a');
  assert.equal(recovered.active().profile, 'research');
  assert.equal(recovered.active().runtimeId, 'hermes-42');
  assert.equal(recovered.claim({ sessionId: 'session-b' }), null);
  assert.equal(f.create().snapshot().blocked, true);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).jobs[0].status, 'outcome-unknown');
});

test('a queue hold survives restart and explicit resume does not clear unknown gates', t => {
  const f = fixture(t), queue = f.create(), first = enqueue(queue);
  queue.pauseAll('Privacy lock active token=PRIVATE');
  assert.equal(queue.pending(), true);
  assert.equal(queue.claim({ sessionId: 'session-a' }), null);
  const held = f.create();
  assert.equal(held.snapshot().held, true);
  assert.ok(!held.snapshot().holdReason.includes('PRIVATE'));
  held.resumeQueue();
  assert.equal(held.claim({ sessionId: 'session-a' }).id, first.id);
  held.unknown(first.id, 'Timeout'); held.pauseAll('Manual hold'); held.resumeQueue();
  assert.equal(held.snapshot().held, false);
  assert.equal(held.snapshot().blocked, true);
});

test('cancel of active work cannot falsely release the remote dispatch gate', t => {
  const queue = fixture(t).create(), first = enqueue(queue), second = enqueue(queue);
  queue.claim({ sessionId: 'session-a' });
  assert.equal(queue.cancel(first.id).status, 'outcome-unknown');
  assert.equal(queue.cancel(first.id).status, 'outcome-unknown');
  assert.equal(queue.claim({ sessionId: 'session-a' }), null);
  assert.equal(queue.cancel(second.id).status, 'cancelled');
  queue.reconcile(first.id, { remoteRunning: false });
  assert.equal(queue.cancel(first.id).status, 'cancelled');
  assert.equal(queue.pending(), false);
});

test('retry requires a deliberate paused or error outcome and replaces the old event ID', t => {
  const queue = fixture(t).create(), first = enqueue(queue);
  assert.equal(queue.retry(first.id), null);
  queue.claim({ sessionId: 'session-a' }); queue.unknown(first.id, 'Timeout');
  assert.equal(queue.retry(first.id), null);
  queue.reconcile(first.id, { remoteRunning: false });
  const retried = queue.retry(first.id);
  assert.notEqual(retried.id, first.id);
  assert.equal(retried.status, 'queued');
  assert.equal(retried.sessionId, 'session-a');
  assert.equal(retried.text, 'Do this task.');
  assert.equal(retried.runtimeId, null);
  queue.claim({ sessionId: 'session-a' });
  assert.equal(queue.finish(first.id, { verified: true }), null);
  assert.equal(queue.finish(retried.id, { status: 'error' }).status, 'error');
  assert.equal(queue.retry(retried.id).status, 'queued');
});

test('display snapshots and change events exclude private instructions, ownership and remote identifiers', t => {
  const events = [], f = fixture(t), queue = f.create({ onChange: snapshot => events.push(snapshot) });
  const job = enqueue(queue, {
    text: 'PRIVATE RAW INSTRUCTIONS token=SECRET-INSTRUCTIONS', sessionId: 'PRIVATE-SESSION',
    title: 'Title password="PRIVATE PASSWORD" https://alice:PRIVATE-LOGIN@example.org/path?token=PRIVATE-QUERY#PRIVATE-HASH',
  });
  queue.claim({ sessionId: 'PRIVATE-SESSION' }); queue.accepted(job.id, { runtimeId: 'PRIVATE-RUNTIME' });
  queue.finish(job.id, { summary: 'Bearer PRIVATE-BEARER secret=PRIVATE-SUMMARY' });
  const shown = JSON.stringify([queue.list(), queue.snapshot(), events]);
  for (const secret of ['PRIVATE RAW', 'SECRET-INSTRUCTIONS', 'PRIVATE-SESSION', 'PRIVATE PASSWORD', 'PRIVATE-LOGIN', 'PRIVATE-QUERY', 'PRIVATE-HASH', 'PRIVATE-RUNTIME', 'PRIVATE-BEARER', 'PRIVATE-SUMMARY']) assert.ok(!shown.includes(secret), secret);
  assert.ok(!Object.hasOwn(queue.list()[0], 'text'));
  assert.ok(!Object.hasOwn(queue.list()[0], 'sessionId'));
  assert.ok(!Object.hasOwn(queue.list()[0], 'runtimeId'));
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).jobs[0].text, 'PRIVATE RAW INSTRUCTIONS token=SECRET-INSTRUCTIONS');
});

test('returned records cannot mutate private queue state and observers cannot break persistence', t => {
  const f = fixture(t), queue = f.create({ onChange: snapshot => { snapshot.jobs.length = 0; throw new Error('View failed'); } });
  const job = enqueue(queue); job.text = 'Changed';
  const claimed = queue.claim({ sessionId: 'session-a' }); claimed.sessionId = 'Changed';
  const active = queue.active(); active.status = 'completed';
  const shown = queue.list(); shown[0].title = 'Changed';
  assert.equal(queue.active().text, 'Do this task.');
  assert.equal(queue.active().sessionId, 'session-a');
  assert.equal(queue.active().status, 'running');
  assert.equal(queue.list()[0].title, 'Auftrag bearbeiten');
  assert.equal(f.create().list().length, 1);
});

test('bounds private input and retains pending work instead of evicting it for new jobs', t => {
  const queue = fixture(t).create();
  for (const extra of [{ text: '' }, { text: 'x'.repeat(20001) }, { sessionId: '' }, { profile: '../other' }, { speak: 'yes' }, { appId: '../../app' }]) assert.throws(() => enqueue(queue, extra), /text|sessionId|profile|speak|appId/);
  for (let i = 0; i < 50; i++) enqueue(queue, { title: 'Job ' + i });
  assert.throws(() => enqueue(queue), /full|50/i);
  assert.equal(queue.list().length, 50);
  const first = queue.claim({ sessionId: 'session-a' }); queue.finish(first.id);
  enqueue(queue, { title: 'Replacement' });
  assert.equal(queue.list().length, 50);
  assert.equal(queue.list()[0].title, 'Job 1');
  assert.equal(queue.list().at(-1).title, 'Replacement');
});

test('malformed or excessive persisted jobs fail closed instead of becoming dispatchable instructions', t => {
  const f = fixture(t, '{ bad JSON'), queue = f.create();
  assert.deepEqual(queue.list(), []);
  assert.equal(queue.snapshot().held, true);
  assert.equal(queue.claim({ sessionId: 'session-a' }), null);
  queue.resumeQueue();
  enqueue(queue); queue.pauseAll('Hold');
  const stored = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  for (const mutate of [value => { value.jobs[0].text = { command: 'run' }; }, value => { value.jobs[0].status = 'launch'; }, value => { value.jobs[0].sessionId = null; }, value => { value.jobs = Array.from({ length: 51 }, () => value.jobs[0]); }, value => { value.jobs[0].verified = true; }, value => { value.jobs[0].status = 'error'; value.jobs[0].finishedAt = 1000; }]) {
    const invalid = structuredClone(stored); mutate(invalid); fs.writeFileSync(f.file, JSON.stringify(invalid));
    const rejected = f.create();
    assert.deepEqual(rejected.list(), []);
    assert.equal(rejected.snapshot().held, true);
    assert.equal(rejected.claim({ sessionId: 'session-a' }), null);
  }
});

test('oversized storage is never read as executable queue state', t => {
  const f = fixture(t, 'x'.repeat(8 * 1024 * 1024 + 1)), queue = f.create();
  assert.deepEqual(queue.list(), []);
  assert.equal(queue.snapshot().held, true);
});

test('failed atomic replacement leaves memory, stored jobs and notifications unchanged', t => {
  const events = [], f = fixture(t), queue = f.create({ onChange: value => events.push(value) });
  const first = enqueue(queue);
  const saved = fs.readFileSync(f.file, 'utf8');
  fs.unlinkSync(f.file); fs.mkdirSync(f.file);
  assert.throws(() => enqueue(queue));
  assert.equal(queue.list().length, 1);
  assert.equal(queue.list()[0].id, first.id);
  assert.equal(events.length, 1);
  assert.deepEqual(fs.readdirSync(f.dir), ['jobs.json']);
  fs.rmdirSync(f.file); fs.writeFileSync(f.file, saved);
  assert.equal(f.create().list().length, 1);
});

test('isolated memory queues accept no file and retain a validated private voice turn ID', () => {
  const { JobQueue } = require(modulePath);
  for (const file of [null, undefined]) {
    const queue = new JobQueue({ file, now: () => 1000 });
    const first = enqueue(queue, { turnId: 'voice-turn:42' });
    assert.equal(queue.claim({ sessionId: 'session-a' }).turnId, 'voice-turn:42');
    assert.equal(queue.active().turnId, 'voice-turn:42');
    assert.ok(!Object.hasOwn(queue.list()[0], 'turnId'));
    assert.equal(queue.finish(first.id).status, 'agent-finished');
    assert.throws(() => enqueue(queue, { turnId: 'bad\nturn' }), /turnId/);
    assert.throws(() => enqueue(queue, { turnId: 'x'.repeat(129) }), /turnId/);
  }
});

test('disconnect and timeout finishes require reconciliation even when caller passes verified', t => {
  const queue = fixture(t).create(), first = enqueue(queue);
  queue.claim({ sessionId: 'session-a' });
  assert.equal(queue.finish(first.id, { status: 'disconnected', verified: true }).status, 'outcome-unknown');
  queue.reconcile(first.id, { remoteRunning: true });
  assert.equal(queue.finish(first.id, { status: 'timeout', verified: true }).status, 'outcome-unknown');
  assert.equal(queue.snapshot().blocked, true);
});
test('desktop resource survives a queue restart without dispatching a stored routine',t=>{const f=fixture(t),q=f.create(),a=enqueue(q,{resource:'desktop'});const restored=f.create();assert.equal(restored.list().find(j=>j.id===a.id).resource,'desktop');assert.equal(restored.claim({sessionId:'session-a',canRun:j=>j.resource!=='desktop'}),null);assert.throws(()=>enqueue(restored,{resource:'camera'}));});
test('an interrupted pure background report pauses without an unknown-action gate',t=>{const f=fixture(t),q=f.create(),a=enqueue(q,{kind:'background-result',sourceJobId:'00000000-0000-4000-8000-000000000001'});q.claim({sessionId:'session-a'});q.accepted(a.id,{runtimeId:'r'});const restored=f.create();assert.equal(restored.list()[0].status,'paused');assert.equal(restored.snapshot().blocked,false);const question=enqueue(restored);assert.equal(restored.claim({sessionId:'session-a'}).id,question.id);});
