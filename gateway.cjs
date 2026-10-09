'use strict';
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

function validateGatewayUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Bitte eine HTTP(S)-Gateway-Adresse ohne Zugangsdaten angeben.');
  }
  return url.href.replace(/\/$/, '');
}

class Gateway extends EventEmitter {
  constructor({ url, onEvent = () => {}, fetcher = fetch }) {
    super(); this.url = validateGatewayUrl(url); this.fetcher = fetcher;
    this.onEvent = onEvent; this.pending = new Map(); this.sequence = 0; this.socket = null;this.heartbeat=null;
  }
  async json(path, options = {}) {
    const response = await this.fetcher(this.url + path, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(response.status === 401
      ? 'Bitte am Hermes-Gateway anmelden.' : `Hermes antwortet mit HTTP ${response.status}.`);
    return response.json();
  }
  async connect({ ticket, token } = {}) {
    this.close();
    if (!ticket && !token) ticket = (await this.json('/api/auth/ws-ticket', { method: 'POST' })).ticket;
    if (!ticket && !token) throw new Error('Hermes hat kein Verbindungsticket geliefert.');
    const url = new URL(this.url + '/api/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (token) url.searchParams.set('token', token);
    const socket = new WebSocket(url, ticket ? ['hermes-gateway-v1', 'hermes-gateway-ticket.' + ticket] : undefined);
    this.socket = socket;
    socket.on('message', raw => {
      let frame; try { frame = JSON.parse(raw.toString()); } catch { return; }
      if (frame.id != null && !frame.method) {
        const entry = this.pending.get(String(frame.id));
        if (!entry) return;
        this.pending.delete(String(frame.id)); clearTimeout(entry.timer);
        if (frame.error) entry.reject(new Error(frame.error.message || 'Hermes-Anfrage fehlgeschlagen.'));
        else entry.resolve(frame.result);
      } else if (frame.method === 'event') {
        const event = { ...frame.params, data: frame.params?.payload || frame.params?.data || {} };
        this.onEvent(event); this.emit('event', event);
      } else if (frame.method && frame.id != null) {
        this.emit('server-request', frame);
      }
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      clearInterval(this.heartbeat);this.heartbeat=null;
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timer); entry.reject(new Error('Hermes-Verbindung geschlossen.')); this.pending.delete(id);
      }
      this.emit('disconnected');
    });
    socket.on('error', () => {});
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.terminate(); reject(new Error('Hermes-Verbindung hat zu lange gedauert.')); }, 15000);
      socket.once('open', () => { clearTimeout(timer); resolve(); });
      socket.once('error', () => { clearTimeout(timer); reject(new Error('Hermes-WebSocket konnte nicht geöffnet werden.')); });
    });
    let pingPending=false;
    this.heartbeat=setInterval(async()=>{
      if(pingPending||this.socket!==socket)return;pingPending=true;
      try{await this.request('gateway.ping',{},15000);}catch{if(this.socket===socket)socket.terminate();}finally{pingPending=false;}
    },15000);
  }
  request(method, params = {},timeoutMs=90000) {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Keine Hermes-Verbindung.'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Hermes-Anfrage ${method} hat zu lange gedauert.`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({jsonrpc:'2.0',id,method,params}), error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(new Error('Hermes-Verbindung unterbrochen.')); }
      });
    });
  }
  respond(id, result) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Keine Hermes-Verbindung.');
    this.socket.send(JSON.stringify({jsonrpc:'2.0',id,result}));
  }
  close() {
    clearInterval(this.heartbeat);this.heartbeat=null;
    for(const [id,entry] of this.pending){clearTimeout(entry.timer);entry.reject(new Error('Hermes-Verbindung geschlossen.'));this.pending.delete(id);}
    if (this.socket) { const socket = this.socket; this.socket = null; socket.close(); }
  }
}
module.exports = { Gateway, validateGatewayUrl };
