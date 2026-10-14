# Orb / Reactor

Unter **Einstellungen → Orb → Orb-Design** wird der gesamte Orb gewechselt.
Die sechs Varianten und ihre Quellen stehen in [Orb-Themes](orb-themes.md).

**Lilith Classic** zeichnet wieder den ersten Orb aus Commit `c77247d` vom
11.10.2026: fünf Gyroskopringe, feine Skalen, Partikel, magnetische Filamente,
kleiner Lichtkern und transparente Corona. Die später hinzugefügten organischen
Körper, Plasmabänder, Standby-Beacons, dunkle Unterlegung und Vergrößerung in der
kompakten Ansicht gehören nicht zu Classic. Die ursprünglichen
Rotationsgeschwindigkeiten und die ursprüngliche aktive Größe sind erhalten.
Die Korrekturen für echte Sprachpegel und aktuelle Auftragszustände bleiben aktiv.

Alle Themes verwenden denselben Animationsloop und tatsächlichen Zustand.
Aufnahme zeigt Zuhören; Transkription und Auftragsvorbereitung zeigen Denken;
beobachtete Werkzeuge zeigen Arbeiten. Hintergrundarbeit hält den Orb aktiv.
Echte lokale Ausgabe und Zuhören haben Vorrang vor normalen Bereitschaftszuständen.
Warnungen und Fehler bleiben sichtbar. Eine Animation bestätigt keine Aktion.

Eigene Zustandsfarben bleiben gespeichert: standardmäßig Cyan für Bereit,
Türkis für Zuhören, helles Cyan für Sprechen, Amber für Denken, Blau für Arbeiten,
Violett für Kamerablick, Grün für Erfolg, Amber für Rückfragen, Rot für Fehler
und Blaugrau für Offline. In den Einstellungen lassen sich Zustände kurz
vorschauen; eine Vorschau führt keine Geräteaktion aus.

Standby zieht Classic auf 62 Prozent zusammen; die inneren Ringe rücken näher
zum Kern. Mausbewegung neigt die Projektion. Anklicken erzeugt einen Impuls
und öffnet die Steuerung; Ziehen bewegt das Fenster. Kompakt dockt der Orb
mit 12 Pixeln Abstand in der Arbeitsfläche des aktuellen Monitors an.

Die gemeinsame Sprachhülle folgt ausschließlich dem gemessenen Mikrofon- oder
Wiedergabepegel, mit kurzem Anstieg und sanftem Abklingen. Sprachsilben öffnen
den gesamten Orb von 76 bis 100 Prozent und die Ringe von 78 bis 100 Prozent.
Bei stiller Ausgabe entstehen keine künstlichen Sprechpeaks. Der Notebook-
Analyser hängt am bestehenden Wiedergabepfad, ohne zusätzlichen Audioausgang.

**Orb-Animation** bietet **Systemstandard**, **Animiert · auch über Remote**
und **Reduziert**. Der Bewegungsregler reicht von 0,4 bis 2,4. Reduzierte
Bewegung hält die Geometrie nach dem Zustandswechsel still. Dies ändert keine
Betriebssystemeinstellung und schaltet keine Kamera oder Aufnahme ein.

Prüfungen: `tests/orb-classic.test.cjs` vergleicht die ursprünglichen
Zeichenbefehle aller zehn Zustände; `tests/orb-theme-canvas.test.cjs` und
`tests/orb-thinking.test.cjs` prüfen echte Chromium-Pixel, Sprachpegel,
Transparenz und reduzierte Bewegung. Hardwareausgabe wird separat geprüft.

## Kleine Countdowns

Ein kompakter Countdown im unteren Teil des Orbs zeigt den nächsten tatsächlich
geplanten Timer, Wecker, Erinnerung oder eigenen Power-Auftrag. Er enthält
Restzeit, Art und eine Fortschrittslinie, aktualisiert sich sekündlich und bleibt
auch im Standby sichtbar. Bei mehreren Terminen erscheint der früheste.
Abbruch/Erledigung entfernt ihn; Datenschutz blendet ihn aus. Nach einem App-
Neustart bleiben geplante Erinnerungen sichtbar, frühere Power-Timer laufen
weiterhin nicht automatisch an. Für Analysen ohne bekannte Fälligkeit gibt es
keine erfundene Restzeit. Der Countdown schaltet keine Sensoren ein.

## Antwortformulierung und ruhige Übergabe · 13.10.2026

Der Orb zeigt Denken beim Formulieren einer Antwort, auch bei Rechentiefe none. Tatsächliche Werkzeugaktionen zeigen Arbeiten. Ein noch laufendes zweites Werkzeug hält die Arbeitsdarstellung aufrecht. Aufnahme, tatsächliche Sprachausgabe und Datenschutz behalten Vorrang. Der Weg von Transkription zu Einsendung bleibt durchgehend erkennbar; ein verspätetes ready darf die aktuelle Einsendung nicht überblenden.

Angenommene freie Aufträge zeigen die Denkdarstellung bereits beim Abschließen
der Aufnahme, Prüfen lokaler Befehle und Vorbereiten der Hermes-Anfrage
(Detail: „Verarbeite deinen Auftrag“). Sie warten dafür nicht auf die
Netzwerkbestätigung. Auch ein Wakeword-Auftrag ohne erneute Transkription hält
die Darstellung während seiner aktuellen Befehlsprüfung. Abgebrochene oder
zu einer anderen Session gehörende Einsendungen überblenden „Bereit“ nicht.
Ein weiterer wartender Auftrag überschreibt keine laufende Werkzeuganzeige.

Bei Übergaben erhalten beide Clients ihre aktuelle Fenstergröße und zeigen den Orb ohne Fokusübernahme. Der Nutzer öffnet die Gesprächsansicht bei Bedarf selbst. Ruhezeit: [Standby](idle-standby.md).
