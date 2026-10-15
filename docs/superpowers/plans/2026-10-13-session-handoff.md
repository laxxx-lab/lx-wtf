# Session Handoff Implementation Plan

> **For agentic workers:** Use subagent-driven-development task by task with independent checks. No commits, pushes, Gateway restarts, or replacement of existing private settings.

**Goal:** Explicitly move the same conversation from Windows to Notebook after the current work finishes and confirm reception before silencing the source.

**Architecture:** A dashboard router under `/api/lilith/handoff` uses the existing authenticated Hermes principal. Persistent ownership/revisions and idempotent transfer requests coordinate two client controllers; heartbeat and readiness remain device-local. Unsupported server routes fail visibly without faking a transfer.

**Tech Stack:** Existing Hermes Python/FastAPI/SQLite; Node built-ins and existing Electron/Gateway/Conversation modules. No new production dependency or service provider.

**Spec:** `docs/superpowers/specs/2026-10-13-session-handoff-design.md`.

## Global Constraints

- Preserve the large existing dirty checkout, all local settings and selected sessions. Continue in the attached working directory because this feature extends its current uncommitted clients.
- Privacy/Standby/Live/Wakeword preferences are never reset or automatically enabled.
- Transfer blocks new source submissions and waits for existing jobs/audio/sensor work to finish. Windows queued actions keep their original device and cannot replay on Linux.
- Principal, profile, stored session ID and client instance must match. Request retry uses the same ID, receipt and revision.
- A lost receipt is unknown until reconciled; committed ownership never rolls back on timeout.
- No private credentials, IPs, conversation text or runtime data in versioned tests/docs.
- VPS deployment needs accepted access and confirmed running version; both are now verified. Production handoff still requires the renewed client logins.

## Task 1: Coordinator and existing-auth dashboard adapter

Create `scripts/session_handoff.py`, `scripts/hermes_handoff_router.py`, and `tests/test_session_handoff.py`.

HTTP contract: `POST /api/lilith/handoff` JSON containing `operation`, `clientId` (persistent UUID), `instanceId` (launch UUID), `profile`. Operations:

- `register`: `name`, `kind` (`windows`/`notebook`), `session` (`id`, `profile`, `title` or null), `busy`, `privacyLocked`, `connected`. Re-register every 2 seconds; an active different instance of the same client ID is rejected.
- `poll`: return `supported:true`, `clients`, `incoming`, `outgoing`, `ownership`. Records have `requestId`, `sourceId`, `targetId`, `session`, `state` (`preparing`, `committed`, `failed`), `revision`, `error`. Ownership rows use `sessionId`, `profile`, `ownerId`, `revision`.
- `request`: `requestId`, `targetKind`, `session`. Exactly one eligible known target; source fresh/idle and owns the session. Duplicate request ID returns the same receipt; different payload rejects.
- `accept` / `reject`: `requestId`; reject may include short `error`. Only the exact target instance may answer. Commit is atomic, both participants fresh, source still owns its session, target connected/unlocked/idle. Preparing expires after 30 seconds and explicitly fails, committed never expires back to source.

All identifiers and payload fields validated/closed; body capped at 8 KiB. Clients expire after 8 seconds. DB tables partition by verified identity and profile. Store file private; no sensitive request/access logs. Adapter uses the actually installed verified cookie Session.user_id/provider, rejects missing verified identity even on loopback and cross-origin browser mutation; no caller-supplied principal accepted. Unit tests use real SQLite and a controllable clock. Test malformed requests, two actors/profiles, busy/offline/privacy target, duplicate, stale instances, timeout before/after commit, concurrent ownership proposals and restart persistence. Verify red then green.

## Task 2: Shared client controller and Linux integration

Create `session-handoff.cjs`, `tests/session-handoff.test.cjs`. Export `handoffIntent(text)` returning `notebook`/`windows`/null and `createSessionHandoff(options)`.

Options: `clientId`, `kind`, `name`, `stateFile`, `request(payload)` using current authenticated gateway JSON, `getState()` returning coordinator registration fields, `selectSession(session)` which waits for confirmed idle and selects exactly the provided stored ID/profile, `showHistory(session)`, `onState(snapshot)` and `onTransferred(session)` suppressing source microphone/voice. No direct token/SSH/MCP-shell transport.

