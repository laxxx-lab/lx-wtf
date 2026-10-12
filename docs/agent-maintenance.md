# Lilith bedienen und weiterentwickeln

## Ein gemeinsames Projekt

Der VPS-Hermes liefert das Modell und seine vorhandenen Skills/MCP-Werkzeuge.
Electron auf Windows hält die ausgewählte Hermes-Session, Audio, Sensoren, Orb,
Werkstatt und lokale Helfer. Die Werkstatt ist seine sichtbare Arbeitsfläche.
Die Agentensteuerung läuft über `control.ps1` und die authentifizierte Loopback-
API; Quellarbeit über die bestehende Windows-MCP-Shell direkt im Projekt.
Diese Anbindung kann lesen, schreiben und Tests starten, soweit ihr tatsächlicher
Windows-Benutzer Zugriff hat. Das ist keine Admin- oder Systemberechtigung.

Die bereits eingerichtete Windows-SSH-Verbindung ist ebenfalls für gezieltes
Lesen, Quellarbeit und Tests geeignet. Dafür den vorhandenen Zugang verwenden,
keine neuen Credentials suchen. Eine SSH-Shell ist trotzdem kein interaktiver
GUI-/Kamera-/Mikrofontest: Starts und echte Desktopwirkungen gehören in die
vorhandene interaktive Windows-Anbindung. Bei PowerShell über SSH UTF-8 und
den tatsächlichen Remote-Exitcode erhalten, nicht hinter `head`/`tail` verlieren.
Für Textausgaben in Windows PowerShell zusätzlich
`[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)` setzen.
Für komplexe Befehle eine eigene temporäre Skriptdatei oder PowerShell
`-EncodedCommand` mit UTF-16LE verwenden, statt mehrere Shell-Ebenen mit
Anführungszeichen und Dollarzeichen zu verschachteln. Nach einem Parserfehler
die angeforderte Wirkung frisch prüfen; der Exitcode einer Linux-Pipeline kann
den Windows-Fehler verdecken.

Auf dem VPS führt `terminal` Linux-Befehle aus. Windows-Pfade werden dort nicht
durch bloßes Zitieren zugänglich. Den geladenen Windows-MCP-Shell-Werkzeugnamen
verwenden, keine erfundenen Toolnamen. Ist diese Verbindung nicht verfügbar,
das konkrete Hindernis nennen. Eine GitHub-Kopie enthält nicht die privaten
Modelle, Einstellungen oder die aktive Windows-Gerätesitzung.

## Betriebsweg

1. Skill `hermes-voice-control` frisch lesen und `control.ps1 -Action status`
   über Windows-MCP abfragen. Verbindung, gewählte Session, `busy`, tatsächliche
   Sensorzustände, Messalter und Fehler unterscheiden.
2. Passenden vorhandenen API-/MCP-Weg verwenden. Die API hat feste Aktionen;
   sie ist kein freier Shell- oder Dateiserver. Werkstatt agentisch mit Anlass
   zeigen, Antwort-ID merken, Nutzerdarstellung erhalten.
3. Wirkung und Quelle prüfen. Bei unbekanntem Ergebnis beobachten und keine
   Mutation blind wiederholen. Einfache Voice-Aufträge knapp abschließen;
   die Start- und Warteansagen übernimmt bereits die App.

Mikrofonwahl ist lokal unter **Audio / Mikrofon** gespeichert und gilt für
Live, Wakeword und Sprechtaste. Hermes kann Eingänge über `microphones` lesen
und mit `microphone -DeviceId` gezielt wechseln. Der Renderer bestätigt den
tatsächlich geöffneten Eingang; die App bewahrt Live/Standby und Gerätewahl.
[Mikrofon](microphone.md), [Audio/Wartrückmeldung](audio-and-wait-feedback.md),
[Bluetooth](bluetooth-control.md), [Steuerungs-API](control-api.md).
Die Rechentiefe wird pro Windows-Auftrag automatisch gesetzt und anschließend
zurückgestellt; Ablauf und Prüfgrenzen: [Thinking](automatic-thinking.md).
Hintergrundaufträge: [Parallelität](background-orchestration.md). Vor Neustarts
`status.busy`, aktive Hintergrundaufträge und Bildauswertung prüfen;
`conversationBusy=false` allein bedeutet lediglich, dass Lilith weiterreden kann.

## Reparatur oder Erweiterung

