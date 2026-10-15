# Reliable Lilith device tools implementation plan

> For agentic workers: use subagent-driven-development. The user approved the architecture recommendation and requested implementation. Preserve the existing production checkout and foreign edits; reviewers and integration remain in this chat.

**Goal:** Give the existing Hermes agent direct, device-bound tools for everyday work, verified camera playback and reproducible outcome checks.

**Architecture:** Reuse authenticated local control APIs and existing SSH transports. A small stdio MCP adapter on the gateway exposes named operations; device tokens stay on each device. Standard workflows execute in the client, while the model interprets natural requests. Existing speech, jobs, handoff and privacy remain authoritative.

**Stack:** Existing Node/Electron, Existing Python MCP SDK v2 in the gateway environment, existing SSH/Tailscale. No public listener, new model provider or gateway restart.

**Scope:** Strengthen the existing desktop core and shared protocol first. Preserve themes/settings and current speech behavior. Android UI remains the subsequent client of this protocol, as in the approved recommendation.

## Constraints

- Preserve all pre-existing changes; no reset, clean, push or session reset.
- Work in the established `codex/hermes-windows` checkout for native integration.
- Explicit device required on every tool. Mutations require the expected stable local session ID; no silent cross-device fallback.
- Response identity comes from the actual device. No device token, media URL or credentials in tool output.
- Camera success requires the selected camera's running video player, not an open dialog.
- No replay of uncertain mutations; no mouse-based window placement.
- Reload only the confirmed own idle client; preserve preferences and sessions.

### Task 1: Verified camera workflow

- [x] Add a red regression in `tests/home-display-workflow.test.cjs` for delayed HA readiness, unique live-camera resolution, playback evidence, ambiguity, privacy/cancellation and concurrent requests.
- [x] Implement `showHomeCamera({home,query,cameraEntity,allowed,waitMs,now,sleep})` in `home-display-workflow.cjs`. Reuse `home.open`, `inventory`, `openCamera`, `cameraState`; bounded total deadline, no blind re-open, no login inference.
- [x] Return `{verified,status,cameraEntity,observedAt,evidence}`. Sanitized statuses: playing/login-required/unreachable/ambiguous/not-found/playback-unconfirmed/cancelled/busy.
- [x] Run focused tests and request review.

### Task 2: Direct device MCP and local bridge

- [x] Red tests for explicit devices, scoped mutations, bounded JSON I/O, identity mismatch, secret-free errors and fixed commands.
- [x] Add `scripts/lilith_device_mcp.py`: stdio MCPServer (installed official SDK v2), trusted private configuration of existing SSH commands. Tools: device_status, show_camera, windows_list, window_place, browser, conversation_handoff. Inputs are structured JSON; never interpolate user values into a shell command.
- [x] Add `scripts/device_control.cjs`: local JSON stdin bridge to existing loopback API. Validate fixed action allowlist, configured loopback origin and token; preflight expected stable session for mutations; return actual hostname/platform. Never print config or raw transport errors.
- [x] Use `/v1/home-display` with `{action:'show',query,waitMs}`; `/v1/session-handoff` for existing handoff controller; existing windows/browser endpoints unchanged.
- [x] Test adapter and bridge, then review.

### Task 3: Client integration and concise capability context

- [x] Add typed home-display show and session-handoff API requests with existing privacy/auth/origin controls and request bounds.
- [x] Add stable `sessionContext` metadata to Windows/Linux status. Keep existing `session` display field compatible.
- [x] Bind camera work to captured session/privacy generation on each client and check it before every next step.
- [x] Replace the long Windows shell recipes with concise direct-tool guidance after registration; retain native computer-use fallback guidance and existing device boundaries.
- [x] Expose existing handoff controller only; a queued transfer is not confirmed ownership.
- [x] Update affected operating docs and installed agent skills with backup/concurrency/readback checks.

### Task 4: Outcome evaluations and deployment

- [x] Store a public scenario bank with varied natural requests for camera, windows, handoff, interruption and restart recovery; no private transcripts.
- [x] Add a runner whose grades use tool calls and actual outcome evidence, not answer wording. Unexecuted hardware cases remain explicitly untested.
- [x] Run focused tests, `npm.cmd test`, Python adapter tests and `git diff --check`.
- [x] Use the installed official SDK, deploy owned files and register MCP through authenticated Hermes without restarting gateway. Verify actual schemas and a read-only device call.
- [x] Reload only the own idle client, verify session/preferences and real camera playback through the new tool. Perform an actual agent turn when available; do not claim it from unit tests.
- [x] Save a local checkpoint and report measured results and remaining device-specific limitations.


## Deployment and verification status · 2026-10-15

Windows and gateway activated. Installed SDK v2 reused; no provider or gateway restart.
Actual agent camera call and independent selected-player observation succeeded;
actual agent browser call and independent URL/loading/visibility checks succeeded.
Full software suite: 1197 passed, 0 failed, 5 skipped; VPS adapter: 8 passed.
The private grading record contains one fully recorded browser scenario; the other
19 scenarios remain untested by that runner. This is not a claim of 20 live passes.

Notebook source is prepared but deployment remains pending because Tailscale does
not reach the device. The complete new MCP window-placement test was interrupted
by diagnostic SSH authentication and then physical Escape; no pass claimed.
Further desktop inputs stopped. Real interruption/restart/handoff cases still
need a subsequent live run. Android remains the subsequent client.
