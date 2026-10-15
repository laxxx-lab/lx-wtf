const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocketServer } = require('ws');
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function peer(t, options = {}) {
  const { GeminiLive } = require('../gemini-live.cjs');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const live = new GeminiLive({ apiKey: 'secret-key', model: 'test-model', voice: 'Aoede', endpoint: `ws://127.0.0.1:${server.address().port}`, ...options });
  t.after(async () => { live.close(); for (const ws of server.clients) ws.terminate(); await new Promise(resolve => server.close(resolve)); });
  const connection = once(server, 'connection');
  const started = live.start();
  const [ws] = await connection;
  const messages = [];
  ws.on('message', data => messages.push(JSON.parse(data)));
  await tick();
  const ready = once(live, 'ready');
  ws.send(JSON.stringify({ setupComplete: {} }));
  await ready;
  await started;
  return { live, ws, messages, server };
}
test('setup, audio, transcripts and interruption use Live protocol', async t => {
  const { live, ws, messages } = await peer(t);
  assert.equal(messages[0].setup.model, 'models/test-model');
  assert.equal(messages[0].setup.generationConfig.responseModalities[0], 'AUDIO');
  assert.equal(live.feed('AAAAAA=='), true);
  await tick();
  assert.deepEqual(messages[1], { realtimeInput: { audio: { data: 'AAAAAA==', mimeType: 'audio/pcm;rate=16000' } } });
  const events = [];
  for (const event of ['audio-start', 'audio-chunk', 'audio-end', 'interrupted', 'input-text', 'output-text']) live.on(event, data => events.push([event, data]));
  ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'hello' }, outputTranscription: { text: 'hi' }, modelTurn: { parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/pcm;rate=24000' } }] } } }));
  ws.send(JSON.stringify({ serverContent: { interrupted: true, turnComplete: true } }));
  await tick();
  assert.deepEqual(events.map(e => e[0]), ['input-text', 'output-text', 'audio-start', 'audio-chunk', 'interrupted', 'audio-end']);
  assert.equal(live.snapshot().ready, true);
  assert.ok(!JSON.stringify(live.snapshot()).includes('secret-key'));
});
test('tool IDs execute once and return structured results asynchronously', async t => {
  let count = 0;
  const { live, ws, messages } = await peer(t, { executeTool: async call => { count++; return { jobId: call.args.id }; } });
  const call = { toolCall: { functionCalls: [{ id: 'one', name: 'submit', args: { id: 'job' } }] } };
  ws.send(JSON.stringify(call)); ws.send(JSON.stringify(call));
  await tick();
  assert.equal(count, 1);
  assert.deepEqual(messages[1].toolResponse.functionResponses, [{ id: 'one', name: 'submit', response: { jobId: 'job' } }]);
  assert.equal(live.snapshot().ready, true);
});
test('close suppresses late tool completion and stale output', async t => {
  let finish;
  const { live, ws, messages } = await peer(t, { executeTool: () => new Promise(resolve => { finish = resolve; }) });
  let ends = 0; let audio = 0;
  live.on('tool-end', () => ends++); live.on('audio-chunk', () => audio++);
  ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'late', name: 'submit', args: {} }] } }));
  await tick(); live.close(); finish({ ok: true });
  await tick();
  assert.equal(ends, 0); assert.equal(audio, 0); assert.equal(messages.length, 1); assert.equal(live.feed('AAAA'), false);
});
test('malformed, odd and oversized PCM are rejected before sending', async t => {
  const { live, messages } = await peer(t);
  for (const bad of ['', '!', 'AA==', 'A'.repeat(200000), null]) assert.equal(live.feed(bad), false);
  await tick(); assert.equal(messages.length, 1);
});
test('provider errors and GoAway fail closed without leaking provider details', async t => {
  const { live, ws } = await peer(t);
  const failed = once(live, 'failure');
  ws.send(JSON.stringify({ error: { message: 'secret-key private detail' } }));
  const [failure] = await failed;
  assert.ok(!JSON.stringify(failure).includes('secret-key'));
  assert.equal(live.snapshot().ready, false);
  const other = await peer(t);
  const away = once(other.live, 'failure');
  other.ws.send(JSON.stringify({ goAway: { timeLeft: '5s' } }));
  assert.match((await away)[0].message, /session/i);
  assert.equal(other.live.snapshot().ready, false);
});
test('remote endpoint override cannot receive credentials', () => {
  const { GeminiLive } = require('../gemini-live.cjs');
  assert.throws(() => new GeminiLive({ apiKey: 'secret-key', endpoint: 'ws://example.com' }), /endpoint/i);
  assert.throws(() => new GeminiLive({ apiKey: 'secret-key', endpoint: 'wss://example.com' }), /endpoint/i);
});

