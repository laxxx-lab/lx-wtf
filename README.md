# Hermes Voice für Windows

Ein lokaler Sprachclient für deine vorhandene Hermes-Instanz: animierter Orb,
Infobereich, Hotkey, deutsche Stimme, Aktivierungsnamen und Systemüberwachung.
Die Sprachmodelle laufen auf diesem PC. Aufträge und Texte gehen an deinen
Hermes-Gateway; die vorhandene Windows-MCP-Verbindung bleibt dessen Werkzeug.

## Starten

Auf diesem eingerichteten PC **Hermes Voice** im Startmenü oder auf dem Desktop
öffnen. Alternativ:

```powershell
& 'C:\Users\patri\Documents\ChatGPT\Voice\launch.ps1'
```

Auf den Orb klicken, **Anmelden** wählen und im normalen Hermes-Gateway-Fenster
anmelden. Danach ausdrücklich die gewünschte **Telegram-Session** auswählen.
Die App erzeugt keinen Ersatzchat und übernimmt nicht stillschweigend eine
andere Session. Mit **Ctrl + Alt + Leertaste** ein Live-Gespräch starten/beenden.

Falls noch die während der Entwicklung geöffnete App läuft, im Infobereich
**Hermes beenden** wählen und über die Verknüpfung neu starten.

## Bedienung

- Orb: klicken zum Aufklappen, ziehen zum Verschieben.
- Live-Gespräch: automatische Aufnahme bis zur Sprechpause; Sprachausgabe lässt
  sich unterbrechen. Kopfhörer verbessern die Trennung zwischen Stimme und Raum.
- Aktivierung: **Hey Hermes**, **Hey Lilith**, **Hey Lillis**; optional auch
  **Lilith** und **Lillis** allein. In Einstellungen getrennt von Live aktivierbar.
- Nach einem Aktivierungswort antwortet die App mit einer lokal gespeicherten
  kurzen Ansage, z. B. „Ja?“ oder „Lilith einsatzbereit …“. Bei einem bereits
  erkannten angehängten Auftrag geht dieser direkt an Hermes.
- Beim Beginn eines Sprachauftrags kommt einmal eine kurze lokale Rückmeldung:
  „Okay“, „Alles klar, ich schaue es mir an“ oder bei Recherche/Bearbeitung
  „Alles klar. Dazu brauche ich einen Moment“. Die Aufgabe läuft parallel weiter;
  anschließend folgt die tatsächliche Antwort. [Details](docs/task-start-feedback.md).
- **Stopp** beendet die aktuelle Arbeit und Sprachausgabe; Live und Kamera bleiben
  erhalten. Noch nicht gesendete Aufträge werden abgebrochen. Eine neue Anfrage
  setzt die Arbeit in derselben Session fort; unklare externe Wirkungen müssen
  zuerst geprüft werden. **Ruhe** oder **Gespräch beenden** beendet Live.
  Ein eingeschaltetes Aktivierungswort bleibt danach bereit. **Mikrofon und
  Stimme aus** im Infobereich schaltet auch das Aktivierungswort ab.
- Einstellungen: drei Stimmrichtungen, natürliche/leise/kraftvolle Sprechweise,
  Überwachung, Hinweise an Hermes, gesprochene Hinweise und Windows-Autostart.
- Werkzeugfreigaben und Rückfragen erscheinen in der aufgeklappten Ansicht.
  Freigaben gelten jeweils einmal; die App aktiviert keinen dauerhaften
  Automatik- oder Yolo-Modus.

## Alltag und Agentenwerkstatt

„Fasse das Kopierte zusammen“ liest auf Anfrage Text aus der Zwischenablage.
„Erklär mir dieses Fenster“ liest den sichtbaren UIA-Text des zuvor ausgewählten
Fensters. Quelle, Abrufzeit und Begrenzungen erscheinen aufklappbar in der
Werkstatt. Keine Hintergrundabfrage; Grafiken benötigen den Bildschirmblick.

Unter Einsatzmodi lassen sich Apps, Ordner und benannte Webseiten zusammenstellen.
„Arbeitsplatz starten“, „Ich möchte spielen“ und „Feierabend“ wählen die
gespeicherten Ziele. Die voreingestellten Modi enthalten keine erfundenen Apps.

