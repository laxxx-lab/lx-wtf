# Lilith Friday: Implementation Plan

> Agentic workers: use subagent-driven-development; complete each independently testable package and review it before integration.

**Goal:** Die fünf beauftragten Erweiterungen an die vorhandene Windows-App anbinden und mit echten Zustands-/Abbruchtests prüfen.
**Architecture:** Hermes bleibt Agent. Lokale Module liefern persistente seriell gestartete Aufträge, Sprachzeitmessung, geprüfte Nativeingaben, Kontextkarten und bewusstes Lernen; der Hauptprozess koordiniert Session/Datenschutz/Generationen.
**Tech Stack:** Vorhandenes Electron 40, Node, PowerShell, lokale Whisper/Qwen und vorhandene MCP/Cua; keine neue kostenpflichtige Abhängigkeit.
**Spec:** docs/superpowers/specs/2026-10-11-friday-next-stage.md

## Constraints

- Aktuellen lokalen Datenschutz-/Sensorzustand erhalten; kein Neustart eines beschäftigten Clients.
- Bestehende uncommitted Änderungen erhalten; Modulbesitz der Agenten getrennt. Ruling: vorhandenen Checkout verwenden, weil ein sauberer Worktree die bisherige unversionierte App nicht enthält.
- Keine automatische Wiederholung eines Auftrags mit unbekanntem Ergebnis.
- Agentenabschluss, erfolgreiche Eingabe und bestätigtes Gesamtergebnis bleiben getrennte Zustände.

## Package 1: Persistente Aufträge

Files: job-queue.cjs, tests/job-queue.test.cjs, main.cjs, workbench UI, docs/job-queue.md.
- [x] Fehlende Serialisierung/Persistenz/Unbekannt-Gates zunächst mit Tests belegen.
- [x] Queue mit stabiler Sessionzuordnung und atomarer Speicherung implementieren.
- [x] In submit, Gateway-Abschluss, Disconnect, Datenschutz und Neustart integrieren.
- [x] Konkrete Queue-Kontrollen und Zustände anzeigen; verlorene Bestätigung nicht blind wiederholen.
- [x] Pakettests, Regressionen und unabhängige Prüfung.

## Package 2: Sprachfluss

Files: conversation.cjs SentenceBuffer, ui/voice-interaction.js, ui/app.js, voice-timing.cjs, main.cjs, preload.cjs.
- [x] Satzpuffer, Gesprächs-/Aktionsklassifikation, Dazwischenreden und Audio-Generationen prüfen.
- [x] Inhaltsfreie Turn-Zeiten mit begrenzter Historie und p50/p95 integrieren.
- [x] Frühere Satzwiedergabe nur für geeignete Gesprächsantworten; Aktionsbestätigungen schützen.
- [x] Verspätetes PCM stoppen und Beginn neuer Sprache erhalten.
- [x] Tests und isolierte native Audioquellen; keine unbelegte Latenzzusage.

## Package 3: Interaktive Anwendung

Files: artcraft.cjs, window-input.cjs, workbench.cjs, workbench-preload.cjs, ui/artcraft-view.js/css und Tests.
- [x] Installierte GUI-Fähigkeiten zuerst lesen und mit belegtem Protokoll arbeiten.
- [x] Eingabevalidierung, Quellidentität, frische Geometrie, DPI und Auswahlwechsel mit Red-Tests prüfen.
- [x] Benutzerklicks/-tasten im Stream an genau dieses Fenster leiten.
- [x] Grenzen bei Minimierung/Modalfenstern transparent anzeigen; echte Testfenster verwenden.

## Package 4: Kontext und Hinweise

Files: awareness.cjs, project-graph.cjs, main.cjs und Werkstatt-Lagebild.
- [x] Begrenzte Hinweise aus Buildfehlern, gestoppten Aufträgen und veraltetem Graph testen.
- [x] Nur tatsächliche Quellenbelege mit Zeit anzeigen; Deduplizierung und Widerruf bei Erholung.
- [x] Geprüfte Tool-Dateipfade im Graph hervorheben, getrennt von Suchauswahl.
- [x] Ausdrücklich gewählten Projektbaum begrenzt beobachten; keine ungefragte Neuindexierung.

## Package 5: Teach Mode und Gesten

Files: teach-mode.cjs, ui/gesture-controller.js, main.cjs und Werkstatt-UI.
- [x] Bewusst gestartete Lehre, Schrittaufnahme, Bestätigung, Abbruch und sichere Ablaufspeicherung testen.
- [x] Beobachtete Stream-Aktionen als erklärbare Schritte aufnehmen; keine alten Koordinaten automatisch abspielen.
- [x] Zeigen/Pinch und Verschieben/Zoom nur in Werkstattansichten; Unsicherheit und Kontrollverlust abbrechen.
- [x] Vollständige Regressionen, Review, normaler Client mit erhaltenen lokalen Freigaben aktivieren.
