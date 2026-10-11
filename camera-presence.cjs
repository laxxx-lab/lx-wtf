'use strict';

// Recognition is a convenience signal, never an authentication decision.
class CameraPresence {
  constructor({ confirmHits = 3, absenceMs = 20000, cooldownMs = 120000 } = {}) {
    this.confirmHits = confirmHits;
    this.absenceMs = absenceMs;
    this.cooldownMs = cooldownMs;
    this.profiles = new Map();
    this.lastGreeting = new Map();
  }

  observe(faces, now = Date.now()) {
    const names = new Set((Array.isArray(faces) ? faces : [])
      .filter(face => face && face.known !== false && typeof face.name === 'string' && face.name.trim())
      .map(face => face.name.trim()));
    for (const [name, profile] of this.profiles) {
      if (!names.has(name)) {
        profile.hits = 0;
        if (now - profile.lastSeen >= this.absenceMs) this.profiles.delete(name);
      }
    }
    const arrivals = [];
    for (const name of names) {
      const profile = this.profiles.get(name) || { hits: 0, present: false };
      profile.lastSeen = now;
      profile.hits++;
      this.profiles.set(name, profile);
      if (!profile.present && profile.hits >= this.confirmHits) {
        profile.present = true;
        const previous = this.lastGreeting.get(name);
        if (previous === undefined || now - previous >= this.cooldownMs) {
          this.lastGreeting.set(name, now);
          arrivals.push(name);
        }
      }
    }
    return arrivals;
  }

  reset() { this.profiles.clear(); }
}

module.exports = { CameraPresence };
