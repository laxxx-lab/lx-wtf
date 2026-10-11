# Artcraft-Werkbank: Implementierung

Spec: ../specs/2026-10-10-artcraft-workbench-design.md

1. `artcraft.cjs` + enger Windows-Prozess-/Listenerleser: fester Katalog, bekannte EXE-Identität, explizite Control-Argumente/registrierte lokale Deskriptoren, app-spezifische JSON-Lines-Requests, begrenzte Vorschauen/Metadaten und Abbruch. Zuerst Protokoll-/Identitäts-/Privacy-Tests.
2. `ui/artcraft-view.js/css`: eigener Arbeitsbereich mit realer Programmauswahl, Vorschau-/Verbindungszustand und Auftragseingabe. Keine Konfigurationsschlüssel anzeigen; keine Vorschau ohne bewusste Aktivierung. Native UI-Klicks und versteckte Ansichten prüfen.
3. `main.cjs`, `workbench.cjs`, Preloads/HTML, `control-api.cjs`, `control.ps1`: sieben Tabs; typisierte Craft-Aktionen, bestehende Session-Aufträge, Tool-Ereignisse, lokale Registrierung und Privacy-Lebenszyklus. Bestehende Hermes-MCP-Konfiguration unangetastet lassen.
4. Read-only Gegenprüfung, Gesamttests, echte PhotoCraft-Instanz und native Werkbankansicht. Skill-Vertrag nur ergänzen, gegen zwischenzeitliche Änderungen sichern/zurückprüfen; keine MCP-Neukonfiguration durch diese Arbeit. App abschließend regulär aktivieren.
