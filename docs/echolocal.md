# EchoLocal voice satellite

EchoLocal can turn an unlocked Echo Dot Gen 2 into a Home Assistant Assist
satellite, with local wakewords, speaker and LED ring. Upstream project:
https://github.com/ygelfand/echolocal. Hardware and firmware compatibility must be
checked against that project's current documentation.

## Read-only discovery

Connect the intended device to the host with a USB data cable. `adb devices`
should list an authorized device before attempting ADB access. An empty list
does not prove broken firmware, and a generic USB audio device does not prove
that the Echo Dot is present. Do not flash, reset or reinstall drivers as a
discovery step. The upstream host CLI provides `echolocal status` for its
existing installation. Keep serial numbers, network addresses and encryption
keys out of public diagnostics and Git.

## Planned Hermes connection

The Dot remains a Home Assistant satellite. A separate conversation bridge must
connect its selected conversation to Hermes with explicit room/device identity,
job status and conversation ownership. This desktop preview does not yet
implement that bridge. Basic home commands can continue using the existing
Home Assistant pipeline.

Gemini Live is an optional speech path, not a replacement for that bridge.
The independent https://github.com/matt123p/ha-gemini-live integration provides
an implementation to evaluate. It is not an official Home Assistant integration.
Its full-duplex interruption needs compatible satellite microphone streaming,
speaker interruption and acoustic echo cancellation. A functioning normal
Assist pipeline does not establish those capabilities. Test the actual Dot
before promising the same interruption behavior as a headset client.

No automatic installation, billing activation, firmware change or entity
exposure is part of the desktop Gemini setup. Device credentials stay local.
