(function(root) {
  'use strict';
  class CameraController {
    constructor({ video, canvas, getUserMedia = constraints => navigator.mediaDevices.getUserMedia(constraints), enumerateDevices = () => navigator.mediaDevices.enumerateDevices(), onFrame, onState = () => {} }) {
      this.video = video;
      this.canvas = canvas;
      this.getUserMedia = getUserMedia;
      this.enumerateDevices = enumerateDevices;
      this.onFrame = onFrame;
      this.onState = onState;
      this.stream = null;
      this.generation = 0;
      this.timer = null;
      this.inFlight = false;
    }

    get active() { return Boolean(this.stream); }

    async devices() {
      try {
        return (await this.enumerateDevices()).filter(device => device.kind === 'videoinput');
      } catch (error) {
        this.onState({ active: this.active, error: error.message || String(error) });
        return [];
      }
    }

    async enable(deviceId = '') {
      this.disable();
      const generation = this.generation;
      try {
        const stream = await this.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true });
        if (generation !== this.generation) {
          stream.getTracks().forEach(track => track.stop());
          return false;
        }
        this.stream = stream;
        this.video.srcObject = stream;
        await this.video.play();
        if (generation !== this.generation) return false;
        this.onState({ active: true });
        if (this.onFrame) {
          this.timer = setInterval(() => this.processFrame(generation), 2000);
          this.processFrame(generation);
        }
        return true;
      } catch (error) {
        if (generation !== this.generation) return false;
        this.disable();
        this.onState({ active: false, error: error.message || String(error) });
        return false;
      }
    }

    disable() {
      this.generation++;
      clearInterval(this.timer);
      this.timer = null;
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.video.srcObject = null;
      this.onState({ active: false });
    }

    capture() {
      if (!this.active) throw new Error('Camera is not active');
      const width = this.video.videoWidth, height = this.video.videoHeight;
      if (this.video.readyState < 2 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Camera frame is not ready');
      const scale = Math.min(1, 960 / width, 720 / height);
      this.canvas.width = Math.max(1, Math.floor(width * scale));
      this.canvas.height = Math.max(1, Math.floor(height * scale));
      this.canvas.getContext('2d').drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      return this.canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '');
    }

    async processFrame(generation) {
      if (!this.active || generation !== this.generation || this.inFlight) return;
      this.inFlight = true;
      try {
        const result = await this.onFrame(this.capture(), generation);
        if (this.active && generation === this.generation) this.onState({ active: true, result });
      } catch (error) {
        if (this.active && generation === this.generation) this.onState({ active: true, error: error.message || String(error) });
      } finally {
        this.inFlight = false;
      }
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = { CameraController };
  else root.CameraController = CameraController;
})(typeof window === 'object' ? window : globalThis);
