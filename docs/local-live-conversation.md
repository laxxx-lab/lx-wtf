# Lokales Gespräch mit Lilith

Lilith führt kurze freie Sprachgespräche lokal, während die ausgewählte
VPS-Hermes-Session Aufgaben, Werkzeuge und persönliche Erinnerungen übernimmt.
Die vorhandene geklonte Referenzstimme bleibt die gemeinsame Stimme. Für diese
Gesprächsschicht entstehen keine API-Kosten.

## Bedienung

Unter **SPRACHE / DIREKT** gibt es zwei Einstellungen:

- **Schnelle Gespräche lokal führen**: Begrüßungen, Befinden und allgemeine
  Erklärungen nutzen das lokale Modell. Persönliche Erinnerungen, aktuelle
  Informationen, PC-/Sensorfragen, Aktionen und unklare Fortsetzungen gehen
  weiter zur ausgewählten Hermes-Session. Texteingaben bleiben bei Hermes.
- **Natürliche Satzenden und Dazwischenreden**: Eine lokale Audioerkennung
  prüft nach einer kurzen Sprechpause, ob der Satz vollständig klingt. Ein
  bestätigtes „mhm“, „aha“ oder „verstehe“ senkt die laufende Stimme kurz ab
  und lässt sie weiterlaufen. Eine echte Unterbrechung stoppt die Gesprächsausgabe
  und verlangt das bestätigte Ende des vorherigen Gesprächszugs, bevor die neue
  Frage übermittelt wird. Sie wird nicht hinter diesem Zug eingereiht.
  Unabhängige Hintergrundagenten bleiben separat. „Ja“ und „okay“ werden wegen
  möglicher Aufgabenbestätigungen nicht als belanglose Zwischenrufe verworfen.

„Stopp“ bleibt der vorhandene Auftragsstopp. Standby schaltet Live und die
Kamera aus und bewahrt deren Rückkehrpräferenz; Datenschutz sperrt beide
Gesprächswege. Ein Sessionwechsel oder Datenschutz löscht den flüchtigen lokalen
Gesprächskontext. Es werden dafür keine zusätzlichen Gesprächsdateien angelegt.

Die Statuszeilen unterscheiden vorbereitetes Modell, Start/Fallback und lokale
Satzenderkennung. Ohne verfügbaren Gesprächsserver übernimmt Hermes. Ohne
Satzendmodell bleibt die bisherige Pausenerkennung verfügbar. Nach bereits
begonnener lokaler Sprachausgabe wird eine fehlerhafte Antwort nicht automatisch
noch einmal an Hermes gesendet.

## Technischer Vertrag

- `local-dialogue.cjs`: Qwen3.5-4B Q4_K_M, llama.cpp Vulkan, ausschließlich
  `127.0.0.1:8874`, Alias `lilith-live`. Kein Thinking im lokalen Gespräch.
  Der Hauptprozess verwendet sechs Gesprächszüge mit insgesamt maximal 2000
  Zeichen; keine ganze Hermes-Historie und kein eigener Werkzeugzugriff.
- `turn-detector.cjs` / `scripts/turn_detector.py`: LiveKit
  `turn-detector-v1-mini` über `livekit-local-inference` 0.2.7, lokales CPU-Modell
  mit deutscher Erkennung. Die App verwendet konservativ Schwelle 0,5 und
  höchstens 1200 ms zusätzliche Haltezeit. Keine Serveranfrage für Satzenden.
- `main.cjs`: getrennte lokale Gesprächs-ID; Hermes-Auftrags-ID und Job-Ledger
  bleiben erhalten. Fremde Hermes-Sprachausgabe wartet auf die lokale Antwort.
  Generierung allein schreibt keine vollständig gehörte Antwort in den Kontext.
  Erst erfolgreiches PCM für alle Sätze und das passende tatsächliche
  Renderer-Abspielen bestätigen sie. Leeres, ungerades oder abgebrochenes PCM
  und veraltete Generationen können diese Bestätigung nicht auslösen.
- `conversation.cjs`: begrenzter lokaler Kontext begleitet den nächsten
  gesprochenen Hermes-Auftrag als `voice_context`. Antworten von Hermes werden
  lokal als **„Hermes berichtete:“** eingeordnet, nicht als neuer Ausführungsbeleg.
- `preload.cjs` / `ui/app.js`: feste IPC-Aktionen `turn-predict`,
  `local-dialogue-ready`, `playback-drained`; generations- und sessiongebunden.
  `interrupt` mit `conversationOnly:true` stoppt nur die Sprachausgabe.
  Dies ist eine interne Gesprächsfunktion, keine neue freie HTTP-Ausführungs-API.
- `status.localConversation`: Aktivierung, Bereitschaft, Busy, Modell,
  flüchtige Zuganzahl, ausstehendes Abspielen, Fehler und Satzendbereitschaft.
  `status.voiceTiming.summary` enthält reine Laufzeitmessungen ohne Transkript:
  `localFirstTokenMs`, `localModelMs`, `turnPredictionMs` und vorhandene
  STT-/TTS-/Rendererzeiten.

