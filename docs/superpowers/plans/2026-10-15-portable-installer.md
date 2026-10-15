# Portable Hermes Voice implementation plan

> Execute with subagent-driven-development; tasks own separate files. User requested
> implementation and Git upload. Do not pause for routine approvals within scope.

**Goal:** Reinstallable Hermes Voice with selectable local speech and own gateway.
**Architecture:** Public Electron payload, persistent per-user workspace, first-run
onboarding and optional portable local speech servers using existing protocols.
**Stack:** Node/Electron, electron-builder NSIS/AppImage/deb/DMG, Python venv.
**Spec:** docs/superpowers/specs/2026-10-15-portable-installer-design.md

## Constraints

Keep production client and ignored personal data untouched. Do not ship runtime,
models, credentials, logs or backups. CPU speech defaults; no GPU driver installs.
No claim of Android support. Preserve existing native runtime as `existing`.
All installers use fixed validated choices, argv execution and explicit dry-run.

### Task 1: Portable speech installation and protocol

Own scripts/install_speech.py, scripts/portable_speech.py,
scripts/requirements-portable-*.txt and tests/portable_speech_test.py.
Consume the CLI and path contracts from the spec exactly. Source/model revision
metadata belongs to this task. Do not modify existing production speech scripts.

- [x] Write failing stdlib tests for choices/bounds/check-only installation, PCM
  resampling and request validation. Run `python -m unittest discover -s tests -p
  portable_speech_test.py`; first failure must demonstrate missing behavior.
- [x] Implement selected venv dependencies and public models, retained licenses,
  atomic downloads and --plan/--check. Existing/none never download models.
- [x] Implement local STT/TTS server protocols, guarded requests, local-only models,
  speech sample rate 24000; actual optional dependency imports remain lazy.
- [x] Run tests and self-review; report API/path details and hardware gaps.

### Task 2: Distribution packages and OS scripts

Own package.json/package-lock.json, electron-builder.yml, .github/workflows/,
scripts/install-linux.sh, scripts/install-windows.ps1,
scripts/prepare-package.cjs, .gitignore, tests/distribution.test.cjs,
tests/engines.test.cjs. desktop-entry.cjs is the entry point, owned by integration.

- [x] Write failing tests for public allowlist, platform targets, script dry-run
  and no dependence on a separate Hermes Desktop. Fix existing native executable
  smoke test to explicitly skip unavailable binaries on a clean clone.
- [x] Pin Electron/electron-builder; version 0.2.0-preview.1; no runtime postinstall
  into the live app. Positive payload allowlist and emitted SHA256SUMS.
- [x] Implement Zorin/Linux install and Windows source bootstrap with selectable
  Python requirements. Provide desktop shortcuts and optional autostart.
- [x] Add native OS CI packaging without assuming developer runtime; upload
  artifacts. Never auto-upload developer files or use secrets from this machine.
- [x] Focused tests and package file inspection; report actual build limitations.

### Task 3: Shared setup choices and onboarding

Own setup-options.cjs, onboarding.cjs, onboarding-preload.cjs,
ui/onboarding.html/js/css, tests/onboarding.test.cjs. Consume spec interfaces.

- [x] Test valid names/URLs/components and merge preservation in a temp root.
  Regression must reject credentials, controls, oversized input and unknown fields.
- [x] Implement validated choices, private atomic installation manifest and settings
  merge. Default settings never point at private Lilith; no session/auth overwrite.
- [x] Build onboarding with name + gateway, independent STT/TTS selectors, existing
  native runtime option, progress/error state and keyboard accessible controls.
  Call provided install callback and save only after successful verification.
- [x] Protect IPC by exact local sender/frame; block navigation/new windows and
  permission requests. Close/cancel rejects pending work cleanly.
- [x] Test lifecycle using a controlled Electron double; self-review and report.

### Task 4: Entry point, runtime integration and verified release

Own desktop-entry.cjs, portable-runtime.cjs, workspace-install.cjs,
main.cjs/linux-main.cjs integration, launch.ps1/launch-linux.sh,
tests/portable-runtime.test.cjs, README.md/docs/install.md and relevant skill docs.

- [x] Test workspace allowlist upgrade/preservation and legacy source behavior.
  Existing settings, voices, models and session files survive repeated upgrades.
- [x] Entry selects a writable root, runs setup only when needed/--setup, launches
  the correct existing main after the installer callback succeeds.
- [x] Portable engine/client replaces only selected components; preserve legacy
  specs if no manifest or existing chosen. Set assistant name as display identity.
- [x] Integrate macOS common client with explicit native capability limits; do not
  map it to a notebook pretending Linux desktop control is supported.
- [x] Run focused + full Node/Python tests; native Windows package build; isolated
  onboarding and actual public speech model smoke test when possible.
- [ ] Update operating docs, save source commit, push installer branch; publish
  preview artifacts only after verifying they exclude private developer data.
