# Orb-Themes

Unter **Einstellungen → Orb → Orb-Design** am PC und im aufgeklappten
Notebook-Gespräch stehen sechs vollständige
Darstellungen bereit:

| Theme | Darstellung |
| --- | --- |
| Lilith Classic | Ursprünglicher Lichtkern mit Gyroskopringen und Filamenten; Standard |
| Voice Orb | Drei organische, bewegliche Lichtschichten |
| AI Interface | Konzentrische Skalen, Wellen und kleiner Partikelkern |
| Particle Core | Große Partikelkugel mit umkreisenden Lichtpunkten und Denk-Scan |
| HUD Core | Partikelkern mit Skalen, segmentierten Ringen, Equalizer und Radar |
| Venom | Schwarzer flüssiger Symbiont mit silbernen Reflexen, Tentakeln und dezentem Statuslicht |

Die Auswahl ersetzt den gesamten Orb und wird sofort pro Gerät gespeichert.
Ein fehlender oder unbekannter Wert verwendet Classic. Der Theme-Wechsel
verwendet die lokale Einstellungenroute ohne Gateway-Neustart, Änderung des
Gesprächs, Aufnahmeabbruch, Sprachausgabe-Stopp oder neue Generation.
**Standardfarben** setzt nur Farben und Intensität zurück, nicht das Theme.

Alle Varianten verwenden den vorhandenen Animationsloop, echte Zustände und
Audiopegel. Eigene Windows-Zustandsfarben und reduzierte Bewegung bleiben
maßgeblich. Die HTML-Demooberflächen, automatischen Zustandswechsel, eigenen
Mikrofone und erfundenen Latenz-/Systemdaten gehören nicht zur App. Fenster-
ecken bleiben transparent. Classic verwendet ausschließlich die ursprüngliche
transparente Corona, keine dunkle Unterlegung oder kompakte Vergrößerung. Eine Animation bestätigt keine erledigte Aktion.

`ui/orb.js` hält Theme-Auswahl und gemeinsame Audio-/Zustandslogik;
`ui/orb-classic.js` zeichnet das Original aus `c77247d` vom 11.10.2026.
`ui/orb-reference-themes.js` zeichnet die vier Referenzvarianten und Venom. Prüfungen: `tests/orb-themes.test.cjs`,
`tests/orb-theme-settings.test.cjs` und der echte, isolierte Chromium-Test
`tests/orb-theme-canvas.test.cjs`. Hardware- und Sprachprüfung bleiben getrennt.
