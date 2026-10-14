# Lokale Sprachserver auf Linux

Der Linux-Client verwendet dieselben Sprachmodelle, festen Sprecherprofile und
HTTP-Verträge wie der Windows-Client. Der vorhandene VPS-Hermes bleibt der Agent.
Die lokalen Server hören ausschließlich auf Loopback: Qwen-TTS auf `8870`
(`/health`, `/v1/audio/voices`, `/v1/audio/speech`), Whisper auf `8871`
(`/`, `/inference`). Die Linux-Engine-Auswahl und den Start übernimmt der
Linux-Client; das folgende Skript baut nur die nativen Programme.

## Private Dateien und Quellen

Die vorhandenen nativen Quellen einschließlich ihrer mitgelieferten `ggml`-
und Vendor-Verzeichnisse müssen unter `runtime/voice/qwentts.cpp` und
`runtime/stt/whisper.cpp` liegen. Windows-Buildverzeichnisse sind keine Linux-
Programme und werden nicht wiederverwendet. Modelle und Stimme werden direkt
auf das eigene Notebook übertragen und bleiben ignoriert; keine Veröffentlichung
über Git und kein erneuter Download einer abweichenden Modellversion.

| Datei | Größe des vorhandenen Windows-Exemplars |
| --- | ---: |
| `runtime/voice/models/qwen-talker-1.7b-base-Q8_0.gguf` | 2.079.448.256 Byte |
| `runtime/voice/models/qwen-tokenizer-12hz-Q8_0.gguf` | 291.150.624 Byte |
| `runtime/stt/models/ggml-large-v3-turbo.bin` | 1.624.555.275 Byte |
| `runtime/stt/models/ggml-silero-v6.2.0.bin` | 885.098 Byte |
| `voices/fixed/registry.json` | 225.860 Byte |

Die aktuelle Registry enthält 14 Profile mit eingebetteten Sprechervektoren,
Audio-Codes und Referenztext. Ihre Inhalte gehören nicht in Diagnoseausgaben.
VoiceDesign-Gewichte und importierte Originalaufnahmen sind für die Wiedergabe
dieser festen Profile nicht erforderlich. Vorgerenderte Wakeword-Ansagen können
gezielt ergänzt werden; Wakeword und lokaler Satzenddetektor haben eigene
Laufzeitvoraussetzungen und werden durch diesen Build nicht bereitgestellt.

## Build ohne Administratorrechte

Erforderlich: Bash, CMake, ein C-/C++-Compiler, Ninja oder Make. Das Skript nutzt
bereits installierte Werkzeuge und greift nicht auf `sudo`, Paketmanager oder
das Netz zu. Bei fehlenden Werkzeugen bricht es ab. Vorab:

```bash
bash scripts/setup-linux-runtime.sh --backend cpu --check
```

`--check` prüft Quellen, nichtleere Modell-/Registry-Dateien und Werkzeuge. Es
belegt weder eine vollständige CMake-Konfiguration noch gültige Modellgewichte,
GPU-Inferenz oder ein geöffnetes Mikrofon.

```bash
bash scripts/setup-linux-runtime.sh --backend cpu
# NVIDIA/CUDA: nvcc und funktionierendes nvidia-smi erforderlich
bash scripts/setup-linux-runtime.sh --backend cuda
# Vulkan: SDK-Entwicklungsdateien, glslc und SPIRV-Headers erforderlich
bash scripts/setup-linux-runtime.sh --backend vulkan
```

Für Vulkan suchen beide vorhandenen Quellstände über CMake nach
`Vulkan COMPONENTS glslc` und `SPIRV-Headers CONFIG`; CMake muss mindestens
Version 3.19 haben. Auf Ubuntu/Zorin können die Entwicklungsdateien bei Bedarf
in ein eigenes Präfix entpackt und über `CMAKE_PREFIX_PATH`, `PATH` und
`LD_LIBRARY_PATH` bereitgestellt werden. Benötigte Pakete und Abhängigkeiten
gegen die tatsächlich installierte Distribution prüfen. Ein reparierter
NVIDIA-Treiber stellt noch keinen CUDA-Compiler bereit.

Die Standardwahl `--backend auto` nutzt CUDA nur mit vorhandenem `nvcc` und
erfolgreichem `nvidia-smi`; sonst meldet sie ausdrücklich den CPU-Build. Vulkan
wird gezielt gewählt. Ein Fehler bei ausdrücklich angefordertem CUDA oder
Vulkan führt zu einem Fehlercode, nicht zu einem stillen Backendwechsel.
`LILITH_BUILD_JOBS` begrenzt die Parallelität, standardmäßig auf vier Prozesse.

Die Build-Ausgaben liegen unter:

```text
runtime/voice/build-linux/tts-server
runtime/stt/build-linux/bin/whisper-server
```

Die vorhandenen Windows-Ausgaben unter `build/` bleiben erhalten. Der Build
nutzt mitgelieferte HTTP-Bibliotheken und deaktiviert BLAS, Curl, SDL und FFmpeg;
PCM/WAV und die bestehenden HTTP-Aufrufe benötigen diese Zusatzpakete nicht.
Ein erfolgreich gebauter Server ist noch kein Nachweis, dass die Modelle auf
der gewünschten GPU laufen. Für eine Betriebsbestätigung die echten Server-
Startmeldungen, Health-Endpunkte, einen nichtleeren TTS-PCM-Stream und eine
bekannte deutsche STT-Probe prüfen; anschließend Ein-/Ausgabe in der tatsächlichen
Linux-Desktop-Sitzung separat prüfen.

## Prüfungen des Build-Skripts

`node --test tests/linux-runtime.test.cjs` führt das echte Bash-Skript mit
temporären Quelldateien und kleinen Werkzeughelfern aus. Es prüft den
schreibfreien Vorabcheck, fehlende Modelle, abgewiesenes CUDA und erhaltene
CMake-Fehlercodes. Auf Windows nutzt dieser Test Git Bash, auf Linux `/bin/bash`.
Diese Skriptprüfungen ersetzen keinen nativen Linux-Build oder Gerätestest.