Controller methods: `start()`, `close()`, `requestTransfer(targetKind)`, `tick()`, `canSubmit(session)` and `snapshot()`. Snapshot exposes `available`, `phase`, `detail`, `pending`, `passive` and `clients`. Persistent pending request is written before network submission. In-flight source/target handoff blocks submissions; a remote owner keeps the old client passive. Target selection/history callbacks run only for a live eligible preparing request; accept retries reconcile committed receipt, failure restores or safely freezes previous selection. Session change/privacy/transport generation invalidate stale target callbacks. HTTP404 means unsupported and never reports success. Poll/register each 2s without overlapping ticks, clean timer on close. Tests exercise callbacks and real receipt payloads/failure sequences, not source-text assertions.

Integrate in `linux-main.cjs` with its existing auth Session/Gateway and `linux-client.cjs` stored identity rules. Renderer shows handoff status and supports a Windows/Notebook transfer button via allowlisted IPC. History rows are rendered with textContent, no resend to model. Raw microphone/device settings are unchanged. Add isolated renderer regression.

## Task 3: Windows entry point, UI and actual verification

Modify `main.cjs`, `preload.cjs`, `ui/app.js` and `ui/index.html` minimally. Intercept the explicit handoff intent before local dialogue/direct dispatch but after stop/privacy validation. Integrate owner gate into all shared submit/queue paths; continue previously queued source jobs until the agreed idle barrier. Pending handoff closes only the current capture, not saved Live/Wakeword preferences. On successful transfer suppress output for that old session and leave the PC usable for other sessions.

Snapshot/UI display actual pending/unavailable/committed state and button uses the same controller. Use existing current-auth gateway fetch and persisted local UUID, not a new credential. Source desktop/sensors/background work is never relocated. Preserve running jobs on unsuccessful transfer.

- [x] Write and observe failing coordinator/client tests, then implement and run focused checks.
- [x] Review task 1 and task 2 contracts and adversarial failure paths; repair meaningful findings.
- [x] Run Node syntax checks, focused real Electron fixtures and `npm.cmd test`, `git diff --check`.
- [x] Update local client/agent docs and deployment guide.
- [x] Synchronize the handoff contracts in both agent Skills through the authenticated Gateway; preserve their other content, back up/compare before writing and verify full readback/enabled state.
- [x] Verify two isolated client controllers against the real local HTTP router with synthetic verified identity; prove same stored session and exactly one active input. Selection/history callbacks do not submit model prompts. This is not a real Hermes runtime/device proof.
- [x] Verify VPS access/version/process, back up and deploy the route; reload the idle dashboard and activate both own clients. Preserve selected sessions/settings and the separate Gateway service.
- [x] Verify three real PC → Notebook → PC cycles through both native surfaces after renewed client logins; same stored ID/profile, owner revisions 1 → 2 → 3 → 4 → 5 → 6 → 7, source input closed and readable history shown without prompt replay.

## Rulings

The desired behavior is approved. Continue implementation without further design questions. Server access is the current deployment barrier, not a reason to omit code, regression checks or documentation. Existing unrelated changes stay in place; no branch integration/commit is authorized.

Verified deployment identity is Session.user_id/provider, not the originally
assumed principal field. Native Electron fetch carries Sec-Fetch-Site:none and
no Origin; that case is allowed only behind verified cookie auth/JSON, while
cross-origin browser mutation remains rejected. Busy/locked startup clients
still receive a canonical first-owner assignment without unlocking sensors;
handoff readiness remains strict. Missing canonical ownership, failed storage
or failed registration block new input rather than enabling two sources.

Local outcome: 960 Node tests (955 passed, five optional skipped), 24 Python
tests, syntax and diff checks passed. The real Zorin compositor/renderer
fixture ran in a private isolated staging tree. Server and own clients are now
updated; only the idle dashboard was reloaded, the separate Gateway remained
active. A private stable signing key fixes the existing Basic-provider logout
on restart. Real transfers and Gateway Skill synchronization are verified.
Actual UI tests exposed two stale status labels and raw stored Voice wrappers;
regressions cover all three fixes. Both own clients were updated again while
idle; preferences and saved selection survived. Spoken handoff recognition and
heard Notebook output remain separate hardware checks, not claimed by UI QA.

Follow-up: receiving clients announce "Ich bin jetzt hier, Boss." only after
the committed receipt is persisted and fresh ownership/selection/privacy
confirm this target. Clearing the pending receipt before notification prevents
poll/reconnect/restart replay; late unknown accept delivery can announce only
when its original commitment is first reconciled. No extra model prompt or new
server route. Both native directions showed a single greeting; Notebook output
monitor identified the own Lilith stream and Windows default-output meter saw
audio, without microphone capture. Unit checks cover receipt loss, restart,
privacy, source ownership and local speech integration. der Nutzer confirmed the
Notebook greeting was heard exactly once and clearly; Windows output is
technically measured, not separately human-confirmed.
