# Optional Gemini Live speech

Approved direction: an optional Live speech interface on the existing desktop client;
Hermes retains sessions, jobs, tools, device routing and confirmed outcomes. The
existing local speech mode remains the default. Android and EchoLocal are clients
of that architecture, not new independent agents. This change implements the
Windows integration and a reusable transport; Linux activation follows actual
client integration and testing, not a claim based on shared source alone.

## Boundaries

- No provider request before the user selects Gemini, explicitly permits cloud
  audio and supplies their own API key. No billing configuration changes.
- Store the key with Electron safeStorage in ignored local storage. Never expose
  it in settings snapshots, renderer responses, logs or tracked files. Refuse
  insecure basic_text key storage on Linux.
- Reuse the selected microphone and existing PCM24k playback. Gemini receives
  PCM16k only while the user explicitly opens Live. Privacy, standby, microphone
  stop, shutdown, session change and handoff close the provider connection.
- Live response audio may be paraphrased. Job states and tool results remain
  authoritative. No extra local TTS for provider responses.
- Gemini can submit a Hermes request and inspect status through narrow validated
  functions. Use existing admission and job machinery, never direct shell access.
  Duplicate function IDs must not cause duplicate jobs. Interrupted speech does
  not imply cancellation of already admitted jobs. A stop request uses the normal
  verified cancellation path.
- Network errors close the cloud audio path visibly. No automatic paid or local
  replay of an uncertain request. Reconnect must not replay tool actions.
- ADB/USB inspection is read-only. No Dot flashing, reset, Wi-Fi changes or
  microphone recording as part of discovery. Absence from ADB is reported as such.

## User surface and evidence

Speech settings offer local / Gemini Live, a cloud-audio opt-in, a masked key
entry that never reads the stored key back, a voice choice and connection status.
Changing settings never starts cloud capture. Start/stop uses the existing Live
button. Existing wakeword and push-to-talk keep their local behavior for now.
Report that scope clearly. Test transport with a local WebSocket peer, renderer
audio routing with real code in a controlled harness, and integration guards.
Actual Google audio and Dot operation require their real connections.
