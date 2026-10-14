# Orb / Reactor

Der Orb besteht aus fünf räumlich kreisenden Ringen, feinen HUD-Skalen, Partikeln und einem leuchtenden Reaktorkern. Der Kern und die radialen Sprachbänder reagieren auf die echte Mikrofon- und Sprachausgabe. Mausbewegung neigt die Projektion; Anklicken erzeugt einen Impuls und öffnet wie bisher die Steuerung. Ziehen bewegt weiterhin das Fenster.

Der Mittelpunkt ist seit 14.10.2026 ein weicher Körper aus drei leuchtenden,
organisch verformten Schichten, angeregt durch Patriks „Voice Orb“-Vorlage.
Er verwendet den gemeinsamen Zustand und dieselbe Animationsuhr wie die Ringe:
ruhige Atmung im Standby, pegelabhängige Verformung beim Zuhören und Sprechen,
schnellerer Fluss beim Denken und Arbeiten. Statusfarben bleiben erhalten,
einschließlich eigener und grauer Farben. Es gibt keinen automatischen
Demo-Zustandswechsel und kein zusätzlich geöffnetes Mikrofon.

In Ansichten unter 240 CSS-Pixeln zeichnet der Renderer kräftigere Konturen,
einen klaren äußeren Rand und die ruhende Struktur etwas größer. Eine dunkle,
kreisförmig auslaufende Unterlegung innerhalb des Orbs hält ihn auf hellem oder
unruhigem Desktop sichtbar. Die Fensterecken bleiben transparent; Fenstergröße,
Position, Session und Audioeinstellungen werden nicht geändert. Reduzierte
Bewegung hält auch den neuen Körper nach dem Zustandswechsel still.

Der Notebook-Renderer misst während tatsächlicher Ausgabe die Wellenform des
vorhandenen Wiedergabe-Gains über einen zusätzlichen Analyser-Zweig ohne
Audioausgang. Der hörbare Pfad bleibt derselbe. Bei Stille entstehen keine
synthetischen Sprechpeaks; nach Stopp wird keine alte Ausgabe als Pegel verwendet.

Beim Verkleinern dockt der Orb mit12Pixel Abstand unten rechts in der Arbeitsfläche des aktuellen Monitors an. Die Taskleiste bleibt frei, auch auf weiteren Monitoren mit negativen Bildschirmkoordinaten. Die kompakte Startposition nutzt denselben Abstand.

Im Standby zieht sich die gesamte Darstellung auf 62 Prozent zusammen; die inneren Ringe und Partikel rücken zusätzlich zum Kern. Die Ringe behalten ihre ursprüngliche sichtbare Grundbewegung, und der Kern pulsiert weiterhin. Beim Wakeword öffnet sich der Orb weich wieder und bewegt sich stärker. Beim Sprechen steuert der echte Wiedergabepegel die Größe des gesamten Orbs und die Ausdehnung der Ringe, Kern und Sprachbänder. Die native Prüfung bestätigte die unterschiedlichen Größen und Bewegungen ohne Rendererfehler, auch während echter Wiedergabe einer gespeicherten lokalen Ansage.

Seit 14.10.2026 dreht sich im Standby zusätzlich die gesamte Struktur langsam;
ein heller Lichtpunkt mit kurzem Schweif wandert zwischen inneren Ringen und
äußeren Skalen. Ein weicher Kernpuls und eine kleine auslaufende Welle zeigen
Bereitschaft auch in der kompakten Größe. Standby reagiert nicht auf
Mikrofonpeaks und verändert keine Sensor- oder Ruhepräferenz.

Zuhören zeigt zwei offene seitliche Bögen mit langsam bewegten inneren Akzenten,
einem türkisfarbenen Verlauf bis zu hellen Cyan-Akzenten und einer leuchtenden
Welle zwischen zwei Fokuspunkten. Die Wellenhöhe folgt ausschließlich dem
gemessenen Mikrofonpegel; es ist eine stilisierte Pegeldarstellung, keine
exakte Audio-Wellenform. Bei Stille bleibt sie flach, die Raumbewegung der
Ringe läuft weiter. Dezente innere Linien und weniger Pegelbänder halten den
Fokus auf der Stimme.
Die Pegelbänder und der Kern folgen dem echten Mikrofonpegel; bei Stille gibt
es keine künstlichen Sprachpeaks. Sprechen ergänzt diese Darstellung mit
silbenabhängigen Bögen, ohne zusätzliche künstliche Sprachpulse. Arbeiten
zeigt umlaufende Lichtsegmente und drei räumlich wandernde Lichtpakete mit
Schweifen in benachbarten Blautönen. Sie zeigen Aktivität, keinen geschätzten
Fortschritt oder bestätigten Erfolg. Kamerablick zeigt einen Scan mit Eckmarken; Erfolg
eine einmal auslaufende Welle. Amber-Hinweise atmen sanft, Fehler verwenden
engere doppelte Warnbögen. Offline bewegt sich langsamer und bleibt gedämpft.
Der Farbverlauf der Denkphase bleibt erhalten. Eigene Farben und Stärke gelten
weiterhin für alle Zustände. Bei reduzierter Bewegung bleiben alle zehn
Darstellungen nach dem Zustandsübergang still; echte Sprachpegel werden nicht
zu künstlicher Bewegung umgewandelt.

