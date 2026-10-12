# Orb / Reactor

Der Orb besteht aus fünf räumlich kreisenden Ringen, feinen HUD-Skalen, Partikeln und einem leuchtenden Reaktorkern. Der Kern und die radialen Sprachbänder reagieren auf die echte Mikrofon- und Sprachausgabe. Mausbewegung neigt die Projektion; Anklicken erzeugt einen Impuls und öffnet wie bisher die Steuerung. Ziehen bewegt weiterhin das Fenster.

Beim Verkleinern dockt der Orb mit12Pixel Abstand unten rechts in der Arbeitsfläche des aktuellen Monitors an. Die Taskleiste bleibt frei, auch auf weiteren Monitoren mit negativen Bildschirmkoordinaten. Die kompakte Startposition nutzt denselben Abstand.

Im Standby zieht sich die gesamte Darstellung auf 62 Prozent zusammen; die inneren Ringe und Partikel rücken zusätzlich zum Kern. Die Ringe behalten ihre ursprüngliche sichtbare Grundbewegung, und der Kern pulsiert weiterhin. Beim Wakeword öffnet sich der Orb weich wieder und bewegt sich stärker. Beim Sprechen steuert der echte Wiedergabepegel die Größe des gesamten Orbs und die Ausdehnung der Ringe, Kern und Sprachbänder. Die native Prüfung bestätigte die unterschiedlichen Größen und Bewegungen ohne Rendererfehler, auch während echter Wiedergabe einer gespeicherten lokalen Ansage.

Sprachsilben dehnen den gesamten Orb zwischen 76 und 100 Prozent aus; die inneren Ringe öffnen sich zusätzlich zwischen 78 und 100 Prozent. Auch leise Silben verändern die Größe sichtbar. Der gemessene Wiedergabepegel wird mit kurzer Anstiegszeit und sanfter Abklingzeit geglättet, damit Sprachpeaks und Pausen erkennbar bleiben. Während der Sprachausgabe folgen Kernpuls und Sprachbänder diesem Pegel; es gibt keinen zusätzlichen zeit- oder textgesteuerten Sprachpuls. Die äußeren Skalen bleiben innerhalb der Zeichenfläche. Bei reduzierter Bewegung bleiben Größe, Ringausdehnung und Kern ruhig; die Helligkeit reagiert weiterhin auf den Wiedergabepegel.

Unter **Einstellungen → ORB / REACTOR** kannst du für Bereit, Zuhören, Sprechen, Denken, Arbeiten, Kamerablick, Erfolg, Warnung/Freigabe, Fehler und Offline eigene Farben wählen. Ein Klick auf den Zustandsnamen spielt ihn 3,5 Sekunden als visuelle Vorschau ab. Die kleinere Vorschau bleibt beim Einstellen sichtbar. Änderungen mit **Einstellungen speichern** dauerhaft übernehmen; **Standardfarben** setzt Farben und Bewegungsstärke in der Vorschau zurück.

Ein aktiver Hintergrundagent hält den Orb groß: echte `subagent.thinking`-Ereignisse zeigen **DENKT IM HINTERGRUND**, Werkzeugarbeit **ARBEITET IM HINTERGRUND**. Das Gespräch bleibt ansprechbar; tatsächliches Zuhören und Sprachausgabe haben Vorrang. Ungeklärte Agenten zeigen einen Hinweis. Erst wenn keine Hintergrundarbeit mehr läuft, zieht sich der Orb zusammen; bei aktivem Standby heißt die Anzeige **STANDBY**. Die Werkstatt verwendet dieselbe Zustandszuordnung.

Rotation, Atmung und magnetische Filamente sind stärker; Denken und Arbeiten treiben zusätzlich den Kernpuls. Der Bewegungsregler reicht von 0,4 bis 2,4 und beeinflusst auch die Verformung. Vorhandene Farben und Bewegungspräferenzen bleiben erhalten; reduzierte Bewegung unterdrückt die Animation weiterhin.

Erfolg erscheint nur kurz nach einem unabhängig bestätigten erfolgreichen Hermes-Auftrag. Warnungen, Freigaben und Rückfragen haben Vorrang. Während eines Kamerablicks zeigt der Orb einen Scanner, auch wenn Hermes den Blick über die lokale API anfordert. Vorschauzustände verändern keine Sprach-, Kamera- oder Agentenaktionen. Die Einstellung für reduzierte Bewegung von Windows wird berücksichtigt.

Die Animation ist lokal in Canvas implementiert und benötigt keine externen Ressourcen oder zusätzliche Bibliotheken. Zeichnungszeit im nativen Test auf diesem PC: rund 1 bis 2 Millisekunden pro Bild, ohne Zusicherung einer bestimmten Systemauslastung. Zustandszuordnung, sichere Farbspeicherung und die bestehende Sprach-/Kamerafunktion wurden geprüft; native Vorschau und Farbreset liefen ohne Rendererfehler.

## Kleine Countdowns

Ein kompakter Countdown im unteren Teil des Orbs zeigt den nächsten tatsächlich
geplanten Timer, Wecker, Erinnerung oder eigenen Power-Auftrag. Er enthält
Restzeit, Art und eine Fortschrittslinie, aktualisiert sich sekündlich und bleibt
auch im Standby sichtbar. Bei mehreren Terminen erscheint der früheste.
Abbruch/Erledigung entfernt ihn; Datenschutz blendet ihn aus. Nach einem App-
Neustart bleiben geplante Erinnerungen sichtbar, frühere Power-Timer laufen
weiterhin nicht automatisch an. Für Analysen ohne bekannte Fälligkeit gibt es
keine erfundene Restzeit. Der Countdown schaltet keine Sensoren ein.
