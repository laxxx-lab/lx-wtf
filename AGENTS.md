# Lilith / Hermes Voice: Projektanleitung

Dies ist der Windows-Client von Patriks bestehendem VPS-Hermes, kein eigener
Ersatzagent. Projektwurzel auf seinem PC:
`C:\Users\patri\Documents\ChatGPT\Voice`.
Repository: https://github.com/laxxx-lab/lx-wtf.

Bei Bedienung den Skill `hermes-voice-control` verwenden; bei Reparatur oder
Erweiterung zuerst diese Datei und `docs/agent-maintenance.md` vollständig lesen.
Hermes auf Linux liest diese Windows-Dateien über seine vorhandene Windows-MCP-
Shell. Ein Linux-`terminal` mit `C:\...` ist kein Zugriff auf diesen PC.
Der bereits eingerichtete Windows-SSH-Zugang ist für Quellen und Tests geeignet;
GUI-Starts und echte Audio-/Sensorprüfung brauchen die interaktive Anbindung.

## Architektur und Einstiegspunkte

| Bereich | Quellen / Vertrag |
| --- | --- |
| Electron-Hauptprozess, Session, Aufträge, IPC | `main.cjs`, `preload.cjs`, `conversation.cjs`, `gateway.cjs` |
| Automatische Rechentiefe pro Auftrag | `automatic-thinking.cjs`, `conversation.cjs`, `docs/automatic-thinking.md` |
| Orb, Mikrofon, Live, Wakeword, Wiedergabe | `ui/app.js`, `ui/microphone.js`, `ui/speech-activity.js`, `ui/voice-interaction.js`, `ui/orb.js` |
| Lokale Steuerungs-API und Agentenhelfer | `control-api.cjs`, `control.ps1`, `docs/control-api.md` |
| Direkte Befehle, Audio, Bluetooth | `direct-commands.cjs`, `audio-output.cjs`, `bluetooth.cjs`, passende Helfer in `scripts/` |
| Auftragslebenszyklus und Beobachtungen | `job-queue.cjs`, `job-reconciliation.cjs`, `task-ledger.cjs`, `voice-timing.cjs` |
| Kamera / Bildschirm / Einkreisen | `camera-service.cjs`, `screen-service.cjs`, `circle-interest.cjs`, `ui/camera.js`, `ui/screen-capture.js` |
| Werkstatt / Artcraft / Projektgraph / Lagekarte | `workbench.cjs`, `artcraft.cjs`, `project-graph.cjs`, `osiris-client.cjs`, passende `ui/`-Dateien |
| Datenschutz, Standby, Autostart | `local-safety.cjs`, Standby in `main.cjs`/`ui/app.js`, `startup.cjs`, `launch.ps1` |

Dateinamen und Exporte vor Benutzung aktuell prüfen. `rg --files` und gezielte
Suche verwenden. Aktuelle Bedienverträge stehen unter `docs/`; alte Entwürfe in
`docs/superpowers/` sind Hintergrund, keine Behauptung über den jetzigen Stand.

## Arbeitsregeln

- Nutzerauftrag ausführen, auch bei ausdrücklich gewünschter Reparatur oder
  Erweiterung. Routinearbeit innerhalb dieses Umfangs braucht keine erneute
  Erlaubnis. Bedienauftrag allein ist kein Auftrag zum Umbau der App.
- Vorher `git status --short` lesen. Vorhandene fremde Änderungen erhalten;
  keine pauschalen Resets, kein `git clean`, kein Überschreiben von Nutzerdaten.
- Fehler bis zum tatsächlichen Ursprung verfolgen. Kleinste passende Änderung
  im vorhandenen Ablauf; gemeinsame Funktionen und native Helfer wiederverwenden.
- Passende Regression für Verhalten, dann fokussierte Tests. Nach Änderungen
  am gemeinsamen Ablauf `npm.cmd test` und `git diff --check` ausführen.
  Ein angenommener Befehl oder eine Modellantwort ist kein Ergebnisnachweis.
- Reale Geräte-, Renderer- und Windows-Sitzungswirkungen zusätzlich prüfen.
  Simulatoren belegen keine echte Audioausgabe, Kamera, Spotify- oder PC-Aktion.
- Session, Sprecherreferenz, Mikrofonwahl, Kamera-/Bildschirm-/Datenschutz- und
  Standby-Präferenzen erhalten. Keine Session zurücksetzen oder Gateway-Neustarts
  als Reparaturversuch. Keine gleichzeitigen Zugriffe auf dieselbe Kamera.
- Die aktive Voice-App bei normalen Bedienaufträgen laufen lassen. Zum Anwenden
  einer ausdrücklich beauftragten Änderung nur den nach Pfad und Kommandozeile
  bestätigten eigenen App-Prozess neu starten, erst ohne aktiven Auftrag.
- `.local/`, `runtime/`, `voices/`, Modelle, Aufnahmen, Fotos, Cookies, Tokens und
  private Logs bleiben lokal/ignoriert. Keine Geheimnisse in Ausgabe oder Git.
  Bei Diagnose nur benötigte Felder lesen, keine kompletten privaten Dateien.
- Nach Erweiterungen betroffene Bedien-Dokumentation und Agenten-Skill aktualisieren.
  Commit/Push nur im vom Nutzer autorisierten Umfang; keine automatischen Uploads
  aus einer Diagnose heraus. Keine neuen kostenpflichtigen Dienste ohne Auftrag.

## Schnelle Prüfung auf dem PC

```powershell
Set-Location -LiteralPath 'C:\Users\patri\Documents\ChatGPT\Voice'
git status --short
& .\control.ps1 -Action status
node --test tests/microphone.test.cjs tests/voice-renderer.test.cjs
npm.cmd test
git diff --check
```

Wenn die App aus ist, funktioniert `status` nicht. Quellcode und Tests bleiben
zugänglich. Auf einen beauftragten Start `& .\launch.ps1` über die interaktive
Windows-Anbindung ausführen; GUI-Apps nicht in SSH-Dienstsitzung 0 starten.
