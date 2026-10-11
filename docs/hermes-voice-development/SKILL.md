---
name: hermes-voice-development
description: "Bei Codearbeit an Liliths Windows-Voice-App verwenden."
---

# Liliths Windows-App verstehen und bearbeiten

Dies ist Patriks eigenes Projekt. Bei einem ausdrücklich beauftragten Fix oder
Feature darf Hermes innerhalb dieses Umfangs am Quellcode arbeiten und testen.
Ein Bedienauftrag allein beauftragt keine Codeänderung. Für normale Steuerung
zusätzlich `hermes-voice-control` frisch laden.

**Verbindlicher Einstieg auf dem tatsächlichen Windows-PC über die vorhandene
Windows-MCP-Shell:**

```powershell
Set-Location -LiteralPath 'C:\Users\patri\Documents\ChatGPT\Voice'
Get-Content -LiteralPath .\AGENTS.md -Encoding UTF8
Get-Content -LiteralPath .\docs\agent-maintenance.md -Encoding UTF8
git status --short
& .\control.ps1 -Action status
```

Hermes selbst läuft auf dem VPS. Sein Linux-`terminal` kann diese Windows-Pfade
nicht lesen. Das vorhandene Windows-MCP-Shell-Werkzeug aus dem aktuellen Katalog
benutzen; keine Namen erfinden. Projektanleitung und Quellcode live lesen,
nicht nur diese Skill-Zusammenfassung oder alte Chat-Erinnerungen verwenden.
Wenn die App aus ist, bleiben Code und Tests erreichbar; `status` braucht sie.

Projekt/Quelle: `C:\Users\patri\Documents\ChatGPT\Voice`,
Repository `https://github.com/laxxx-lab/lx-wtf`.
`AGENTS.md` enthält die aktuelle Modulzuordnung; `docs/agent-maintenance.md`
den Reparatur-, Test-, Aktivierungs- und Rückweg. `docs/control-api.md` ist der
Bedienvertrag. Die Werkstatt-Konsole nutzt dieselbe Hermes-Session; keine zweite
Agenteninstanz und kein Ersatzchat. Vorhandene Windows-Cua-/Artcraft-Werkzeuge
bleiben für echte GUI-Aktionen zuständig.

Reproduzieren → betroffenen Ablauf suchen → Ursache prüfen → kleinsten Patch
mit passender Regression → fokussierte Tests → bei gemeinsamen Abläufen
`npm.cmd test` → echte Laufzeitwirkung prüfen. Exitcodes und frische Ausgabe
kontrollieren. Keine Erfolgsmeldung nur aus akzeptierter API-Anfrage, offener
Verbindung oder selbst formuliertem Testbericht. Bereits beauftragte Routinearbeit
fortsetzen; nur fehlende notwendige Information gezielt erfragen.

Unbekannte Wirkungen vor Wiederholung beobachten. Laufende Nutzeraufträge,
manuelle Werkbankansicht, Session, Mikrofonwahl, Referenzstimme und Sensor-/Standby-
Präferenzen erhalten. Nur den exakt bestätigten eigenen Windows-App-Prozess bei
einer beauftragten Änderung neu starten; keine pauschalen Electron-/Gateway-/
Treiber-Neustarts, kein Git-Reset und keine Entfernung von Kopplungen.

Private Einstellungen, Cookies, Tokens, Stimmreferenzen, Bilder und Modelle unter
`.local/`, `voices/`, `runtime/` lokal lassen. Kein pauschaler Datei-Dump oder
Upload. Änderungen und tatsächlich geprüfte Grenzen dokumentieren. Bei neuen
Bedienfunktionen den Kontroll-Skill mit Backup und Readback aktualisieren.
Mikrofonwechsel erfolgt derzeit in **Einstellungen → Audio / Mikrofon**;
`control.ps1` hat hierfür keinen Endpunkt. Keine API-Fähigkeiten erfinden.

Bei Analyse/Erklärung die vorhandene Werkstatt in `console` beziehungsweise den
passenden vorhandenen Projektgraph benutzen. Quellen vorlesen/zeigen, konkrete
Änderung und Testergebnis knapp erklären. Ein statischer Graph ist kein Beweis
für erfolgreiche Laufzeitaktionen.