test('cancellation suppresses pending tool response without replaying execution', async t => {
  let finish;
  const { live, ws, messages } = await peer(t, { executeTool: () => new Promise(resolve => { finish = resolve; }) });
  const call = { toolCall: { functionCalls: [{ id: 'cancel', name: 'submit', args: {} }] } };
  ws.send(JSON.stringify(call)); await tick();
  ws.send(JSON.stringify({ toolCallCancellation: { ids: ['cancel'] } })); await tick();
  finish({ ok: true }); ws.send(JSON.stringify(call)); await tick();
  assert.equal(messages.length, 1); assert.equal(live.snapshot().ready, true);
});
test('invalid provider audio fails closed and socket loss is visible', async t => {
  const { live, ws } = await peer(t);
  const invalid = once(live, 'failure');
  ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { data: '!', mimeType: 'audio/pcm;rate=24000' } }] } } }));
  assert.match((await invalid)[0].message, /audio/);
  const other = await peer(t);
  const closed = once(other.live, 'failure'); other.ws.terminate();
  assert.match((await closed)[0].message, /closed/);
});
test('tool errors never expose exception text and remain uncertain', async t => {
  const { ws, messages } = await peer(t, { executeTool: async () => { throw new Error('secret-key'); } });
  ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'error', name: 'submit', args: {} }] } })); await tick();
  assert.ok(!JSON.stringify(messages[1]).includes('secret-key'));
  assert.match(messages[1].toolResponse.functionResponses[0].response.error, /status before retrying/);
});
test('GoAway resumes using latest handle without audio or tool replay', { timeout: 2000 }, async t => {
  let executions = 0;
  const { live, ws, server } = await peer(t, { executeTool: async () => { executions++; return { ok: true }; } });
  const call = { toolCall: { functionCalls: [{ id: 'unique', name: 'submit', args: {} }] } };
  ws.send(JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: 'old' } }));
  ws.send(JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: 'latest' } }));
  ws.send(JSON.stringify(call)); await tick();
  const connection = once(server, 'connection');
  ws.send(JSON.stringify({ goAway: { timeLeft: '5s' } }));
  const [next] = await connection;
  const messages = []; next.on('message', data => messages.push(JSON.parse(data)));
  await tick(); assert.equal(live.feed('AAAAAA=='), false);
  assert.equal(messages[0].setup.sessionResumption.handle, 'latest');
  const ready = once(live, 'ready'); next.send(JSON.stringify({ setupComplete: {} })); await ready;
  next.send(JSON.stringify(call)); await tick();
  assert.equal(executions, 1); assert.equal(messages.length, 1);
  assert.equal(live.snapshot().ready, true);
  assert.ok(!JSON.stringify(live.snapshot()).includes('latest'));
});

test('resumption drops late tool results from the retired socket', { timeout: 2000 }, async t => {
  let finish; let executions = 0;
  const { live, ws, server } = await peer(t, { executeTool: () => { executions++; return new Promise(resolve => { finish = resolve; }); } });
  const call = { toolCall: { functionCalls: [{ id: 'pending', name: 'submit', args: {} }] } };
  ws.send(JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: 'handle' } }));
  ws.send(JSON.stringify(call)); await tick();
  const connection = once(server, 'connection'); ws.send(JSON.stringify({ goAway: { timeLeft: '1s' } }));
  const [next] = await connection; const messages = []; next.on('message', data => messages.push(JSON.parse(data)));
  await tick(); const ready = once(live, 'ready'); next.send(JSON.stringify({ setupComplete: {} })); await ready;
  let ends = 0; live.on('tool-end', () => ends++);
  finish({ ok: true }); next.send(JSON.stringify(call)); await tick();
  assert.equal(executions, 1); assert.equal(ends, 0); assert.equal(messages.length, 1);
});
test('pending Hermes result leaves voice ready and returns eventual authoritative data', async t => {
  let finish;
  const { live, ws, messages } = await peer(t, { executeTool: () => new Promise(resolve => { finish = resolve; }) });
  ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'wait', name: 'submit', args: {} }] } })); await tick();
  assert.equal(live.snapshot().ready, true); assert.equal(live.feed('AAAAAA=='), true); await tick();
  assert.ok(messages[1].realtimeInput.audio);
  finish({ jobId: 'job', state: 'succeeded', result: 'confirmed' }); await tick();
  assert.deepEqual(messages[2].toolResponse.functionResponses[0].response, { jobId: 'job', state: 'succeeded', result: 'confirmed' });
});
test('unknown cancellation floods do not grow history or block later tools', async t => {
  const executed = [];
  const { live, ws, messages } = await peer(t, { executeTool: async call => { executed.push(call.id); return { ok: true }; } });
  ws.send(JSON.stringify({ toolCallCancellation: { ids: Array.from({ length: 5000 }, (_, index) => `unknown-${index}`) } }));
  ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'unknown-0', name: 'submit', args: {} }, { id: 'fresh', name: 'submit', args: {} }] } }));
  await tick();
  assert.deepEqual(executed, ['unknown-0', 'fresh']);
  assert.equal(live.snapshot().ready, true);
  assert.equal(messages.filter(message => message.toolResponse).length, 2);
});
test('oversized tool IDs and names cannot enter dedup history or execution', async t => {
  const executed = [];
  const { live, ws } = await peer(t, { executeTool: async call => { executed.push(`${call.name}:${call.id}`); return { ok: true }; } });
  ws.send(JSON.stringify({ toolCall: { functionCalls: [
    { id: 'x'.repeat(257), name: 'submit', args: {} },
    { id: 'reusable', name: 'x'.repeat(129), args: {} },
    { id: 'reusable', name: 'submit', args: {} }
  ] } }));
  await tick();
  assert.deepEqual(executed, ['submit:reusable']);
  assert.equal(live.snapshot().ready, true);
});