Die Werkstatt verwendet unter geeignetem Windows 11 natives Acrylic mit dunklen,
leicht transparenten Flächen. Lilith kann passende Inhalte ohne Fokuswechsel
präsentieren und ihre eigene Darstellung wieder ausblenden. Sobald du darin
arbeitest, gehört die Ansicht dir. Ihre Monitorposition und Maximierung werden
gespeichert. Der konkrete Werkzeugweg steht im
[Hermes-Skill](docs/hermes-voice-control/SKILL.md).

„Mit Windows starten“ aktiviert den Voice-Client für den angemeldeten Benutzer.
Der Projektordner und die Electron-Laufzeit müssen am gleichen Ort bleiben.
Einrichtung und Prüfung: [Autostart](docs/autostart.md),
[Alltagsmodi](docs/daily-routines.md), [Inhaltsquellen](docs/current-content.md).
Der geprüfte Stand und die Grenzen stehen unter
[Alltag und Werkstatt](docs/everyday-stage-status.md).

## Quellcode aus dem Repository einrichten

Dieses Repository enthält den Client, Helfer, Dokumentation und Tests. Modelle,
private Referenzstimmen, Fotos, Anmeldung und lokale Einstellungen werden nicht
mitgeliefert. Voraussetzung: Windows, Node.js/npm und die Electron-Laufzeit einer
vorhandenen Hermes-Desktop-Installation. Im geklonten Projektordner:

```powershell
npm ci --ignore-scripts
.\launch.ps1
```

Die eigene Hermes-Gateway-Adresse in den Einstellungen hinterlegen, anmelden und
die gewünschte Session auswählen. Lokale Sprach-/Kameramodelle benötigen die
separaten Schritte unter [Sprachlaufzeit](docs/voice-runtime.md) und
[Kameralaufzeit](docs/camera-runtime.md). Windows-MCP und der PC-Helfer-Skill werden
für den jeweiligen Rechner eingerichtet; Beispielpfade müssen dazu angepasst
werden. Die Veröffentlichung installiert keine fehlenden Modelle automatisch.

## Systemüberwachung

CPU, RAM und freier Platz auf C: werden alle 15 Sekunden lokal gemessen.
Anhaltend mindestens 90 % CPU/RAM löst nach drei Messungen eine Warnung aus;
98 % ist eine Eskalation. C: warnt bei gleichzeitig höchstens 10 GiB und 10 %
freiem Platz. Erholung und bestätigte Verbindungsverluste werden gemeldet.
Unveränderte Warnungen wiederholen sich nicht. Normale Messungen erzeugen keine
Modellanfragen.

Relevante Messereignisse können an die ausgewählte Hermes-Session gehen, sobald
kein Sprachauftrag, keine Aufnahme/Transkription und keine Sprachausgabe aktiv
sind. Hermes erhält gemessene Fakten und den Auftrag, sie kurz einzuordnen.
Die Hinweise beauftragen keine automatischen Löschungen oder Neustarts.

GPU-Auslastung wird zusätzlich über Windows-Zähler gemessen, die Cua-/Windows-
Anbindung im Leerlauf separat geprüft. Temperatur bleibt unbekannt.
„Systemstatus“ gibt einen kurzen lokalen Bericht ohne Hermes-Chat.

## Kamera und Wiedererkennung

Im Orb **Einstellungen → Sicht / Lokal** öffnen, die angeschlossene Kamera
auswählen und **Kamera einschalten** aktivieren. Die Vorschau und der Hinweis
**Kamera aktiv** zeigen den Zugriff an. Zum Ausschalten genügt der Schalter;
alternativ im Windows-Infobereich **Kamera ausschalten** wählen.

**Kamerablick** oder eine Sprachfrage wie „Was halte ich in der Hand?“, „Was
siehst du?“ oder „Wer sitzt vor dem Computer?“ analysiert ein aktuelles Bild.
Die Bildbeschreibung läuft lokal mit Qwen3-VL 8B auf der vorhandenen RX 7900 XTX.
Das Modell wird beim Einschalten im Hintergrund vorbereitet; der erste kalte
Start braucht länger. Normale Sprachaufträge verwenden die Kamera nicht.
Der VPS-Hermes bekommt die daraus erzeugte textliche Beobachtung mit deiner
Frage; Kamerabilder werden nicht an ihn gesendet.

Gesichter werden lokal mit YuNet erkannt. Für persönliche Wiedererkennung den
Namen eingeben und **Mein Gesicht einrichten** wählen: allein, gut beleuchtet
und nah genug vor der Kamera bleiben, bis **3 / 3** erreicht ist. SFace speichert
nur lokale Gesichts-Einbettungen unter `.local/face-profiles.json`, keine Fotos.
Das Profil lässt sich über **Profil löschen** wieder entfernen.

