# Lokale Live-Gesprächsschicht: Implementierungsplan

**Ziel:** Lilith antwortet lokal auf Gespräche, bleibt bei Hermes-Aufträgen
ansprechbar und behandelt Satzende, Zustimmung und Unterbrechungen natürlich.

**Architektur:** Bestehendes Whisper, Silero, Qwen-TTS, Electron und Hermes
bleiben erhalten. Ein dauerhaft warmer lokaler Textmodell-Server ergänzt den
Gesprächsweg. Lokale Gesprächsantworten haben keine PC-Werkzeuge; beauftragte
Aktionen gehen unverändert an vorhandene geprüfte Helfer oder Hermes.
Deutschfähige lokale Satzenderkennung ergänzt Silero, sofern sie auf diesem
Windows-PC tatsächlich funktioniert; bei Ausfall bleibt der bewährte Pfad.

**Rahmen:** kostenloser lokaler Betrieb, AMD RX 7900 XTX; gewählte Session,
Stimme, Mikrofon, Sensorfreigaben und Standby erhalten. Keine Gateway-Neustarts,
keine Wiederholung unklarer Aktionen, kein neuer ungeprüfter PC-Steuerungsweg.
Downloads/Modelle und Messdaten bleiben unter ignoriertem `runtime/`/`.local/`.
Der Nutzer hat diesen Ausbau am 12.10.2026 freigegeben; die vorhandenen lokalen
Streaming-Korrekturen werden erhalten. Keine zusätzlichen Cloud-Anbieter.

## 1. Modell nachweisen

- [ ] Gepinnte llama.cpp-Windows-Vulkan-Laufzeit und Qwen3.5-4B-GGUF beschaffen,
  Herkunft/Integrität prüfen, ausschließlich Loopback-Port 8874 verwenden.
- [ ] Warme erste Text-/Satzlatenz, Deutsch und gemeinsame GPU-Auslastung mit
  laufendem STT/TTS messen. Bei unpassendem Vulkan-Modellpfad den etablierten
  Qwen3-4B-Instruct-2507 prüfen; keine CPU-Simulation als GPU-Erfolg ausgeben.
- [ ] Reproduzierbaren Setup-Helfer und Engine-Vertrag testen.

Dateien: `scripts/setup-live-model.ps1`, `runtime/live/` (ignoriert),
`engines.cjs` (Integration durch Hauptagent), passende Engine-Regression.

## 2. Gesprächsclient

- [ ] Regression für SSE-Fragmente, fehlendes Thinking, Satzstreaming,
  begrenzten Sessionkontext, Abbruch, Fehler und leere Antworten schreiben.
- [ ] `local-dialogue.cjs` liefert `LocalDialogue` mit
  `answer(text,{sessionId,context,signal,onDelta,onSentence})`,
  `interrupt()`/`clear()` und `snapshot()` ohne Gesprächsinhalte.
- [ ] Persönlichkeit und aktuelle bestätigte Auftragsmetadaten begrenzt
  übergeben. Keine Fähigkeiten oder Ausführungen behaupten; Arbeitsanfragen
  beantwortet dieser Client nicht selbst. Abgebrochene Ausgabe nicht als
  vollständig gehörte Antwort ins Folgegespräch übernehmen.

Dateien: `local-dialogue.cjs`, `tests/local-dialogue.test.cjs`.

## 3. Natürliches Zuhören

- [ ] Lokalen LiveKit-Audio-Turn-Detector v1-mini auf Windows untersuchen und
  echte deutsche Clips prüfen; keine Cloud-Verbindung oder Nutzeraudio-Uploads.
- [ ] Begrenzte PCM-Eingaben, Generationen, Deadline und Silero-Fallback testen.
- [ ] Kurze Zustimmung während der Ausgabe von echter neuer Frage unterscheiden:
  Ausgabe zunächst absenken, bei Zustimmung fortsetzen, bei neuer Frage stoppen.
  Generations-/Datenschutz-/Sessionprüfungen vor jedem späten Ergebnis erhalten.

Dateien: `turn-detector.cjs`, `scripts/turn_detector.py`, zugehörige Tests;
Renderer-/IPC-Integration in `ui/app.js`/`main.cjs` durch Hauptagent.

## 4. Integration und Sichtbarkeit

- [ ] Lokales Modell nur für geeignete Voice-Gespräche verwenden; Aufgaben,
  aktuelle Beobachtungen und notwendige Session-Erinnerungen an Hermes geben.
- [ ] Lokalen Turn als echte laufende Gesprächsspur abbilden, Orb/Sprechen und
  Unterbrechung daran koppeln. Haupt-/Hintergrundaufträge getrennt erhalten.
- [ ] Einstellung für lokalen Gesprächsmodus sowie tatsächliche Bereitschaft
  und Latenzen anzeigen. Ausfall vor Ausgabe darf zu Hermes zurückfallen;
  nach begonnener Ausgabe keine zweite Antwort automatisch sprechen.
- [ ] Gesprächskontext zur Hermes-Übergabe als begrenzte, nicht vertrauenswürdige
  Gesprächsdaten übergeben; nicht als neue Anweisungen oder Systemprompt.

Dateien: `main.cjs`, `ui/app.js`, `ui/index.html`, vorhandene Settings-/Orb-
Verträge, `conversation.cjs` falls der aktuelle Gateway-Vertrag es verlangt.

## 5. Abschlussprüfung

- [ ] Fokussierte Tests, `npm.cmd test`, Syntaxprüfungen und `git diff --check`.
- [ ] Native Prüfung: lokaler deutscher Dialog → echtes TTS → Renderer,
  tatsächlicher GPU-Pfad, Unterbrechung/Standby/Datenschutz, paralleler Hermes-
  Auftrag und Gesprächsturn ohne Sessionwechsel oder doppelte Aktion.
- [ ] Betroffene Bedien-Dokumente und Hermes-Skill mit Backup/Readback
  aktualisieren. Nur bestätigten eigenen App-Prozess im Leerlauf neu starten.
- [ ] Gemessene Verbesserung, ungetestete Raumakustik und Hardwaregrenzen
  ausdrücklich unterscheiden. Keine allgemeine Ein-Sekunden-Garantie.
