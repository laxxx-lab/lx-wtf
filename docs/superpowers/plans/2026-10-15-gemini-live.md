# Gemini Live implementation plan

> **For agentic workers:** Use subagent-driven-development for transport and main-process integration, then review the combined change.

**Goal:** Optional streaming speech on Windows with the existing Hermes session and a read-only EchoLocal connection audit.

**Architecture:** Main process owns credentials, WebSocket and validated tool calls. Renderer forwards selected-microphone PCM only after explicit Live start and consumes the existing playback events. Local mode remains the default.

**Tech Stack:** Existing Electron, Node.js, ws, node:test; no additional runtime dependency.

**Spec:** docs/superpowers/specs/2026-10-15-gemini-live-design.md

## Global constraints

Preserve local settings/session/data; no automatic cloud activation; no keys in Git
or renderer snapshots; no app restart during an active job; no Dot flash/reset.

### Task 1: Live transport

Files: gemini-live.cjs, tests/gemini-live.test.cjs.
Public interface: GeminiLive extends EventEmitter; constructor takes
{apiKey, model, voice, instruction, tools, executeTool, endpoint}; start(),
feed(base64Pcm), close(), snapshot(). Events: ready, audio-start, audio-chunk
({data}), audio-end, interrupted, input-text ({text}), output-text ({text}),
tool-start, tool-end, failure ({message}), closed. Tool callbacks return structured
result data; no provider text is interpreted as execution evidence.

- [ ] Write tests with a local ws server: setup/audio handshake, interruption,
  duplicate call ID, failure/close/stale result, malformed audio bounds.
- [ ] Observe failure, implement the transport using existing ws.
- [ ] Run tests and inspect for key leakage/replayed actions.

### Task 2: Main-process integration and credential storage

Files: main.cjs, preload.cjs, gemini-live-desktop.cjs,
tests/gemini-live-desktop.test.cjs, docs/gemini-live.md.
Consumes Task 1 interface. Produces IPC gemini-live-start/feed/stop/configure/status,
public settings fields speechProvider, geminiCloudAllowed, geminiVoice, and a
non-secret credential-present flag. Close on all safety/session transitions.

- [ ] Test key redaction, cloud consent, session ownership, duplicate submission,
  user stop and late provider output before implementation.
- [ ] Bind submit/status/stop through existing job/session entry points; provider
  result text must not also enter the existing local TTS queue.
- [ ] Verify dedicated tests and shared lifecycle tests.

### Task 3: Renderer, USB discovery and end-to-end verification

Files: ui/app.js, ui/index.html, tests/gemini-live-renderer.test.cjs,
docs/hermes-voice-control/SKILL.md.
Consumes IPC above and emits selected microphone PCM16k only in cloud Live mode.

- [ ] Test capture routing, interruption, stop and no-key behavior.
- [ ] Add settings, configure/status flow and connect Live button to provider.
- [ ] Inspect USB/ADB read-only; keep hardware identifiers in ignored local audit.
- [ ] Run focused tests, npm.cmd test, git diff --check and public privacy test.
- [ ] Validate a separate Electron smoke instance; Google/Dot checks only when
  actual credentials/device are available. Record any remaining external blocker.
