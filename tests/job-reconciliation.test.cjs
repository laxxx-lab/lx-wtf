'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const modulePath = path.join(__dirname, '../job-reconciliation.cjs');
const job = Object.freeze({
  id: 'eb4ab7ec-9f68-4b92-a4cb-d6f2f57e7d31', sessionId: 'stored/a?x', profile: 'work',
  runtimeId: 'old-runtime', text: 'Do the requested action.', status: 'outcome-unknown',
});
const marker = '[Lilith-Auftrag: eb4ab7ec-9f68-4b92-a4cb-d6f2f57e7d31]';
const user = (content = marker + '\nDo the requested action.', timestamp = 20) => ({ role: 'user', content, timestamp });

function verify(gateway, input = job) {
  assert.ok(fs.existsSync(modulePath), 'job reconciliation is not implemented');
  return require(modulePath).verifyJobOutcome({ gateway, job: input });
}
function gatewayFor(messages, resume = { running: false, session_id: 'new-runtime' }, extra = {}) {
  return {
    request: async (method, params, timeout) => {
      assert.equal(method, 'session.resume');
      assert.deepEqual(params, { session_id: 'stored/a?x', profile: 'work', omit_messages: true, inline_images: false });
      assert.ok(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 15000);
      return resume;
    },
    json: async route => {
      assert.equal(route, '/api/sessions/stored%2Fa%3Fx/messages?limit=8&order=latest&inline_images=false&profile=work');
      return { session_id: 'stored/a?x', messages, ...extra };
    },
  };
}

test('a delayed old terminal message cannot end the marked request while Hermes is running', async () => {
  const result = await verify(gatewayFor([user(), { role: 'assistant', content: 'Finished the older request.', timestamp: 21 }], { running: true, session_id: 'new-runtime' }));
  assert.equal(result.correlated, true);
  assert.equal(result.remoteRunning, true);
  assert.equal(result.runtimeId, 'new-runtime');
  assert.equal(Object.hasOwn(result, 'verified'), false);
  assert.equal(job.runtimeId, 'old-runtime');
  assert.equal(job.status, 'outcome-unknown');
});

test('a correlated stopped request proves remote termination without proving the action succeeded', async () => {
  const result = await verify(gatewayFor([user(), { role: 'assistant', content: 'Everything succeeded.', timestamp: 21 }]));
  assert.equal(result.correlated, true);
  assert.equal(result.remoteRunning, false);
  assert.equal(Object.hasOwn(result, 'verified'), false);
  assert.equal(Object.hasOwn(result, 'summary'), false);
});
test('long tool runs expand history once to find the latest original user marker',async()=>{
 const routes=[],gateway=gatewayFor([]);gateway.json=async route=>{routes.push(route);return {session_id:job.sessionId,messages:route.includes('limit=128')?[user(),...Array.from({length:20},()=>({role:'tool'}))]:Array.from({length:8},()=>({role:'tool'}))};};
 const result=await verify(gateway);assert.equal(result.correlated,true);assert.equal(result.remoteRunning,false);assert.equal(routes.length,2);assert.match(routes[1],/limit=128/);
});
test('expanded tool history still rejects a newer unrelated user request',async()=>{
 const gateway=gatewayFor([]);gateway.json=async route=>({messages:route.includes('limit=128')?[user(),user('Other newer request',30),{role:'tool'}]:[{role:'tool'}]});assert.equal((await verify(gateway)).correlated,false);
});

test('non-user payloads do not block correlation and are never parsed for attribution', async () => {
  const opaqueTool = { role: 'tool', timestamp: 22 };
  Object.defineProperty(opaqueTool, 'content', { get: () => { throw new Error('Non-user content must not be read'); } });
  const messages = [
    user(), { role: 'assistant', content: null, tool_calls: [{ id: 'tool-1', function: { name: 'inspect', arguments: '{}' } }], timestamp: 21 },
    opaqueTool, { role: 'tool', content: { result: [{ text: marker }] }, timestamp: 23 },
    { role: 'assistant', content: [{ type: 'text', text: marker }], timestamp: 24 },
  ];
  assert.equal((await verify(gatewayFor(messages))).correlated, true);
  assert.equal((await verify(gatewayFor(messages.slice(1)))).correlated, false);
});

test('only the exact marker at the start of the latest user request establishes correlation', async () => {
  for (const messages of [
    [user('Plain request'), { role: 'assistant', content: marker, timestamp: 21 }],
    [{ role: 'system', content: marker, timestamp: 20 }],
    [user('Quoted ' + marker)],
    [user(' ' + marker)],
    [user(marker.replace('d31]', 'd32]'))],
    [user(), user('Another newer request', 22)],
    [user(), user('[Lilith-Auftrag: ecb5f4b4-f370-44d1-a767-e07a80883523]\nOther job.', 22)],
  ]) {
    const result = await verify(gatewayFor(messages));
    assert.equal(result.correlated, false);
    assert.equal(result.remoteRunning, false);
    assert.equal(typeof result.reason, 'string');
  }
});

test('latest user is selected by numeric chronology independently of array order', async () => {
  for (const messages of [[user('Older unrelated request', 10), user()], [user(), user('Older unrelated request', 10)]]) {
    assert.equal((await verify(gatewayFor(messages))).correlated, true);
  }
  assert.equal((await verify(gatewayFor([user('Newer unrelated request', 22), user()]))).correlated, false);
});

