# Lokale Sprachprüfung · 9. Oktober 2026

qwentts.cpp wurde mit dem vorhandenen LLVM-MinGW, Ninja und Vulkan SDK gebaut.
Der Runtime-Log bestätigt **AMD Radeon RX 7900 XTX / Vulkan0**; CPU ist kein
heimlicher Ersatz für die gemessene Sprachsynthese. Whisper meldet ebenfalls
Vulkan0 und geladene large-v3-turbo-Gewichte.

| Probe | Dauer des Audios | Synthesezeit | Verhältnis Zeit/Audio |
|---|---:|---:|---:|
| Souverän | 14,40 s | 9,27 s, erster Aufruf | 0,644 |
| Dunkel/kraftvoll | 14,80 s | 2,22 s | 0,150 |
| Warm/frech | 13,28 s | 2,02 s | 0,152 |
| Flüstern | 15,20 s | 2,23 s | 0,147 |
| Kraftvolle Betonung | 13,28 s | 1,84 s | 0,138 |

Die erste Probe enthält den kalten Shader-/Engine-Anlauf. Ein separater kurzer
PCM-Streamingtest lieferte erstes Audio nach 130 ms und erzeugte 3,04 Sekunden
Audio in 726 ms. Dieser Wert ist ausschließlich die lokale TTS-Verbindung.

Whisper erkannte die 14,8-Sekunden-Probe in 2,09 Sekunden vollständig, einschließlich
„Überblick“, „prüfe“, „kümmere“ und „nächsten“. Kurze Testaufnahmen der fünf
Aktivierungsvarianten wurden nach Aufwärmen in etwa 158–181 ms transkribiert und
den richtigen Namen zugeordnet. Der Text hinter dem Namen blieb erhalten.
Die kleine Keyword-Engine allein war für die deutschen Lilith/Lillis-Proben
unzuverlässig; deshalb gehört der deutsche Whisper-Rückfallweg zur Umsetzung.

WAV-Dateien und `wake-check.json` liegen unter `voices/`. Die WAVs sind gestaltet,
keine Kopien echter Schauspielerinnen. Ein brauchbarer technischer Audiostream
und eine korrekte Transkription ersetzen keinen Hörtest der Stimmqualität.
Die Qualität im realen Mikrofonraum und die langfristige Stimmkonsistenz sind
noch vom Nutzer zu beurteilen.

## Adapter

```powershell
.\runtime\voice\venv\Scripts\python.exe scripts/voice_synthesize.py --text-file voices/audition.txt --output voices/test.wav --voice dark --engine http
.\runtime\voice\venv\Scripts\python.exe scripts/voice_synthesize.py --text-file voices/audition.txt --output voices/whisper.wav --voice dark --delivery whisper --engine http
.\runtime\voice\venv\Scripts\python.exe scripts/transcribe.py --input voices/02-dark.wav
```

Die App startet residente Sprachserver auf 127.0.0.1:8870/8871 selbst, sofern dort
noch keiner läuft. Befehle setzen diese lokalen Server voraus; es gibt keinen
Fallback zu einem bezahlten Sprachdienst.
