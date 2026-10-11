# Quellen und Laufzeiten

Die Oberfläche und Hermes-Verbindung dieses Projekts wurden hier implementiert.
Jarvis/Ultron-Projekte dienten als Vergleich für Bedienung und Umfang; deren
Assistentenlogik wurde nicht als zweiter Agent übernommen.

- Qwen3-TTS: https://github.com/QwenLM/Qwen3-TTS — Apache-2.0.
- qwentts.cpp: https://github.com/ServeurpersoCom/qwentts.cpp — lokaler Checkout
  `51512f129a7419567f4b8abfb06801451789b8f1`; dessen Lizenz bleibt im Checkout.
- GGUF-Gewichte: https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF.
- whisper.cpp: https://github.com/ggml-org/whisper.cpp — MIT; Checkout
  `d1be6fde11ac6e0407606b4e42fe72d34add8037`.
- Whisper-Gewichte: https://huggingface.co/ggerganov/whisper.cpp.
- Silero VAD 6.2.0 (GGML): https://huggingface.co/ggml-org/whisper-vad;
  ursprüngliches Modell: https://github.com/snakers4/silero-vad — MIT.
- Silero VAD v5 (ONNX), lokale laufende Satzenderkennung mit sherpa-onnx:
  https://github.com/snakers4/silero-vad/tree/v5.0 — MIT.
- OpenCV headless 5.0.0.93: https://github.com/opencv/opencv — Apache-2.0.
- YuNet 2023mar und SFace 2021dec: https://github.com/opencv/opencv_zoo;
  Modell-Lizenzdateien liegen neben den heruntergeladenen ONNX-Dateien.
- Qwen3-VL 8B Instruct: https://github.com/QwenLM/Qwen3-VL — Apache-2.0;
  lokales Ollama-Paket: https://ollama.com/library/qwen3-vl:8b-instruct.
- Vorhandene Ollama 0.30.8 Laufzeit: https://github.com/ollama/ollama — MIT.
- Öffentliche Kamera-Prüfbilder: https://github.com/opencv/opencv/tree/4.x/samples/data
  (`lena.jpg`, `messi5.jpg`); nur unter ignoriertem Runtime-Pfad zur Modellprüfung.
- Hey-Hermes-Modell und Desktop-Laufzeit: vorhandene Hermes-Agent-Installation,
  https://github.com/NousResearch/hermes-agent.
- pyopen-wakeword 1.1.0; sherpa-onnx / sherpa-onnx-core 1.13.8, numpy 2.5.3,
  sentencepiece 0.2.2, pypinyin 0.55.0; in der isolierten Python-Umgebung.
- sherpa-onnx-GigaSpeech-Keyword-Modell:
  https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models.
- ws 8.18.3: https://github.com/websockets/ws — MIT.
- MediaPipe Tasks Vision 1.1.0: https://github.com/google-ai-edge/mediapipe — Apache-2.0;
  lokale WASM-Laufzeit und Hand-Landmarker-Modell aus
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task.
  Öffentliches Hand-Testbild aus https://storage.googleapis.com/mediapipe-assets/right_hands.jpg;
  nur im ignorierten Runtime-Verzeichnis für Modellprüfung.
- Vergleich: https://github.com/IDM411/Local-Jarvis,
  https://github.com/Severoos-ui/Ultron-ai-desktop.

Die jeweiligen Lizenzen und Modellkarten bleiben maßgeblich. Runtime-Checkouts,
Modelle und deren Lizenzdateien sind lokal verfügbar und werden nicht als
Projektquellcode eingecheckt.

## Projektgraph und öffentliche Lagequellen

- Graphify-Labs `graphifyy==0.9.84`: [offizielles Repository](https://github.com/Graphify-Labs/graphify),
  [Lizenzhinweis](https://github.com/Graphify-Labs/graphify/blob/v8/NOTICE).
  Apache-2.0 mit historischen MIT-Anteilen. Eigene lokale Umgebung unter
  `runtime/graphify`; nur statische Codeextraktion, kein LLM-API-Aufruf.
- [OSIRIS API](https://osirisai.live/docs): 29 feste öffentliche GET-Feeds,
  davon acht Fokusansichten. Quelldaten bleiben Anbieterinhalte; öffentlicher
  Abruf erlaubt nicht automatisch jede Weiterverwendung. Keine RECON-Aufträge
  oder kostenpflichtigen OI-Modellaufrufe. `oi/trending` ist ausschließlich ein
  öffentlicher Prognosemarkt-Feed.
- [USGS](https://earthquake.usgs.gov/fdsnws/event/1/): öffentlicher Erdbebenkatalog
  für vergangene Berliner Kalendertage und Tagesgrenzen jenseits des
  rollierenden OSIRIS-Fensters. Aktuelle Erdbebenmeldungen stammen über OSIRIS
  ebenfalls aus USGS; Magnituden können später korrigiert werden.
- [DeepState](https://deepstatemap.live/): gelieferter Ukraine-Kartenstand über
  OSIRIS, mit Quellenzeit und vereinfachter Geometrie. Anzeige ist keine
  unabhängige Bestätigung. Öffentliche Kameras, Nachrichten und andere Feeds
  behalten ihre jeweiligen Betreiber-/Quellenangaben und Nutzungsbedingungen.

Projektgraph, Globus und Hinweisoverlay verwenden lokale SVG-/Canvas-/HTML-
Darstellung. Es wurde kein zusätzlicher Cloud-Bilddienst für diese Ansichten
eingebunden. Funktionsumfang und Grenzen: [Projektgraph](docs/project-graph.md),
[OSIRIS](docs/osiris.md), [Steuerungs-API](docs/control-api.md).

- Windows-Audioausgabe: Core Audio/MMDevice-Schnittstellen (Microsoft), https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/ ; PolicyConfig-ABI anhand der öffentlich dokumentierten Interop-Signaturen im Projekt AudioDeviceCmdlets geprüft, https://github.com/frgnca/AudioDeviceCmdlets. Es wird kein Modul oder dessen Quellcode ausgeliefert. Der lokale Adapter enthält ausschließlich die benötigten festen Schnittstellen und Render-Standardsetter.
