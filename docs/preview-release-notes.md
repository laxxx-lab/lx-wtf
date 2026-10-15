Hermes Voice connects to your own compatible Hermes Dashboard/WebSocket gateway.
Choose the assistant display name, local Whisper recognition and Piper speech
independently during first-run setup. Text mode needs no speech models.

- **Windows x64:** per-user NSIS setup, Electron included.
- **Zorin/Ubuntu/Debian x64:** deb or AppImage with `install-linux.sh`, optional
  prerequisites, application launcher and autostart.
- **macOS Apple Silicon:** experimental DMG/ZIP; conversation client without
  advertised native desktop automation or device handoff.

Download `INSTALL.md` and verify files against `SHA256SUMS`. Selected public models
are downloaded during setup and checked against pinned hashes. No personal voices,
models, credentials, sessions or developer runtime are bundled.

A compatible gateway exposing `/api/auth/ws-ticket`, `/api/ws` and the client's
session/prompt RPC is required. A standalone Hermes CLI is not automatically
compatible. Desktop MCP tools need separate setup. A display name does not train
a custom wakeword.

This is a preview. Native builds and public payload checks run on each operating
system. Windows isolated native first run and a synthetic local Piper-to-Whisper
roundtrip were also verified. Physical microphones, speakers and installation on
every machine have not been verified. Installers are unsigned; macOS is not
notarized. Android, Linux ARM and Intel Mac are not included.

The own project license is intentionally not yet selected. Existing third-party
licenses remain applicable. Personal installations are not upgraded automatically.
Gemini Live is researched in `docs/gemini-live-evaluation.md`; it is not activated
or included as a working provider in this release.