Zuerst `AGENTS.md`, diese Datei, den betroffenen Bedienvertrag und den aktuellen
Quellcode lesen. Die Zuordnung der Module steht in `AGENTS.md`.
Status und Git-Stand vor dem Eingriff festhalten; laufende Benutzeraufträge
nicht unterbrechen. Das Problem reproduzieren und die Datenkette verfolgen:
Mikrofon → Renderer-PCM → VAD/Wake/STT → Auftrag → Hermes → TTS → Ausgabe.
Bei PC-Aktionen stattdessen Auftrag → Helfer → Windows-Sitzung → Ergebnis lesen.
Eine offene Verbindung belegt nur Transport, keine funktionierende Aktion.

Für gezielte Suche beispielsweise:

```powershell
Set-Location -LiteralPath 'C:\Users\patri\Documents\ChatGPT\Voice'
git status --short
rg -n 'ensureMic|reconnectMicrophone|microphoneDeviceId' ui/app.js ui/microphone.js main.cjs
Get-Content -LiteralPath .\ui\microphone.js
node --test tests/microphone.test.cjs tests/voice-renderer.test.cjs
```

Wenn `rg` fehlt, `Select-String` für dieselben gezielten Dateien verwenden.
Nicht rekursiv private Laufzeit-/Modellordner durchsuchen. Text mit UTF-8 lesen
und schreiben; vor dem Schreiben den aktuellen Inhalt erneut prüfen.
Bestehende Änderungen erhalten und nur die betroffenen Stellen bearbeiten.

Bei einer Verhaltensänderung eine passende Regression hinzufügen, dann die
kleinste Änderung durchführen. `node --check` für geänderte JavaScript-Dateien,
fokussierte Tests und `git diff --check` ausführen. Beim gemeinsamen Ablauf
anschließend `npm.cmd test`. PowerShell Exitcodes in der Rückgabe prüfen;
ein weiterer erfolgreicher Befehl kann einen früheren Fehler verdecken.
Frische Testausgabe nennen; übersprungene Hardwaretests nicht als bestanden
ausgeben. Laufzeitabhängige Änderungen im echten Electron/Windows zusätzlich
prüfen und ungetestete Grenzen ausdrücklich unterscheiden.

## Aktivieren und Rückweg

Ein Neustart ist erst nach geprüfter Änderung nötig. Dafür vorher den aktuellen
Live-/Wake-/Sensorzustand abfragen und sicherstellen, dass keine Aufgabe läuft.
Die aktuelle PID aus `.local/app.pid` ausschließlich als Kandidat benutzen:
`Get-CimInstance Win32_Process` muss die erwartete Hermes-Electron-EXE und genau
dieses Projekt in `CommandLine` bestätigen. Danach nur diesen eigenen Prozess
beenden, `launch.ps1` in der interaktiven Windows-Sitzung starten, Verbindung
und die erhaltenen Einstellungen prüfen. Auf dem VPS nicht die Gateway- oder
Modellprozesse beenden. Ein PowerShell-Fenster in Dienstsitzung 0 ist kein
sichtbarer Desktop; den vorhandenen interaktiven Cua-Weg verwenden.

Bei Fehlern nur den eigenen Patch zurücknehmen oder die zuvor gesicherte eigene
Datei wiederherstellen. Keine Nutzereinstellungen, Referenzstimme, Fotos oder
gesamten Git-Arbeitsbaum ersetzen. Die Diagnose und den nächsten überprüfbaren
Schritt kurz nennen. Neue Fähigkeiten, Endpunkte, Grenzen und Tests in den
betroffenen `docs/` dokumentieren. Agenten-Skills über den Hermes-Gateway mit
Backup, Vergleich gegen zwischenzeitliche Änderungen und vollständigem Readback
aktualisieren. `.local/`-Diagnosen nicht in das öffentliche Repository übernehmen.

## Sichtbar arbeiten

Bei Quellenanalyse die Werkstatt in `graph` oder `console` verwenden. Ein
vorhandener Projektindex darf gezielt durchsucht und die echte Quelle geöffnet
werden; ein alter/unpassender Index ersetzt den direkten Quellzugriff nicht.
Im Graph ist eine statische Beziehung noch kein Laufzeitbeweis. Bei Reparaturen
kurz Problem, Änderung, geprüfte Wirkung und offene Grenzen zeigen; interne
Dateipfade und Testerklärungen gehören in die Werkstatt oder Textantwort,
nicht in jede einfache gesprochene Aktionsbestätigung.
