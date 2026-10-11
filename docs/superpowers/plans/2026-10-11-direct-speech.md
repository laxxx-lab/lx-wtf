# Direkte Sprachbedienung · Implementation Plan

**Goal:** Geprüfte direkte Standardbefehle, Erkennungswörterbuch und optionale
Sprechtaste vollständig in Lilith integrieren.
**Architecture:** Kleine Module liefern Parser/Windows-Belege, Wortkorrektur
und gehaltene Tastenereignisse. Main koordiniert persistente Aufträge,
Datenschutz/Session und Konfiguration. Bestehender Renderer nutzt seinen
Audio-/Auftragsweg.
**Tech Stack:** Node/Electron, PowerShell/WinRT/Win32; keine neuen Pakete.
**Spec:** docs/superpowers/specs/2026-10-11-direct-speech-design.md

- [x] Direct-Command-Parser, native Aktion/Beobachtung, Belege und Red/Green-Tests.
- [x] Wörterbuchvalidierung, Einzelkorrektur, Editor und Red/Green-Tests.
- [x] Renderer-Sprechtaste, Paare/Abbruch, gleiche Audiopipeline und Regressionen.
- [x] Hauptprozess-Tastenhook mit Wiederholung-/Injektionsschutz und Paaren.
- [x] Queue lokal/remote dauerhaft unterscheiden, Native-Abbruch/Abgleich testen.
- [x] Einstellungen und kurzfristige Korrekturansicht anbinden.
- [x] Unabhängige Prüfung, native Tests, vollständige Regressionen.
- [x] Normalen Client aktivieren und geprüfte Bedienung/Grenzen dokumentieren.

File ownership: Direct-Agent owns direct-commands.cjs / scripts/direct_commands.ps1;
Dictionary-Agent owns speech-dictionary.cjs / ui/speech-dictionary.js/css;
PTT-Agent owns ui/app.js and its tests. Root owns main.cjs, job-queue.cjs,
push-to-talk.cjs / scripts/push_to_talk.ps1, ui/index.html/style and integration.