**Eingerichtete Personen lokal wiedererkennen** und **Erkannte Personen einmal
begrüßen** sind separat schaltbar. Eine Begrüßung setzt drei übereinstimmende
Analysebilder voraus. Kurze Erkennungslücken oder ein Schalterwechsel führen
zu keiner wiederholten Begrüßung. Unbekannte Personen bekommen keinen geratenen
Namen. Die Funktion erkennt keine Lebendigkeit und schaltet keine Zugriffsrechte
frei. Objektbeschreibungen und Vergleiche können irren; unsichere Beobachtungen
werden ausdrücklich gekennzeichnet.

Die Kamera ist beim ersten Start aus. Gesichtsprüfung läuft ungefähr alle zwei
Sekunden ohne LLM-Aufruf. Bildbeschreibungen erfolgen nur auf Anfrage. Eine
eigene Ollama-Instanz bindet an 127.0.0.1:11435, verwendet ausschließlich die
lokale Modellablage unter `runtime/vision/` und hat Cloud-Inferenz deaktiviert.

## Lokale Sprache und gemessene Leistung

- Qwen3-TTS Base 1.7B, Q8_0, qwentts.cpp und Vulkan auf RX 7900 XTX.
  VoiceDesign erstellt die Referenzen einmal; Live-Antworten verwenden feste
  registrierte Sprecherreferenzen unter `voices/fixed/registry.json`.
  Normal, leise und kraftvoll verwenden pro Stimmrichtung dieselbe
  Sprecher-Einbettung mit unterschiedlichen Ausdrucksreferenzen. Sehr kurze
  Antworten verwenden nur die feste Sprecher-Einbettung; ihr Ausdruck kann
  schwächer sein. Keine neue Stimmentwicklung pro Satz.
- Whisper large-v3-turbo, vollständige Gewichte, whisper.cpp und Vulkan.
  Silero VAD 6.2 prüft tatsächliche Sprache vor der Transkription. Stille wird
  zusätzlich lokal verworfen; unzuverlässige Segmente werden nicht abgesendet.
  Wörter wie „Vielen Dank“ sind erlaubt, wenn sie tatsächlich gesprochen wurden.
- OpenCV YuNet / SFace für lokale Kamera-Gesichter; Qwen3-VL 8B Instruct für
  lokale Objektbeschreibung über die bereits installierte Ollama-Laufzeit.
- openWakeWord für Hey Hermes; sherpa-onnx für weitere Namen. Deutsche Namen
  haben zusätzlich eine lokale Whisper-Erkennung nach kurzen Sprachäußerungen.
- Stimmproben: `voices/01-sovereign.wav`, `02-dark.wav`, `03-playful.wav`;
  Ausdrucksproben: `04-whisper.wav`, `05-power.wav`.
- Aktuelle Probe mit vier getrennt erzeugten Sätzen: `voices/fixed-consistency.wav`.
- Nach Aufwärmen: etwa 1,8–2,3 Sekunden Synthese für 13–15 Sekunden Audio.
  Ein kurzer PCM-Streamingtest lieferte nach 130 ms das erste Audio.
- Eine 14,8 Sekunden lange deutsche Testaufnahme wurde in 2,1 Sekunden korrekt
  transkribiert. Kurze Aktivierungsproben nach Aufwärmen: etwa 160–180 ms.

Diese Messungen enthalten nicht VPS-Netzlaufzeit und Hermes-Modellantwort.
Stimmqualität, Konsistenz im langen Gespräch, Mikrofon-Erkennung und Unterbrechung
im echten Raum brauchen noch deinen Hör- und Gesprächstest. Die Stimmen wurden
gestaltet; es sind keine Klone der genannten Schauspielerinnen oder Filmstimmen.

## Stand der echten Hermes-Verbindung

`http://lilith.lx.local` ist erreichbar. Öffentlicher Status meldet Hermes 0.21.5
und eine verbundene Telegram-Plattform. Die Anmeldung und Fortsetzung einer
ausgewählten Gateway-Session funktionieren inzwischen. Der Nutzer hat das
Live-Gespräch getestet. Die gezielte Fortsetzung der Telegram-Session,
Windows-MCP-Aufträge und deren Freigaben sind noch nicht end-to-end geprüft.

Die App verwendet ein eigenes persistentes Cookieprofil. Zugangsdaten bleiben
im Gateway-Anmeldefenster und werden nicht in die Renderer-API oder in dieses
Repository geschrieben. Lokale Einstellungen, Cookieprofil und Logs liegen
unter dem ignorierten Verzeichnis `.local/`.

