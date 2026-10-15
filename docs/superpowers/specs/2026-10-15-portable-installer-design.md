# Hermes Voice installation and onboarding

User authority: publish the current Git stand, then deliver a reinstallable client
for other users with selectable requirements, STT/TTS, Zorin script, Windows setup,
onboarding and their own Hermes. Product name Hermes Voice; assistant name editable.

## Design

Keep the existing agent/client contracts. Package Electron with the application;
do not require a separate Hermes Desktop install, a compiler, or der Nutzer's files.
Windows uses NSIS; Linux AppImage/deb plus an install script; macOS gets the common
client with explicitly limited native automation. Android is a separate mobile
client, not an Electron installer target, and is not advertised as delivered here.

An entry point copies only packaged public app files into a writable per-user
workspace on first start/version change. Runtime/models, .local, voices, logs and
cookies are never copied from a developer tree, replaced on upgrade or packaged.
Legacy source launches keep their existing root and data. No running production
client, gateway or session is reset by building/testing this change.

Onboarding asks for assistant display name and Hermes gateway URL, then independent
STT/TTS choices. It does not collect a gateway token/password: the ordinary Hermes
login window owns authentication. Microphone/camera/wakeword are off initially.
Name selection is display identity, not a claim of a trained custom wakeword.
Reopen setup with --setup; current settings/session survive. Install failures stay
visible and retryable; readiness is not recorded until selected assets exist.

## Shared interfaces

`setup-options.cjs` exports validateSetup(value), readInstallation(root),
writeInstallation(root,value), applyClientSettings(root,platform,value).
Validated shape: `{assistantName, url, stt:'none'|'base'|'small'|'existing',
tts:'none'|'de_DE-thorsten-medium'|'en_US-lessac-medium'|'existing',
language:'de'|'en'}`. Stored `.local/installation.json` adds schemaVersion:1.
`existing` preserves the current native Qwen/whisper path and private voices.
Settings merge only owned fields; no auth/session or voice-reference exports.

`scripts/install_speech.py --root ROOT --stt CHOICE --tts CHOICE --language LANG`
uses runtime/public/venv (Python 3.10-3.12), pinned direct PyPI dependencies,
selected model downloads and local cache only. Python bootstrap is handled by
the platform installers; GUI reports a concrete missing-Python action when absent.
No sudo/pip into system Python. `--check` verifies installed selected assets without
downloading; `--plan` prints the intended actions without installing. Artifacts
are downloaded from official sources using pinned model revisions/checksums;
third-party model licenses/source links are retained. No personal cloned voice.

`scripts/portable_speech.py --kind stt|voice --model PATH --port N --language LANG`
binds only 127.0.0.1. STT serves /health, /, /inference multipart WAV and returns
segments with text, avg_logprob, no_speech_prob. TTS serves /health and
/v1/audio/speech JSON input; returns PCM16 mono at 24000 Hz. Models loaded locally
only; no automatic inference-time download. Bounded requests, serialized inference,
safe errors and no audio/log content retention. CPU int8 Whisper and CPU Piper are
the portable default. Existing optimized GPU runtime remains selectable unchanged.

`onboarding.cjs` exports `runOnboarding({electron,root,initial,install})` returning
validated choices or null on cancel. `install(value,onProgress)` is provided by
the entry point; the local preload exposes only snapshot/save/progress, protected
by exact sender/frame/file URL checks. No renderer shell/path/URL execution.
UI: name + gateway, STT/TTS selection, requirements/progress, finish. Keyboard
accessible, no innerHTML with input, no embedded credentials, no remote navigation.

`portable-runtime.cjs` adapts chosen STT/TTS into existing engine/client paths.
`desktop-entry.cjs` owns copy/onboarding/runtime launch. Packaged app launches
main.cjs on Windows and linux-main.cjs on Linux/macOS. Public settings have no
Lilith hostname, fixed notebook/IP, private reference voice or home camera URL.

## Packaging and install

Positive public payload allowlist: top-level .cjs and package.json, ui/, scripts/,
assets needed by the client and node_modules production dependencies. Exclude
tests/docs development plans, .local/runtime/voices/models, backups and private
paths. Verify package file list before build. `asar:false` because the existing
native Python/PowerShell helpers require physical files.

Linux script supports installed release AppImage and source setup without curl
pipe execution; verifies release checksums, writes per-user desktop launcher and
optional autostart, supports paths with spaces and fails on unsupported platforms.
Windows setup embeds Electron; source bootstrap can install Node/Python through
winget only when the corresponding options are selected. No driver/security changes.
Both scripts support noninteractive choices and dry run; upgrades preserve data.

CI builds installer artifacts on the respective native OS. Unsigned Windows and
unnotarized macOS builds are previews; signing requires owner certificates. Do not
claim fresh-machine or microphone validation from unit tests. A native Windows
build and isolated new-profile onboarding check are required where feasible.

## Acceptance

- Current committed sources pushed, private backups excluded.
- Fresh setup has no dependency on developer files or a bundled personal Hermes.
- Installer/onboarding selection determines exactly which components are installed.
- Existing source install and user session/settings remain intact.
- Existing API speech protocols work with the portable adapter; include actual
  synthesis/transcription smoke test using selected public models where available.
- Node regression suite, Python tests, package allowlist checks and diff check pass.
- Public docs distinguish verified Windows, Linux instructions/CI and experimental
  macOS/native automation limits. Android remains explicitly separate.
