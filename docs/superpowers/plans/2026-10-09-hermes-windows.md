# Hermes Windows Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent engine, protocol and monitoring tasks. Main integrates and reviews each deliverable. Steps use checkboxes for tracking.

**Goal:** A free local Windows voice companion with an audio-reactive orb, real Hermes session access and proactive system monitoring.

**Architecture:** Reuse Hermes Desktop configuration and its existing VPS agent, Windows-MCP and sessions. The desktop plugin's curated OS API cannot create transparent external windows or launch local speech processes, so use the approved alternative: a small Electron companion with a transparent orb and tray. Local Vulkan speech engines provide STT/TTS; authenticated gateway calls perform agent work.

**Tech Stack:** Existing Electron runtime, Node.js standard library/WebSocket, vanilla Canvas/Web Audio, Python standard-library adapters, Qwen3-TTS GGUF Vulkan and whisper.cpp Vulkan.

**Spec:** `docs/hermes-windows-entwurf.md`

## Global Constraints

- No new paid speech services, cloud voice keys, trial limits or subscriptions.
- Preserve the VPS agent, tools, memory and explicitly selected session.
- Reuse the existing private Windows-MCP connection.
- Do not delete files or run example cleanup operations during testing.
- Proactive monitoring is included, reacts to changes and suppresses unchanged alerts.
- Do not modify Hermes' bundled Python environment or signed installed application.
- Isolate engines and models inside ignored `runtime/`; native GPU path before CPU fallback.
- No secrets in repository, renderer, logs, command arguments or reports.
- A successful build does not establish voice quality; deliver actual German WAV auditions and measured synthesis time.
- The empty project is already a separate workspace; work on `codex/hermes-windows` in place. No worktree is needed to protect existing code.

## Task 1: Local high-quality voice

**Owner/files:** voice worker; `scripts/voice_synthesize.py`, `voices/`, `docs/voice-runtime.md`, ignored `runtime/voice/`.

**Interface:** CLI `--text-file PATH --output WAV --voice sovereign|dark|playful`; evaluate upstream resident `/v1/audio/speech` as an optional warm path.

- [ ] Build qwentts.cpp with Vulkan using existing compiler/SDK; download the author's Q8 VoiceDesign weights and codec.
- [ ] Test adapter rejection of unknown voices and invalid files before implementation.
- [ ] Generate three German female auditions and record wall time, duration and backend.
- [ ] Verify WAV decoding and audition audio; do not silently select an unrelated fallback voice.

## Task 2: Real Hermes contracts and session bridge

**Files:** `gateway.cjs`, `tests/gateway.test.cjs`, protocol report `docs/hermes-contracts.md`.

**Interfaces:** `readConnection() -> {url, credential}`, `listSessions()`, `submitTurn(sessionId,text,onEvent)`, `cancelTurn(sessionId)`, explicit approval replies if the real gateway exposes them.

- [ ] Investigate actual gateway authentication and streaming protocols without submitting work.
- [ ] Write tests with a loopback HTTP/WebSocket fixture for correct authentication, selected session and fragmented streaming; ensure they fail before implementation.
- [ ] Implement only verified contracts. Keep credentials in the main process; validate supplied session IDs against the real session list.
- [ ] List available sessions, identify the Telegram session and check whether the server supports shared continuation. If auth is expired, show a real reconnect state and allow secure manual sign-in/configuration.

## Task 3: Proactive monitoring

**Owner/files:** monitor worker; `monitor-policy.cjs`, `tests/monitor-policy.test.cjs`. Main: `system-monitor.cjs`.

**Interface:** `createMonitorPolicy(options).observe(sample,nowMs) -> alerts`; sample includes `cpuPercent,memoryPercent,diskFreeGiB,diskTotalGiB,gatewayOnline?,mcpOnline?`.

- [ ] Write red tests for three-sample persistence, no repeated unchanged alerts, hysteresis/recovery, unknown values and cooldown.
- [ ] Implement the pure policy with no dependencies and run `node --test tests/monitor-policy.test.cjs`.
- [ ] Sample native CPU/RAM and C: free space, use bounded hidden subprocesses only for unavailable native telemetry.
- [ ] Feed only significant alerts to notifications and the selected Hermes conversation when idle; queue during user speech/agent work. Monitoring itself invokes no LLM on normal samples.

## Task 4: Windows companion and orb

**Files:** `package.json`, `main.cjs`, `preload.cjs`, `ui/index.html`, `ui/app.js`, `ui/style.css`, `launch.ps1`, `README.md`.

**Interfaces:** Whitelisted IPC commands for status, session list/selection, microphone WAV submission, text turns, cancel, configuration and monitor toggles. Main owns all credentials and process execution. Renderer receives state and audio data only.

- [ ] Add real behavior tests for session pinning, concurrent request serialization and cancellation/alert queuing before implementing their shared logic.
- [ ] Use transparent frameless always-on-top Electron window and tray. Default bottom-right orb; expand on click to controls/transcript/settings.
- [ ] Draw a deterministic particle sphere/neural web with Canvas; audio levels drive speaking/listening motion. Respect reduced motion.
- [ ] Implement hotkey activation, microphone capture, VAD boundaries, immediate audio interruption and explicit microphone off.
- [ ] Show real disconnected/loading/listening/thinking/speaking/working/approval states. No fake metrics or simulated success.
- [ ] Keep the app launchable from the workspace and create a user shortcut; expose autostart as an opt-in setting.

## Task 5: Local speech recognition and integration

**Files:** `scripts/transcribe.py`, ignored `runtime/stt/`; adapter tests.

**Interface:** `transcribe.py --input WAV` returns one JSON result `{text,language}` to stdout; diagnostics to stderr.

- [ ] Build/run whisper.cpp with Vulkan and download multilingual turbo weights. Prefer a persistent upstream server to repeated model loads.
- [ ] Test input validation and transcript parsing before writing the adapter.
- [ ] Connect renderer 16 kHz mono WAV -> local STT -> selected Hermes session -> local TTS -> renderer audio playback.
- [ ] Verify with a synthesized German test utterance, then a non-destructive conversational/status request only when authenticated.

## Task 6: Validation and delivery

- [ ] Run `node --test tests/*.test.cjs` and Python adapter tests.
- [ ] Run actual app and inspect screenshot/rendering; exercise tray, expanded controls, session selection and connection errors.
- [ ] Review diff and handle material findings; ensure no bundled app/env modifications and no secrets in tracked files.
- [ ] Document exact launch command, voice/audio paths, verified capabilities and remaining environment blockers.
- [ ] Commit working source and docs on the feature branch; do not publish or push without instruction.
