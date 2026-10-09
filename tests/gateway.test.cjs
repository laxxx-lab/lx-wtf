const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { Gateway, validateGatewayUrl } = require('../gateway.cjs');

test('gateway URLs reject embedded credentials and executable schemes', () => {
  assert.throws(() => validateGatewayUrl('file:///C:/Windows'));
  assert.throws(() => validateGatewayUrl('http://user:pass@example.com'));
  assert.equal(validateGatewayUrl('http://lilith.lx.local/'), 'http://lilith.lx.local');
});

test('RPC keeps request identity, session scope and streamed event text', async t => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  const packets = [];
  server.on('connection', socket => socket.on('message', raw => {
    const packet = JSON.parse(raw); packets.push(packet);
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, result: { session_id: 'live-42' } }));
    socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: {
      type: 'message.delta', session_id: 'live-42', payload: { text: 'Hallo.' }
    } }));
  }));
  const events = [];
  const gateway = new Gateway({ url: `http://127.0.0.1:${server.address().port}`, onEvent: e => events.push(e) });
  t.after(() => { gateway.close(); server.close(); });
  await gateway.connect({ ticket: 'fixture' });
  const result = await gateway.request('session.resume', { session_id: 'telegram-stored', profile: 'default' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(result.session_id, 'live-42');
  assert.equal(packets[0].params.session_id, 'telegram-stored');
  assert.equal(packets[0].params.profile, 'default');
  assert.equal(events[0].data.text, 'Hallo.');
});

test('closed connection rejects outstanding requests rather than reporting success', async t => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  server.on('connection', socket => socket.on('message', () => socket.close()));
  const gateway = new Gateway({ url: `http://127.0.0.1:${server.address().port}` });
  t.after(() => { gateway.close(); server.close(); });
  await gateway.connect({ ticket: 'fixture' });
  await assert.rejects(gateway.request('prompt.submit', { session_id: 'x', text: 'Hallo' }), /Verbindung/);
});

test('replacing a socket does not mark its new connection disconnected',async t=>{
  const server=new WebSocketServer({port:0});await new Promise(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>socket.on('message',raw=>{const frame=JSON.parse(raw);socket.send(JSON.stringify({jsonrpc:'2.0',id:frame.id,result:{ok:true}}));}));
  const gateway=new Gateway({url:`http://127.0.0.1:${server.address().port}`});
  t.after(()=>{gateway.close();server.close();});let disconnected=0;gateway.on('disconnected',()=>disconnected++);
  await gateway.connect({ticket:'first'});await gateway.connect({ticket:'second'});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(disconnected,0);
  assert.deepEqual(await gateway.request('session.list'),{ok:true});
});
