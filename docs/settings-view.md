# Größere Einstellungsansicht

**Einstellungen** öffnet eine eigene Ansicht im bestehenden Clientfenster mit
bis zu 1.000 × 780 Pixeln, begrenzt durch den Arbeitsbereich des Monitors.
Es wird kein zweiter Client und kein zweites Mikrofon gestartet. Gespräch,
Aufnahme, Ausgabe, laufende Arbeit und bereits geänderte Formwerte bleiben
beim Öffnen, Bereichswechsel und Schließen erhalten.

Am PC sind **Verbindung**, **Sprache**, **Geräte**, **Orb**, **Kamera**,
**Arbeitsplatz** und **Allgemein** getrennt erreichbar. Am Notebook stehen
die dort verfügbaren Bereiche **Verbindung**, **Audio & Mikrofon**, **Orb**
und **Allgemein** bereit. Die Auswahl ersetzt die vorherige lange Liste;
nur der Inhalt des gewählten Bereichs scrollt. Kleine Fenster verwenden
eine horizontale Navigation.

**Zurück zum Gespräch** oder **Escape** stellt die vorherige Fensterposition
und Größe wieder her. Verkleinern beendet ebenfalls die Einstellungsansicht.
Öffnen und Schließen speichern keine Einstellungen und führen keinen Auftrag
aus. Theme und vorhandene direkte Gerätesteuerungen speichern sofort; übrige
Windows-Formfelder verwenden weiterhin **Einstellungen speichern** im festen
Fußbereich. Das Schließen verwirft ihre Eingabewerte nicht.

`ui/settings-view.js` verschiebt die bestehenden Formelemente einmal in ihre
Bereiche; IDs, Ereignislistener, Kamera-Zustände und Datenschutz bleiben
erhalten. `settings-window.cjs` verändert ausschließlich das bestehende
Fenster über die begrenzte IPC-Aktion `settings-view` mit einem booleschen
Wert. Es ist kein zusätzlicher Control-API-Endpunkt.

Prüfungen: `tests/settings-view.test.cjs`, `tests/settings-window.test.cjs` und
`tests/settings-view.electron.cjs`. Der native Test verwendet getrennte lokale
QA-Profile ohne Kamera, Mikrofon, Gateway und Sprachmodelle.
