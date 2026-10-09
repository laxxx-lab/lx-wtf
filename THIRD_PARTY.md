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
- Hey-Hermes-Modell und Desktop-Laufzeit: vorhandene Hermes-Agent-Installation,
  https://github.com/NousResearch/hermes-agent.
- pyopen-wakeword 1.1.0; sherpa-onnx / sherpa-onnx-core 1.13.8, numpy 2.5.3,
  sentencepiece 0.2.2, pypinyin 0.55.0; in der isolierten Python-Umgebung.
- sherpa-onnx-GigaSpeech-Keyword-Modell:
  https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models.
- ws 8.18.3: https://github.com/websockets/ws — MIT.
- Vergleich: https://github.com/IDM411/Local-Jarvis,
  https://github.com/Severoos-ui/Ultron-ai-desktop.

Die jeweiligen Lizenzen und Modellkarten bleiben maßgeblich. Runtime-Checkouts,
Modelle und deren Lizenzdateien sind lokal verfügbar und werden nicht als
Projektquellcode eingecheckt.
