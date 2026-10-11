# Orb / Reactor

Der Orb besteht aus fünf räumlich kreisenden Ringen, feinen HUD-Skalen, Partikeln und einem leuchtenden Reaktorkern. Der Kern und die radialen Sprachbänder reagieren auf die echte Mikrofon- und Sprachausgabe. Mausbewegung neigt die Projektion; Anklicken erzeugt einen Impuls und öffnet wie bisher die Steuerung. Ziehen bewegt weiterhin das Fenster.

Beim Verkleinern dockt der Orb mit12Pixel Abstand unten rechts in der Arbeitsfläche des aktuellen Monitors an. Die Taskleiste bleibt frei, auch auf weiteren Monitoren mit negativen Bildschirmkoordinaten. Die kompakte Startposition nutzt denselben Abstand.

Im Standby zieht sich die gesamte Darstellung auf 62 Prozent zusammen; die inneren Ringe und Partikel rücken zusätzlich zum Kern. Die Ringe behalten ihre ursprüngliche sichtbare Grundbewegung, und der Kern pulsiert weiterhin. Beim Wakeword öffnet sich der Orb weich wieder und bewegt sich stärker. Beim Sprechen steuert der echte Wiedergabepegel die Größe des gesamten Orbs und die Ausdehnung der Ringe, Kern und Sprachbänder. Die native Prüfung bestätigte die unterschiedlichen Größen und Bewegungen ohne Rendererfehler, auch während echter Wiedergabe einer gespeicherten lokalen Ansage.

Unter **Einstellungen → ORB / REACTOR** kannst du für Bereit, Zuhören, Sprechen, Denken, Arbeiten, Kamerablick, Erfolg, Warnung/Freigabe, Fehler und Offline eigene Farben wählen. Ein Klick auf den Zustandsnamen spielt ihn 3,5 Sekunden als visuelle Vorschau ab. Die kleinere Vorschau bleibt beim Einstellen sichtbar. Änderungen mit **Einstellungen speichern** dauerhaft übernehmen; **Standardfarben** setzt Farben und Bewegungsstärke in der Vorschau zurück.

Erfolg erscheint kurz nach einem erfolgreich abgeschlossenen Hermes-Auftrag. Warnungen, Freigaben und Rückfragen haben Vorrang. Während eines Kamerablicks zeigt der Orb einen Scanner, auch wenn Hermes den Blick über die lokale API anfordert. Vorschauzustände verändern keine Sprach-, Kamera- oder Agentenaktionen. Die Einstellung für reduzierte Bewegung von Windows wird berücksichtigt.

Die Animation ist lokal in Canvas implementiert und benötigt keine externen Ressourcen oder zusätzliche Bibliotheken. Zeichnungszeit im nativen Test auf diesem PC: rund 1 bis 2 Millisekunden pro Bild, ohne Zusicherung einer bestimmten Systemauslastung. Zustandszuordnung, sichere Farbspeicherung und die bestehende Sprach-/Kamerafunktion wurden geprüft; native Vorschau und Farbreset liefen ohne Rendererfehler.