## Entwicklung und Prüfung

Hermes kann Kamera, Live-Modus und Wakewords über die [lokale Steuerungs-API](docs/control-api.md) bedienen. Der aktivierte Gateway-Skill `hermes-voice-control` enthält die Windows-MCP-Befehle; das API-Token bleibt auf dem PC.

Die [Orb-Darstellung](docs/orb.md) nutzt einen animierten JARVIS-Reaktorkern mit eigenen Bewegungen und einstellbaren Farben für jeden Zustand. Live-Vorschau und Bewegungsstärke stehen unter **Einstellungen → ORB / REACTOR**.

[JARVIS / ARBEITSPLATZ](docs/jarvis-workstation.md) ergänzt ein Einsatz-HUD mit echten Werkzeugereignissen, Bildschirmblick auf eine ausgewählte Quelle, kurzlebige Markierungsrahmen und konfigurierbare Gaming-/Arbeits-/Feierabendmodi. Die Einstellungen befinden sich im gleichnamigen Bereich; Bildschirmblick startet ausgeschaltet.

**Digitale Werkstatt:** `Ctrl+Alt+W`, die neue Orb-Schaltfläche oder „Lilith,
öffne die Werkstatt“. Systemübersicht, Einsatzkonsole für dieselbe Session und
eigener Browser stehen dort bereit. [Details](docs/workbench.md).
Unter Kamera optional **Werkstatt per Handgesten steuern** einschalten:
offene Hand halten öffnet, Faust halten verbirgt, seitliche Handbewegung
wechselt den Bereich. Kamera zuerst einschalten; die Erkennung benutzt
denselben Stream lokal. [Gesten und Prüfumfang](docs/gestures.md).
Einsatzmodi können über **Installierte Apps laden** auch Store-Apps aufnehmen.

Manueller Start per Doppelklick auf **Start-Hermes-Voice.cmd** oder mit `launch.ps1 -Expanded`. **Mit Windows starten** aktiviert den Autostart nach der Windows-Anmeldung. Die App registriert die Einstellung beim Start erneut und versucht die Gateway-Verbindung auch dann erneut, wenn das Netzwerk beim ersten Versuch noch nicht bereit war.

„Geh in den Standby“ beendet Live und aktiviert die Wakeword-Bereitschaft mit einer kurzen Bestätigung. Sprachaufträge erhalten eine nur für diesen Auftrag geltende Vorgabe für knappe Antworten; einfache Aktionen lesen erst das Endergebnis statt Zwischenberichte vor. Telegram erhält keine globale Änderung dieser Antwortpräferenz. Explizite Erklärungswünsche bleiben ausführlich möglich.

```powershell
npm test
.\runtime\voice\venv\Scripts\python.exe -m unittest discover -s scripts -p '*_test.py'
.\launch.ps1 -Smoke -Expanded
```

Der Smoke-Lauf nutzt ein separates Cookieprofil, schreibt `.local/app-smoke.png`
und `.local/smoke.json` und beendet sich. Er führt keine Hermes-Aufträge aus.
Die Sprachserver binden nur an 127.0.0.1:8870/8871. Die App nutzt die vorhandene
Electron-Laufzeit von Hermes Desktop; sie benötigt keine globale Neuinstallation.
Die gebauten Engines, Python-Umgebung und Modelle liegen im ignorierten `runtime/`.

## Kosten

Die neue Friday-Ausbaustufe ergänzt gespeicherte serielle Aufträge, geprüfte
LightCraft-Eingaben im Stream, Lehre, Projektaktivität und Pinch-Gesten sowie
gemessene Sprachzeiten. Benutzung und geprüfte Grenzen:
[Friday-Ausbaustufe](docs/friday-stage-status.md).

Standardbefehle, Erkennungswörterbuch und eine optionale globale Sprechtaste
sind an dieselbe Session und Auftragsliste angebunden:
[Direkte Sprachbedienung](docs/direct-speech-status.md).

Keine zusätzlichen Sprach-API-Gebühren oder Sprachabos. Strom, der bestehende
VPS und dein bisheriger Hermes-Modellanbieter bleiben Teil deines Setups.

Audioausgabe, einmalige Wartehinweise nach 20 Sekunden und Modellvorbereitung für den lokalen Bildblick: [Bedienung und geprüfte Grenzen](docs/audio-and-wait-feedback.md).
