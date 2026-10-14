# Session Recall Implementation Plan

> Execute with subagent-driven-development, scoped task review and final review.
> User has requested the behavior. No commits, pushes, setting resets or Gateway restarts.

**Goal:** Show remote ownership on both Orbs and explicitly return a conversation from an online or failed device.
**Architecture:** Extend the existing coordinator/receipt and the shared client; native UI and speech keep their existing paths.
**Tech Stack:** Existing Python/FastAPI/SQLite, Node/Electron, native renderers.
**Spec:** `docs/superpowers/specs/2026-10-13-session-recall-design.md`.

## Tasks

- [ ] Server: closed `recall`, requested online returns, offline prepared recovery, strict atomic accept rechecks. Tests first in `tests/test_session_handoff.py`. Only coordinator/router/tests are assigned to the server implementer.
- [ ] Client/UI: shared presence and recall, await source readiness or observed Hermes runtime idle, exact target/revision and lost-receipt reconciliation. Update both main/preload and native Orbs. Focused controller, main and renderer regressions.
- [ ] Review, full Node/Python checks and docs/Skills. Back up and compare the deployed server; reload only its idle dashboard. Update only own idle clients preserving settings. Validate online return and an actually stopped remote client, then confirm returning client stays passive.

## Rulings

- Reuse the current dirty checkout: the authorized feature extends existing uncommitted clients; isolating only Git HEAD would discard that actual app.
- No extra approval loop: user requested presence and recovery explicitly; bounded choices reuse the authorized handoff flow.
- `requested` is live while the initiating target renews its lease; expiry of target must release an obsolete request. A busy source must not expire merely because its current work takes longer than 30 seconds.
- Do not infer success from transport, a selected session, or a synthetic response. Real native and offline/reconnect checks are required.
