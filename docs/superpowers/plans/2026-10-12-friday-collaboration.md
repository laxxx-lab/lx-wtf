# Friday collaboration implementation plan

> For agentic workers: implement task-by-task with regression-first checks and an independent review. Independent modules may be delegated; shared main-process integration has one owner.

**Goal:** Make the existing Windows companion recover its speech connection, identify an explicitly referenced source, accept bounded task corrections and present the appropriate working view without taking over the user's view.

**Architecture:** Reuse existing microphone reconnect, engine lifecycle, current-content reader, job queue, remote terminal-event reconciliation and workbench presentation ownership. Small deterministic helpers describe health, correction intent and workbench context; main.cjs owns effects and session/privacy generations.

**Tech stack:** Existing Electron/CommonJS, native Windows helpers, local models. No new dependencies or paid services.

**Spec:** User-approved proposal in this chat: self-diagnosis → shared attention → correctable work → task-focused workshop. Existing docs/current-content.md, docs/job-queue.md, docs/workbench.md and docs/local-live-conversation.md remain contracts.

## Global constraints

- Preserve existing uncommitted local-live changes and every user preference.
- No session reset, gateway restart, automatic task replay, camera reopening or new broad sensor permission.
- Readiness is observed, not inferred from a model answer. Silence alone is not a broken microphone.
- All new source content is explicit, transient, redacted and untrusted. No automatic screen capture.
- Already accepted work cannot be edited or repeated as if it never ran. Correction needs confirmed terminal ownership before a new continuation.
- Keep models, private logs and test evidence ignored. No commit/push in this task.

## Task 1: Speech health

Files: `voice-health.cjs`, `tests/voice-health.test.cjs`, integration in `main.cjs`, `ui/app.js`, `preload.cjs`.

Interface: `createVoiceHealth({now})` supplies `observe(value)`, `snapshot()` and `clear()`. Root passes microphone intent/active state, frame heartbeat, output state, engine readiness, connection and privacy. Snapshot is `{state,summary,checks,repair}`; checks contain no device IDs or transcripts. Suggested repairs are bounded safe actions, never arbitrary shell commands.

- [x] Add failing tests for startup grace, real microphone-frame starvation, healthy quiet input, privacy and repair cooldown.
- [x] Implement bounded pure decisions; root uses `reconnectMicrophone`, `AudioContext.resume` and existing engine/connect functions only when ownership and privacy allow.
- [x] Give renderer a periodic content-free frame heartbeat and make post-repair feedback contingent on the next healthy observation.
- [x] Run focused module/main/renderer regression tests; test native reconnect of the same selected device.

## Task 2: Explicit shared attention

Files: `current-content.cjs`, `scripts/current_content.ps1`, corresponding tests, `main.cjs`.

Interface: Extend explicit current-content intent with a pointer-targeted window request. Existing `captureCurrentContentTarget`, `readCurrentContent`, `currentContentPrompt` remain reusable; native selection must preserve exact PID/HWND/process-start and exclude our own/sensitive windows. Source metadata names pointer vs foreground selection. Follow-up to the last observation must name its original age and cannot claim a new read.

- [x] Failing tests: “Erklär mir das hier” is explicit, general discussion does not read anything, pointer source is pinned, source change/privacy/stale selection cancels.
- [x] Read the window under the real mouse using existing Win32/UIA read and boundary rules; never send clicks or move the mouse.
- [x] Show a transient source card/window perimeter when a fresh verified rectangle is available; no guessed element highlight.
- [x] Native test using a dedicated own test window, then privacy and source-switch regression.

## Task 3: Task corrections

Files: `job-adjustment.cjs`, `job-queue.cjs`, tests, root `main.cjs`/control/IPC integration.

Interface: `jobAdjustmentIntent(text)` returns null or `{kind:'amend'|'pause'|'resume',instruction}`; `adjustmentPrompt(job,instruction)` produces bounded continuation data, preserving original request and warning against repeating executed steps. `JobQueue.amendQueued(id,{text,title,sessionId,profile})` changes only owned, unaccepted queued instructions atomically. Accepted work requires the existing stop/terminal verification before a new continuation linked by sourceJobId.

- [x] Failing tests for narrow correction intent, ambiguous confirmation, ownership, accepted-job rejection, durable queued revision and redaction.
- [x] Implement smallest queued revision. Root serializes active correction, stops only the exact foreground/background owner, waits for real terminal evidence, then enqueues the changed continuation.
- [x] Add UI edit/action entry points; no unknown-outcome retry. “Stopp” retains its existing behavior.
- [x] Native harmless delayed-Hermes correction test verifies original turn ends before changed turn starts.

## Task 4: Contextual workshop

Files: `workbench.cjs`, `ui/workbench.js`, `.html`, `.css`, associated tests; root presentation hooks.

Interface: safe snapshot adds `voiceHealth` and source attention plus revision metadata from the existing queue. Keep `present({tab,reason,requestId})` / `release(requestId)` ownership unchanged. Root only auto-presents substantial explicit jobs: known Artcraft app→artcraft, sources→console, project work→graph when an index exists, otherwise console. Existing manually owned view wins.

- [x] Add failing safe-projection and renderer tests for health, source, goals, actual tool progress, unknown result and user-view preservation.
- [x] Improve existing mission/queue cards rather than add a new dashboard. Show requested goal, current observed step, result and obstacle; actions use exact job IDs.
- [x] Expose correction in the queue and context-driven tab suggestions; automatic browser URLs are never invented.
- [x] Verify native layout at three window sizes, retain mixed-DPI regressions, and check no focus takeover, stale release and privacy.

## Finish

- [x] Update affected docs and Hermes skill through backup, concurrent-change check and full readback.
- [x] `node --check main.cjs`, focused tests, `npm.cmd test`, `git diff --check`.
- [x] Fresh independent review; repair regressions before activation.
- [x] Save exact state fields, restart only confirmed own idle interactive app, verify session/device/sensor state and readiness.
- [x] Report actual runtime evidence separately from untested human room interaction.


## Verified outcome · 12 October 2026

- Full npm suite: 850 tests, 845 passed, five explicit skips, zero failures.
- Native pointer UIA fixture: selected test label only; hidden and unrelated text
  excluded. Source and privacy regressions passed.
- Real Electron workshop: seven tabs, focused revision form, privacy and 840×620,
  1240×820, 1440×1040 layout checks passed; screenshot reviewed.
- Existing Hermes connection: same-input microphone recovery and own VAD-worker
  recovery verified; live/camera/standby/session preferences preserved. Active
  harmless VPS wait task stopped, old job paused before changed job started;
  changed response matched request with zero further tools.
- Independent review: discovered and fixed thinking-preparation cancellation,
  missing-ACK execution uncertainty, required worker readiness, HWND type and
  real preload action allowlist. No remaining actionable findings.
- Hermes skill updated with backup, concurrent-change comparison and full readback.
- Normal app restored through launch.ps1. No source/model/private-data upload,
  commit, gateway restart or session reset.

Speech calibration in the user's room and arbitrary Windows/Artcraft effect
reversal are outside these proofs. The next work can build on the completed
four-part collaboration foundation.