## Installation und Start

Die öffentlichen Helfer beziehen gepinnte Dateien und prüfen SHA-256. Sie
installieren keine kostenpflichtigen Dienste und führen keine heruntergeladenen
Installationsskripte aus. Modelle/Binaries bleiben unter ignoriertem `runtime/`.

```powershell
& .\scripts\setup-live-model.ps1 -Action Download
& .\scripts\setup-live-model.ps1 -Action Verify
& .\scripts\setup-turn-detector.ps1
& .\scripts\setup-turn-detector.ps1 -CheckOnly
```

Der Satzendhelfer verwendet das bestehende lokale Python 3.12 und installiert
sein einzelnes geprüftes Wheel isoliert unter `runtime/turn/python`, ohne die
vorhandenen STT-/TTS-Pakete umzubauen. Nach Installation startet die App die
lokalen Helfer selbst. Der Modellserver wird vor der Bereitschaftsanzeige
vorgewärmt; auch der Stimmenserver muss erreichbar und die feste Referenzstimme
vorbereitet sein. Parallele Start-/Warmupaufrufe starten keinen zweiten eigenen Server.
Ein schnelles Datenschutz-Aus/Ein bereitet die neue Freigabegeneration neu vor.

## Prüfgrenzen

Diese Umsetzung bleibt eine lokale STT → Textmodell → TTS-Pipeline mit
Satzendprüfung und Unterbrechungssteuerung. Sie ist kein natives Full-duplex-
Audio-Sprachmodell. Die natürliche Überlappung hängt auch vom Mikrofon,
Lautsprecherecho und den Windows-Audiofiltern ab. Menschliche Raum-/Gesprächs-
tests sind zusätzlich zu synthetischem Audio nötig.

Qwen3.5-4B kann sprachlich oder faktisch falsch antworten. Aufgabenbehauptungen
werden zusätzlich gefiltert; der Filter ist kein allgemeiner Wahrheitsbeweis.
Aktuelle PC-Beobachtungen und persönliche Erinnerung bleiben bei Hermes.
Spezielle Wissensfragen und lange Analyse haben weiterhin dessen Laufzeit.
Eine lokale Antwort ist kein Beleg für eine Windows-Aktion oder neue Adminrechte.

Auf des Nutzers RX 7900 XTX wurden nach Warmup erste vollständige Modellsätze mit
156–211 ms gemessen, unter gleichzeitiger TTS-Last 200–283 ms. Ein größerer
synthetischer Gesprächskontext brauchte 296–796 ms. Das sind reine Modellzeiten,
keine zugesicherte Dauer vom Sprechen bis zur hörbaren Antwort. Die tatsächliche
STT-/TTS-/Rendererkette wird getrennt gemessen. Das native CPU-Satzendmodell
brauchte in synthetischen deutschen Audiotests 32–34 ms pro Vorhersage.

Der integrierte Electron-Test ergab in zwei Proben 317 und 783 ms vom erkannten
Text bis zum tatsächlichen Renderer-Wiedergabestart. Die Ausgabe wurde für den
Test im Raum stumm geschaltet; dies bestätigt die native Audio-Timeline, keine
subjektive Hörqualität. Ein nur lokal genannter erfundener Code wurde danach
über `voice_context` von der bestehenden VPS-Session korrekt wiedergegeben.
Gleichzeitig konnte ein weiterer lokaler Gesprächszug antworten, ohne die
Hermes-Auftrags-ID zu verändern. Session, Mikrofon, Stimme und Sensorpräferenzen
blieben gleich. Diese Einzelmessungen sind kein dauerhafter Latenzgarant.

Ein weiterer integrierter Test verwendete einen erfundenen 1,84-Sekunden-
Audioclip: Spracherkennung 471 ms, insgesamt 768 ms vom fertigen Audioclip bis
zum Renderer-Wiedergabestart. Die vorherige Sprechpause/Satzendentscheidung ist
darin nicht enthalten. Das gewählte Sennheiser-Mikrofon wurde tatsächlich geöffnet;
Wakeword war scharf, Live und Kamera blieben gemäß Ausgangspräferenz aus.
Die normale App wurde anschließend mit bereitem Gesprächs- und Satzendmodell
gestartet; Windows-Autostart bleibt aktiv. Der Hermes-Skill wurde mit Backup,
Vergleich und vollständigem Readback auf dem VPS ergänzt.

Fokussierte Regressionen stehen in `tests/local-dialogue.test.cjs`,
`tests/live-conversation-main.test.cjs`, `tests/voice-renderer.test.cjs` und
`tests/turn-detector.test.cjs`. Der native Satzendtest ist standardmäßig
übersprungen; mit `HERMES_TEST_LOCAL_TURN=1` benötigt er die installierten Dateien.
Der abschließende Gesamtlauf bestand 794 Tests bei fünf ausgewiesenen Skips,
ohne Fehler. Der zusätzlich freigeschaltete native Satzendtest bestand mit allen
acht zugehörigen Regressionen. Geräusche, Echo und menschliche Zwischenrufe im
Zimmer sind damit weiterhin nicht abschließend bewertet.
