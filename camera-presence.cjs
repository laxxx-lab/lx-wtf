'use strict';

// Recognition is a convenience signal, never an authentication decision.
class CameraPresence {
  constructor({ confirmHits = 3, absenceMs = 300000, cooldownMs = 0 } = {}) {
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
        profile.missingSince ??= now;
      }
      // A missing observation starts absence; a camera outage alone does not.
      // Check returning faces before lastSeen or missingSince gets overwritten.
      if (profile.missingSince != null && now - profile.missingSince >= this.absenceMs) this.profiles.delete(name);
    }
    const arrivals = [];
    for (const name of names) {
      const profile = this.profiles.get(name) || { hits: 0, present: false };
      profile.lastSeen = now;
      profile.missingSince = null;
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

  reset() {
    for (const [name, profile] of this.profiles) {
      if (!profile.present) this.profiles.delete(name);
      else { profile.hits = 0; profile.missingSince = null; }
    }
  }
}

module.exports = { CameraPresence };
