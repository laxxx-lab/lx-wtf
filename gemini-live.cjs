const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MAX_PCM_BYTES = 64000;
function validPcm(data) {
  if (typeof data !== 'string' || !data.length || data.length > Math.ceil(MAX_PCM_BYTES / 3) * 4 || data.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) return false;
  const bytes = Buffer.from(data, 'base64');
  return bytes.length > 0 && bytes.length <= MAX_PCM_BYTES && bytes.length % 2 === 0 && bytes.toString('base64') === data;
}
class GeminiLive extends EventEmitter {
  #key; #socket = null; #state = 'idle'; #audio = false; #calls = new Map(); #timer; #settle; #resumeHandle = null;
  constructor({ apiKey, model, voice = 'Aoede', instruction = '', tools = [], executeTool, endpoint = ENDPOINT } = {}) {
    super();
    const url = new URL(endpoint);
    const local = ['127.0.0.1', '[::1]'].includes(url.hostname) && ['ws:', 'wss:'].includes(url.protocol);
    if (endpoint !== ENDPOINT && !local || url.username || url.password) throw new Error('Unsupported Gemini endpoint');
    this.endpoint = endpoint; this.#key = apiKey; this.model = model; this.voice = voice;
    this.instruction = instruction; this.tools = tools; this.executeTool = executeTool;
  }
  snapshot() { return { state: this.#state, ready: this.#state === 'ready' }; }
  start() {
    if (this.#state !== 'idle') return Promise.resolve(this.snapshot());
    if (typeof this.#key !== 'string' || !this.#key.trim() || typeof this.model !== 'string' || !this.model.trim()) {
      this.#fail('Gemini credentials or model missing'); return Promise.resolve(this.snapshot());
    }
    this.#state = 'connecting';
    return new Promise(resolve => {
      this.#settle = resolve;
      const url = new URL(this.endpoint);
      if (this.endpoint === ENDPOINT) url.searchParams.set('key', this.#key);
      let socket;
      try { socket = new WebSocket(url, { maxPayload: 1024 * 1024, followRedirects: false, handshakeTimeout: 10000 }); }
      catch { this.#fail('Gemini connection failed'); return; }
      this.#socket = socket;
      this.#timer = setTimeout(() => this.#fail('Gemini setup timed out'), 15000);
      this.#timer.unref?.();
      socket.on('open', () => {
        if (socket !== this.#socket) return;
        this.#send({ setup: { model: this.model.startsWith('models/') ? this.model : `models/${this.model}`, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } } }, systemInstruction: { parts: [{ text: this.instruction }] }, tools: this.tools, sessionResumption: this.#resumeHandle ? { handle: this.#resumeHandle } : {}, contextWindowCompression: { slidingWindow: {} }, inputAudioTranscription: {}, outputAudioTranscription: {} } });
      });
      socket.on('message', data => { if (socket !== this.#socket) return; try { this.#message(JSON.parse(data.toString())); } catch { this.#fail('Invalid Gemini response'); } });
      socket.on('error', () => { if (socket === this.#socket) this.#fail('Gemini connection failed'); });
      socket.on('close', () => { if (socket === this.#socket) this.#fail('Gemini connection closed'); });
    });
  }
  #send(message) {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 1024 * 1024) { this.#fail('Gemini connection overloaded'); return false; }
    try { socket.send(JSON.stringify(message), error => { if (error && socket === this.#socket) this.#fail('Gemini send failed'); }); return true; }
    catch { this.#fail('Gemini send failed'); return false; }
  }
  feed(data) { return this.#state === 'ready' && validPcm(data) ? this.#send({ realtimeInput: { audio: { data, mimeType: 'audio/pcm;rate=16000' } } }) : false; }
  #message(message) {
    if (!message || typeof message !== 'object') return this.#fail('Invalid Gemini response');
    if (message.error) return this.#fail('Gemini provider rejected the session');
    const update = message.sessionResumptionUpdate;
    if (update) this.#resumeHandle = update.resumable && typeof update.newHandle === 'string' && update.newHandle.length <= 16384 ? update.newHandle : null;
    if (message.goAway) {
      if (!this.#resumeHandle) return this.#fail('Gemini session ending; restart Live explicitly');
      // Resume provider context only. Never replay audio or an uncertain tool action.
      const oldSocket = this.#socket; this.#socket = null;
      this.#state = 'idle'; this.emit('interrupted'); this.#endAudio();
      oldSocket?.close(); this.start(); return;
    }
    if (message.setupComplete && this.#state === 'connecting') {
      clearTimeout(this.#timer); this.#state = 'ready'; this.#settle?.(this.snapshot()); this.#settle = null; this.emit('ready');
    }
    if (this.#state !== 'ready') return;
    for (const id of message.toolCallCancellation?.ids || []) {
      if (this.#calls.get(id) === 'pending') this.#calls.set(id, 'cancelled');
    }
    const content = message.serverContent;
    if (content) {
      if (typeof content.inputTranscription?.text === 'string') this.emit('input-text', { text: content.inputTranscription.text });
      if (typeof content.outputTranscription?.text === 'string') this.emit('output-text', { text: content.outputTranscription.text });
      if (content.interrupted) { this.emit('interrupted'); this.#endAudio(); }
      else for (const part of content.modelTurn?.parts || []) {
        const audio = part.inlineData;
        if (audio && /^audio\/pcm;rate=24000$/.test(audio.mimeType)) {
          if (!validPcm(audio.data)) return this.#fail('Invalid Gemini audio');
          if (!this.#audio) { this.#audio = true; this.emit('audio-start'); }
          this.emit('audio-chunk', { data: audio.data });
        }
      }
      if (content.turnComplete || content.generationComplete) this.#endAudio();
    }
    for (const call of message.toolCall?.functionCalls || []) this.#tool(call);
  }
  async #tool(call) {
    if (!call || typeof call.id !== 'string' || !call.id || call.id.length > 256 || typeof call.name !== 'string' || !call.name || call.name.length > 128 || this.#calls.has(call.id)) return;
    if (this.#calls.size >= 4096) return this.#fail('Gemini tool limit reached; restart Live explicitly');
    const socket = this.#socket;
    this.#calls.set(call.id, 'pending'); this.emit('tool-start', { id: call.id, name: call.name });
    let response;
    try {
      if (typeof this.executeTool !== 'function') throw new Error();
      response = await this.executeTool({ id: call.id, name: call.name, args: call.args || {} });
      if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error();
      response = JSON.parse(JSON.stringify(response));
    } catch { response = { error: 'Tool execution failed; inspect authoritative job status before retrying' }; }
    if (socket !== this.#socket || this.#state !== 'ready' || this.#calls.get(call.id) !== 'pending') return;
    this.#calls.set(call.id, 'done');
    this.#send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response }] } });
    this.emit('tool-end', { id: call.id, name: call.name, result: response });
  }
  #endAudio() { if (this.#audio) { this.#audio = false; this.emit('audio-end'); } }
  #fail(message) { if (this.#state === 'closed') return; this.close(); this.emit('failure', { message }); }
  close() {
    if (this.#state === 'closed') return;
    this.#state = 'closed'; clearTimeout(this.#timer);
    const socket = this.#socket; this.#socket = null;
    this.#endAudio(); this.#settle?.(this.snapshot()); this.#settle = null;
    if (socket) { if (socket.readyState === WebSocket.CONNECTING) socket.terminate(); else socket.close(); }
    this.emit('closed');
  }
}
module.exports = { GeminiLive };
