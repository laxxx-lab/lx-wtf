# Lilith Collaboration Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans to implement the independent tasks and integration below. Preserve uncommitted user work and do not commit or push.

**Goal:** Make explicit screen/file requests usable through a shared workbench with projects and verified visual desktop hints.

**Architecture:** Reuse existing content capture, job queue, Graphify source validation and guide overlay. Add a small local project registry and lazy directory browser. Keep the existing Hermes session and all sensor permissions.

**Tech Stack:** Existing Node/CommonJS, Electron, plain HTML/CSS/JavaScript and Node test runner; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-lilith-collaboration-design.md`.

## Global Constraints

- Keine neuen Abhängigkeiten und keine neuen kostenpflichtigen Dienste.
- Vorhandene fremde Änderungen erhalten; kein Reset, Clean, Commit oder Push.
- Session, Stimme, Mikrofon, Sensorfreigaben und Standby erhalten.
- Projektregistrierung und absolute Ordnerpfade bleiben lokal unter `.local/`.
- Projektdateien nur nach ausdrücklicher Auswahl lesen; keine Laufwerkssuche.
- Reale Nutzeraufträge weder durch Tests noch durch Aktivierung unterbrechen.

## Task 1: Local projects

Files: new `project-library.cjs`, `tests/project-library.test.cjs`; reuse the validators from `project-graph.cjs` through exports.

Interface: `createProjectLibrary({file,initialRoot,onChange})` returns synchronous `snapshot()`, `active()`, `resolve(id)`, `add(root)`, `select(id)`, `rename(id,name)`, `remove(id)`, `list({id,path:''})`, `read({id,path})`. `resolve` revalidates an existing root without scanning contents or persisting. Snapshot is `{projects:[{id,name,root}],activeId}`; list is `{id,path,entries:[{name,path,kind,readable}],truncated}`; read is `{id,name,path,root,text,truncated,observedAt,untrusted:true}`. Root is an explicitly selected real local directory; paths in list/read are relative. At most 32 projects, 500 entries per level, 1 MiB input and 12000 characters per preview. No recursive crawl or symlink following. Initial migration ignores invalid/stale roots and never reimports into a valid persisted empty registry.

- [x] Write tests: add two temporary roots, persist/reload, rename/remove without deleting contents, nested listings, traversal/absolute paths, replaced root/parent symlinks, excluded names, binary/large input and truncated/redacted preview.
- [x] Run `node --test tests/project-library.test.cjs` and confirm missing implementation fails.
- [x] Implement using `fs`, `path`, `randomUUID` and existing Graphify validation; write registry atomically under the supplied file.
- [x] Run project-library tests and `node --check project-library.cjs`.

## Task 2: Explicit source-bound text actions

Files: `current-content.cjs`, `tests/current-content.test.cjs`; host propagation integrated in Task 4.

Interface: `currentContentIntent(text)` keeps existing explain/read forms and adds `{kind:'window',selection:'pointer',action:true,question}` for explicit draft/rewrite/edit requests referring to `das hier` or text under the pointer. `currentContentPrompt(question,observation,{action=false}={})` accepts only a boolean action flag. Default remains read-only. Action prompts separate the user instruction from untrusted captured text and require fresh target checking and verified effects for actual editing.

- [x] Write regression asserting `currentContentIntent('Schreib aus dem hier eine Antwort').action === true`, read-only questions unchanged, indirect mentions null, and embedded source instructions never become authority.
- [x] Run focused tests and observe failure before implementation.
- [x] Add narrow explicit intent forms and a bounded prompt option; preserve existing limits/redaction.
- [x] Run `node --test tests/current-content.test.cjs` and syntax check.

## Task 3: Desktop guide appearance

Files: `guide-overlay.cjs`, `ui/guide.js`, `ui/guide.css`, `tests/guide-overlay.test.cjs`, `docs/guided-explanations.md`.

Interface: guide `show()` accepts optional `color` from `cyan`, `violet`, `amber`, `green` and `shape` from `frame`, `ellipse`. Default cyan/frame retains current behavior. Only guide requests accept these fields; activity remains unchanged. Renderer receives validated enums, never arbitrary CSS.

- [x] Add tests for supported/rejected enums and unchanged native freshness/identity validation.
- [x] Run tests to see new appearance requests rejected before implementation.
- [x] Add validation/projection and CSS variables plus ellipse target rendering.
- [x] Run guide tests, syntax checks and isolated real Electron overlay check.

## Task 4: Workbench and host integration

Files: `main.cjs`, `workbench.cjs`, `workbench-preload.cjs`, `ui/workbench.html`, `ui/workbench.js`, `ui/workbench.css`, new `ui/project-library.js`; tests in `tests/workbench*.test.cjs` and `tests/workbench-ui.electron.cjs`.

IPC interface: no-argument `project-snapshot`, `project-pick`; `{id}` for `project-select`/`project-remove`; `{id,name}` for `project-rename`; `{id,path}` for `project-list`/`project-read`; `{id,text,path?}` for `project-command`. Every payload rejects extra fields, invalid IDs, paths and controls. Only the trusted local top frame can invoke them. Main enforces privacy and pins current session/safety generation for asynchronous chooser and submissions.

- [x] Add IPC regressions covering trusted sender, exact payload fields, privacy, project-command binding and preload allowlist.
- [x] Add library initialization under `.local/projects.json`; route new methods through `visualAction`; bind selected project/file metadata as untrusted context to existing job submission with a separate displayText. Capture binding before queueing.
- [x] Propagate action flag through `boundedContentPrompt` and `readAndSubmitContent` without granting it to source data.
- [x] Add project sidebar, lazy expanded directory rows, preview and explicit file-attached composer; support remove/rename/add/switch. Clear transient preview on privacy and selection changes; discard late responses.
- [x] Rename console label to Zusammenarbeit, expose existing composer in all tabs, and keep actual pane geometry aligned with native browser view.
- [x] Extend hidden Electron fixture for project listing/selection/read/submit payload, privacy and compact layouts.
- [x] Update `docs/current-content.md`, `docs/workbench.md`, `docs/hermes-voice-control/SKILL.md`, new `docs/projects.md`.
- [x] Run focused tests, changed-JS checks, isolated native fixtures, `npm.cmd test`, `git diff --check`.
- [x] Record actual validation and any activation/device limits; no real user task in QA and no unrelated settings reset.

## Task 5: Research and mobile design

Files: `docs/lilith-jarvis-and-mobile.md`.

- [x] Verify MCU examples separately from comics and derive useful interaction principles.
- [x] Compare an ADB-dependent Android MCP against an on-device MCP and native Android background-service constraints using primary project/platform sources.
- [x] Document a minimal Android voice/share/task client connected to existing VPS-Hermes, with optional separate phone-control MCP; desktop execution requires reachable awake PC.
- [x] Record sources, proposed connection, permissions, real-device checks and user's phone information when available. Do not install, expose network services or claim a working APK.

## Review record

Tasks 1/2/3 share no implementation files. Task 4 consumes their interfaces; preserve read-only defaults, privacy/late-result gates and fixed job target binding. Task 5 changes only documentation. Existing dirty worktree is the current authorized source baseline, and work stays in place. Manual test fixtures replace real sessions and sensors; actual voice/phone performance remains a separate device validation.

## Validation and decisions · 13.10.2026

The independent review found five regressions before activation; all were corrected with failing-first coverage: null initial root, removed-last-project migration, local controls intercepted by project wrapping, source edits skipped by background classification, and stale same-project file previews. Project context is now assembled only when enqueueing, after ordinary local controls; source selection has a separate cancellable generation. A project switch does not retarget the stored prompt.

Full `npm.cmd test`: 886 tests, 881 passed, 5 optional native/hardware tests skipped, 0 failures. Independent scoped review: 144/144 passed. Syntax and `git diff --check` passed. The isolated actual Electron workbench passed at 840x620, 1240x820 and 1440x1040; source attachment, privacy and browser geometry were verified. The guide was verified in a real own inactive native window for eight color/shape combinations and movement cancellation at DPI=1. No user document/action/voice/phone was used as a test.

The user's mobile target is Android-Smartphone. Research and a separate small-app design are in `docs/lilith-jarvis-and-mobile.md`; no APK, remote access exposure or paid service was installed. Changes remain uncommitted in the authorized existing checkout.

Activation: Own Electron main process verified by exact executable/project argument and interactive Session 1. No user task was running. Restart retained selected session, camera/device/recognition, screen permission, standby, live and wakeword preferences; gateway connected and measured voice readiness ready. Real production workbench is visible with user ownership. First production opening exposed an automatic directory-load ownership race; regression now covers manual and agent opening, and only explicit project mutations/file reads claim user ownership. Fresh full suite after this fix: 886 tests, 881 passed, 5 skipped, 0 failed; syntax and diff check passed. No real voice conversation or phone operation was tested. The local control skill source is updated; its separate VPS installation has not been deployed through this session.