**Orb-Animation** bietet auf beiden Clients **Systemstandard**, **Animiert ·
auch über Remote** und **Reduziert**. Systemstandard folgt der lokalen
Einstellung für reduzierte Bewegung, die Windows auch in Remote-Sitzungen
melden kann. Animiert erlaubt ausdrücklich die Orb-Bewegung unabhängig davon;
Reduziert hält sie still. Das ändert ausschließlich Liliths Darstellung und
keine Betriebssystemeinstellung. Windows übernimmt die Auswahl mit
**Einstellungen speichern**, das Notebook direkt bei Auswahl.

Sprachsilben dehnen den gesamten Orb zwischen 76 und 100 Prozent aus; die inneren Ringe öffnen sich zusätzlich zwischen 78 und 100 Prozent. Auch leise Silben verändern die Größe sichtbar. Der gemessene Wiedergabepegel wird mit kurzer Anstiegszeit und sanfter Abklingzeit geglättet, damit Sprachpeaks und Pausen erkennbar bleiben. Während der Sprachausgabe folgen Kernpuls und Sprachbänder diesem Pegel; es gibt keinen zusätzlichen zeit- oder textgesteuerten Sprachpuls. Die äußeren Skalen bleiben innerhalb der Zeichenfläche. Bei reduzierter Bewegung bleiben Größe, Ringausdehnung und Kern ruhig; die Helligkeit reagiert weiterhin auf den Wiedergabepegel.

Unter **Einstellungen → ORB / REACTOR** kannst du für Bereit, Zuhören, Sprechen, Denken, Arbeiten, Kamerablick, Erfolg, Warnung/Freigabe, Fehler und Offline eigene Farben wählen. Ein Klick auf den Zustandsnamen spielt ihn 3,5 Sekunden als visuelle Vorschau ab. Die kleinere Vorschau bleibt beim Einstellen sichtbar. Änderungen mit **Einstellungen speichern** dauerhaft übernehmen; **Standardfarben** setzt Farben und Bewegungsstärke in der Vorschau zurück.

Die Standardfarben passen zur Tätigkeit: Bereit leuchtet Cyan, Zuhören Türkis,
Sprechen helles Cyan, Denken mit warmem Kern und bewegtem Farbverlauf, Arbeiten
kräftig Blau und Kamerablick Violett. Bestätigter Erfolg ist Grün, Rückfragen und
Freigaben sind Amber, Fehler klar Rot und Offline gedämpftes Blaugrau. Die
Formsignaturen bleiben zusätzlich erhalten, damit der Zustand auch ohne
Farbunterscheidung erkennbar ist. Eigene gespeicherte Farben behalten Vorrang.

Ein aktiver Hintergrundagent hält den Orb groß: echte `subagent.thinking`-Ereignisse zeigen **DENKT IM HINTERGRUND**, Werkzeugarbeit **ARBEITET IM HINTERGRUND**. Das Gespräch bleibt ansprechbar; tatsächliches Zuhören und Sprachausgabe haben Vorrang. Ungeklärte Agenten zeigen einen Hinweis. Erst wenn keine Hintergrundarbeit mehr läuft, zieht sich der Orb zusammen; bei aktivem Standby heißt die Anzeige **STANDBY**. Die Werkstatt verwendet dieselbe Zustandszuordnung.

Rotation, Atmung und magnetische Filamente sind stärker; Denken und Arbeiten treiben zusätzlich den Kernpuls. Der Bewegungsregler reicht von 0,4 bis 2,4 und beeinflusst auch die Verformung. Vorhandene Farben und Bewegungspräferenzen bleiben erhalten; reduzierte Bewegung unterdrückt die Animation weiterhin.

Beim Denken läuft ein kräftiger Farbverlauf durch Ringe, Partikel und Filamente.
Zwei leuchtende Plasmabänder kreisen gegeneinander um den Kern. Die gewählte
Denkfarbe bleibt die Grundfarbe; der Verlauf verwendet ausschließlich nahe
Farbtöne und Helligkeitsabstufungen. Standardmäßig sind das Amber, Gold und
Kupfer mit warmen hellen Akzenten, ohne Grün-, Blau- oder Violettanteile. Auch
die Plasmabänder und der Kern bleiben in dieser Status-Farbfamilie. Der
Bewegungsregler steuert Rotation und Verformung. Der warme Denkverlauf erscheint nur im
Zustand **Denken** und verschwindet beim Wechsel zu Arbeiten, Zuhören oder
Sprechen. Bei reduzierter Bewegung bleibt die farbige Darstellung nach dem
Zustandsübergang still. Windows, Notebook und Werkstatt verwenden denselben
Canvas-Renderer. Der native isolierte Canvas-Test prüft sichtbare Farbvielfalt,
Bewegung, eigene Denkfarben, reduzierte Bewegung und den transparenten Rand
bei maximaler Stärke, ohne Mikrofon, Kamera oder laufende Session zu öffnen.

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
