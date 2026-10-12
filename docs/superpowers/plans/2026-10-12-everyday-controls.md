# Everyday Controls Implementation Plan

> Use focused agent work for independent power/reminder/window/Orb modules; parent integrates the shared API and renderer.

**Goal:** Give the existing Hermes direct typed access to microphone, volume, apps/windows, cancellable delayed power and one-shot reminders, with genuine speech-reactive Orb motion.
**Architecture:** Reuse existing local direct-command helpers and microphone reconnection; keep authenticated loopback API and existing session. New isolated timer/window modules have strict schemas, no free shell or file endpoint. Power uses app-owned delay then native /t 0 without force; no shutdown occurs in validation.
**Tech:** Electron, Canvas/Web Audio, Node standard library, Windows native APIs/PowerShell; no new provider or dependency.

- [x] Microphone list/switch renderer acknowledgement, fresh native choice, preserve Live/Wake/standby, failed-switch rollback; focused regression then native switch/readback/restoration.
- [x] Expose existing volume and app catalogue/open through exact typed endpoints, add fresh window identity/focus helper, epoch/privacy/resource guards; request validation tests then controlled native readbacks.
- [x] Add local persistent reminders and app-owned power timing; no blind replay after restart, cancel only own pending schedule, privacy defers reminders/cancels power. Test due transitions with clocks; native schedule/cancel without firing.
- [x] Speech dynamics use actual output RMS at 1024 samples, rapid attack/release and bounded expansion; test silence/peaks/reduced motion and a cached local voice clip in isolated renderer.
- [x] Document control.ps1, API, maintenance and Hermes skill; full tests, native activation only idle, backup/guard/readback server skill, preserve preferences; publication audit and authorized Git save.
