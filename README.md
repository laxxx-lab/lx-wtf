# Hermes Voice für Windows

Ein lokaler Sprachclient für deine vorhandene Hermes-Instanz: animierter Orb,
Infobereich, Hotkey, deutsche Stimme, Aktivierungsnamen und Systemüberwachung.
Die Sprachmodelle laufen auf diesem PC. Aufträge und Texte gehen an deinen
Hermes-Gateway; die vorhandene Windows-MCP-Verbindung bleibt dessen Werkzeug.

## Starten

**Hermes Voice** im Startmenü oder auf dem Desktop öffnen. Alternativ:

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
- **Stopp**, **Ruhe** oder **Gespräch beenden** als ganze Äußerung beendet Live.
  Ein eingeschaltetes Aktivierungswort bleibt danach bereit. **Mikrofon und
  Stimme aus** im Infobereich schaltet auch das Aktivierungswort ab.
- Einstellungen: drei Stimmrichtungen, natürliche/leise/kraftvolle Sprechweise,
  Überwachung, Hinweise an Hermes, gesprochene Hinweise und Windows-Autostart.
- Werkzeugfreigaben und Rückfragen erscheinen in der aufgeklappten Ansicht.
  Freigaben gelten jeweils einmal; die App aktiviert keinen dauerhaften
  Automatik- oder Yolo-Modus.

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

Temperatur, GPU-Telemetrie und eine separate Windows-MCP-Verbindungsprobe sind
noch nicht integriert. Werkzeugaktivität des angeschlossenen Hermes wird angezeigt.

## Lokale Sprache und gemessene Leistung

- Qwen3-TTS VoiceDesign 1.7B, Q8_0, qwentts.cpp und Vulkan auf RX 7900 XTX.
- Whisper large-v3-turbo, vollständige Gewichte, whisper.cpp und Vulkan.
- openWakeWord für Hey Hermes; sherpa-onnx für weitere Namen. Deutsche Namen
  haben zusätzlich eine lokale Whisper-Erkennung nach kurzen Sprachäußerungen.
- Stimmproben: `voices/01-sovereign.wav`, `02-dark.wav`, `03-playful.wav`;
  Ausdrucksproben: `04-whisper.wav`, `05-power.wav`.
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
und eine verbundene Telegram-Plattform. Geschützte Session-Endpunkte verlangen
eine Anmeldung. Ohne diese sind die reale Fortsetzung der Telegram-Session,
Windows-MCP-Aufträge und deren Freigaben noch nicht end-to-end geprüft.

Die App verwendet ein eigenes persistentes Cookieprofil. Zugangsdaten bleiben
im Gateway-Anmeldefenster und werden nicht in die Renderer-API oder in dieses
Repository geschrieben. Lokale Einstellungen, Cookieprofil und Logs liegen
unter dem ignorierten Verzeichnis `.local/`.

## Entwicklung und Prüfung

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

Keine zusätzlichen Sprach-API-Gebühren oder Sprachabos. Strom, der bestehende
VPS und dein bisheriger Hermes-Modellanbieter bleiben Teil deines Setups.
