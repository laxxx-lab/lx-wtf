# Lilith: gemeinsam am Bildschirm arbeiten

Vom Nutzer am 13.10.2026 freigegeben: Zeigen und beauftragen, gemeinsame Arbeitsansicht, Projektseitenleiste mit ausgewählten Ordnern und Dateien sowie farbige Desktop-Hinweise. Reihenfolge der weiteren Entwicklung: Bildschirmarbeit, Werkstatt, persönliche Erkennung. Android ist zunächst eine Recherche und ein eigener Entwurf.

## Erster Lieferumfang

Die bestehende Hermes-Session bleibt Auftragnehmer. Explizite Textaufträge wie „Schreib aus dem hier eine Antwort“ binden die vorhandene frische Mauspunkt-/Fensterquelle. Reine Erklärfragen bleiben lesend. Quelleninhalt ist untrusted Daten; allein der ausdrücklich formulierte Nutzerauftrag bestimmt eine Handlung. Ein unbekanntes Ziel führt zu einer gezielten Rückfrage oder der vorhandenen Bereichsauswahl. Es entsteht kein neuer allgemeiner Desktop-Executor.

Eine feste Projektseitenleiste bietet Ordner hinzufügen, Projekt wechseln, benennen und aus der Liste entfernen. Entfernen löscht keine Dateien. Ein aufklappbarer Dateibaum liest nur die unmittelbar angefragte Ebene. Eine explizit ausgewählte Textdatei lässt sich begrenzt ansehen und an einen Auftrag binden. Projektwurzel und Dateiauswahl werden zum Zeitpunkt der Auftragserteilung festgehalten; ein späterer Projektwechsel ändert vorgemerkte Aufträge nicht. Die bisherigen Graphify-Quellgrenzen werden wiederverwendet. Graphify startet weiterhin nur auf ausdrückliche Indexierung.

Die gemeinsame Arbeitsansicht heißt „Zusammenarbeit“. Eine zentrale Eingabe ist in jedem Bereich erreichbar; Quelle, Fortschritt und Antwort sind in der Zusammenarbeit sichtbar. Die Projektseitenleiste bleibt beim Bereichswechsel erhalten und lässt sich auf kleinen Fenstern einklappen. Browser-Geometrie wird an die tatsächliche Leiste angepasst. Bestehende Reiter, Eingabeentwürfe, Auftragskorrektur und Besitzregeln bleiben funktionsfähig.

Desktop-Hinweise erweitern das bestehende click-through Overlay um feste Farben und die Formen Rahmen/Ellipse. Frische native Fenster- und Zielkoordinaten, DPI-Umrechnung, Ablaufzeit, Abbruch und Datenschutz bleiben verbindlich. Farben/Formen ändern keine Zielprüfung und führen keinen Klick aus.

## Projektweite Anforderungen

- Keine neuen Abhängigkeiten und keine neuen kostenpflichtigen Dienste.
- Vorhandene fremde Änderungen erhalten; kein Reset, Clean, Commit oder Push.
- Session, Stimme, Mikrofon, Sensorfreigaben und Standby erhalten.
- Projektregistrierung und absolute Ordnerpfade bleiben lokal unter `.local/`.
- Projektdateien nur nach ausdrücklicher Auswahl lesen; keine Laufwerkssuche.
- Symlinks, private Laufzeitordner, Geheimnisse und nicht unterstützte Binärdateien bleiben von der Textvorschau ausgeschlossen.
- Reale Nutzeraufträge weder durch Tests noch durch Aktivierung unterbrechen.
- Modellantworten, Testdoubles und angenommene Befehle sind kein Geräte-/Aktionsnachweis.

## Abnahme

Regressionen für Quellenabsicht und untrusted Daten, Projektwechsel/Persistenz/Pfadgrenzen und striktes IPC. Ein isolierter echter Electron-Renderer prüft Leiste, Dateibaum, Auftragsbindung, kleinen Bildschirm, Datenschutz und Browsergrenzen. Desktop-Overlay in einem eigenen nativen Testfenster prüfen. Danach `npm.cmd test` und `git diff --check`. Nutzerkamera und Handy werden nicht für diese Tests aktiviert. Dokumentation und lokaler Bedien-Skill werden aktualisiert.