test('a single user message needs no timestamp or optional session header', async () => {
  const result = await verify(gatewayFor([{ role: 'user', content: marker + '\nRequest' }], { running: false }, { session_id: undefined }));
  assert.equal(result.correlated, true);
  assert.equal(result.remoteRunning, false);
  assert.equal(result.runtimeId, undefined);
});

test('a compression descendant must be identified by the owned resume before its history is accepted', async () => {
  for (const fields of [{ resumed: 'stored-descendant' }, { session_key: 'stored-descendant' }, { resumed: 'stored-descendant', session_key: 'stored-descendant' }]) {
    const result = await verify(gatewayFor([{ ...user(), session_id: 'stored-descendant' }], {
      running: false, session_id: 'new-runtime', ...fields,
    }, { session_id: 'stored-descendant', profile: 'work' }));
    assert.equal(result.correlated, true);
    assert.equal(result.remoteRunning, false);
    assert.equal(result.runtimeId, 'new-runtime');
  }
  for (const fields of [
    { resumed: 'stored-descendant', session_key: 'conflicting-descendant' },
    { resumed: '' }, { session_key: 'bad\nidentity' },
    { resumed: 'stored-descendant', info: { profile_name: 'foreign-profile' } },
  ]) {
    const result = await verify(gatewayFor([user()], { running: false, session_id: 'new-runtime', ...fields }));
    assert.equal(result.correlated, false);
    assert.equal(result.remoteRunning, undefined);
  }
});

test('ambiguous chronology and unsupported message shapes fail closed', async () => {
  for (const messages of [
    [], [user(), user('Another request', 20)],
    [user(), { role: 'user', content: 'Another request' }],
    [user(), user('Another request', '22')],
    [user(), user('Another request', NaN)],
    [{ role: 'user', text: marker }],
    [{ role: 'user', content: [{ type: 'text', text: marker }] }],
    [{ role: 'USER', content: marker }],
    [user(), { role: 'unknown', content: 'Request', timestamp: 22 }],
    [user(marker + 'x'.repeat(65536))],
    Array.from({ length: 9 }, () => user()),
    null, { user: { content: marker } },
  ]) assert.equal((await verify(gatewayFor(messages))).correlated, false);
});

test('foreign session or profile data cannot establish job ownership', async () => {
  for (const extra of [{ session_id: 'foreign-session' }, { session_id: 'new-runtime' }, { profile: 'foreign-profile' }]) {
    assert.equal((await verify(gatewayFor([user()], undefined, extra))).correlated, false);
  }
  assert.equal((await verify(gatewayFor([{ ...user(), session_id: 'foreign-session' }]))).correlated, false);
  assert.equal((await verify(gatewayFor([user()], { running: false, session_id: 'new-runtime', profile: 'foreign-profile' }))).correlated, false);
});

test('missing or truthy running values are never treated as a stopped remote request', async () => {
  for (const resume of [undefined, null, {}, { running: 'false' }, { running: 0 }, { running: null }, [], { result: { running: false } }]) {
    const gateway = gatewayFor([user()]);
    gateway.request = async () => resume;
    let queried = false; gateway.json = async () => { queried = true; return { messages: [user()] }; };
    const result = await verify(gateway);
    assert.equal(result.correlated, false);
    assert.equal(result.remoteRunning, undefined);
    assert.equal(queried, false);
  }
});

test('invalid runtime IDs and nested or array history wrappers fail closed', async () => {
  for (const resume of [{ running: false, session_id: '' }, { running: false, session_id: 'x'.repeat(257) }, { running: false, session_id: 'bad\nidentity' }]) {
    assert.equal((await verify(gatewayFor([user()], resume))).correlated, false);
  }
  for (const history of [[user()], { data: { messages: [user()] } }, null]) {
    const gateway = gatewayFor([user()]); gateway.json = async () => history;
    assert.equal((await verify(gateway)).correlated, false);
  }
});

test('gateway errors return fixed reasons without copying private server error text', async () => {
  for (const method of ['request', 'json']) {
    const gateway = gatewayFor([user()]);
    gateway[method] = async () => { throw new Error('token=DO-NOT-EXPOSE private instructions'); };
    const result = await verify(gateway);
    assert.equal(result.correlated, false);
    assert.ok(!JSON.stringify(result).includes('DO-NOT-EXPOSE'));
  }
});

test('hung RPC returns unknown within its bounded timeout without retrying or submitting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0, historyReads = 0;
  const resultPromise = verify({
    request: () => { requests++; return new Promise(() => {}); },
    json: async () => { historyReads++; return { messages: [user()] }; },
  });
  await Promise.resolve(); t.mock.timers.tick(15000);
  const result = await resultPromise;
  assert.equal(result.correlated, false);
  assert.equal(result.remoteRunning, undefined);
  assert.equal(requests, 1);
  assert.equal(historyReads, 0);
});

test('hung history read returns uncorrelated even after an observed remote stop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gateway = gatewayFor([user()]); gateway.json = () => new Promise(() => {});
  const resultPromise = verify(gateway);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  t.mock.timers.tick(15000);
  const result = await resultPromise;
  assert.equal(result.correlated, false);
  assert.equal(result.remoteRunning, false);
});

test('invalid job ownership is rejected before any remote query', async () => {
  for (const input of [null, { ...job, id: 'arbitrary marker' }, { ...job, sessionId: '' }, { ...job, profile: '../foreign' }]) {
    let called = false;
    const result = await verify({ request: () => { called = true; }, json: () => { called = true; } }, input);
    assert.equal(result.correlated, false);
    assert.equal(called, false);
  }
});
