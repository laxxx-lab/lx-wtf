# Dasselbe Gespräch auf einem anderen Gerät fortsetzen

Stand 13.10.2026: Windows-/Linux-Client und Gateway-Koordination sind
bereitgestellt. Beide eigenen Clients wurden bei bestätigtem Leerlauf
aktualisiert; Einstellungen und gespeicherte Gesprächsauswahl blieben erhalten.
Die neue Route ist am bestehenden Dashboard geladen und verlangt Anmeldung.
Die reale Übergabe PC → Notebook → PC wurde über beide nativen Oberflächen
mit produktiver Anmeldung bestätigt: identische gespeicherte Session/Profil,
Besitzrevisionen 1 → 2 → 3 → 4 → 5 → 6 → 7 in drei Rundläufen, jeweils genau ein
aktiver Gesprächseingang. Die Korrekturen sind auch im zweiten Lauf aktiviert.
Bereitstellung: [Serververtrag](session-handoff-server.md).

## Bedienung nach Bereitstellung

Eine Übernahme aktiviert den Orb ohne Fokusübernahme und ohne automatisches
Vergrößern des Gesprächsfensters. Auch ein Client im lokalen Standby bleibt als
Ziel verfügbar; echter Datenschutz sperrt weiterhin. Ansage und anschließendes
Live-Gespräch bleiben erhalten. Die Größenwahl bleibt beim Nutzer.

Am PC sagen oder schreiben: **„Ich wechsel aufs Notebook“**. Alternativ
**Auf Notebook weiterarbeiten** im Gespräch wählen. Zurück geht es mit
**„Ich wechsle zurück an den PC“** oder dem entsprechenden Linux-Knopf.
**„Übergib das Gespräch an das Notebook“** ist ebenfalls ein direkter Befehl.
Auch natürliche Wünsche wie **„Lass uns mal auf dem Notebook weiterarbeiten,
bitte“**, **„Ich möchte gerne auf dem Laptop weiterarbeiten“** und
**„Wechsel bitte zum Notebook“** gehen direkt an die Gesprächsübergabe.
**„Ich will wieder auf dem Gaming PC arbeiten“** wechselt ebenfalls wirklich
zum PC. Gaming PC, Gaming-PC, GamingPC und LaxXx-Gaming bezeichnen dabei den
Windows-Client; „wieder“ und „arbeiten“ werden direkt verstanden.
Für die Gegenrichtung funktionieren dieselben Wünsche mit PC, Rechner oder
Computer. „Bitte“, Kommas und zusätzliche Leerzeichen beeinflussen das Ziel
nicht. Zitierte, verneinte und hypothetische Sätze lösen keinen Wechsel aus.
Fragen, Zitate und verneinte Formulierungen sind keine Übergabeabsicht.

Lilith wartet auf den Abschluss ihrer laufenden Arbeit auf der Quelle. Neue
Gesprächseingaben werden während der Übergabe zurückgestellt; vorhandene
Windows-Aufträge behalten ihre Reihenfolge und ihren Zielcomputer. Notebook
und PC müssen angemeldet, verbunden und freigegeben sein. Ein beschäftigtes,
gesperrtes oder nicht erreichbares Ziel meldet die tatsächliche Ursache.

Das Ziel klappt sein Gespräch auch aus dem kompakten Orb automatisch auf,
öffnet dieselbe gespeicherte Hermes-Session im selben Profil und
zeigt den verfügbaren sichtbaren Textverlauf. Es sendet alte Nachrichten nicht
erneut an das Modell. Erst nach bestätigter Auswahl, Verlauf und atomarem
Besitzwechsel gilt die Übernahme als abgeschlossen. Die Quelle spricht und
hört für dieses Gespräch anschließend nicht weiter. Andere dortige Sessions
bleiben benutzbar; ein Gespräch gehört nicht dauerhaft zu einem Computer.
Gespeicherte Windows-Auftragsmarkierungen und Voice-Anweisungen werden nur für
die sichtbare Darstellung entfernt. Die gespeicherten Nachrichten bleiben
unverändert. Im verfügbaren Ruhezustand steht „Gesprächsübergabe bereit“.

Nach bestätigter Übernahme meldet sich das Ziel einmal mit der lokal gewählten
Lilith-Stimme: **„Ich bin jetzt hier, Boss.“** Die Ansage ist lokal und schickt
keinen zusätzlichen Modellauftrag. Warten, abgelehnte/unklare Übergaben,
Wiederverbindung und gewöhnlicher App-Neustart lösen keine neue Begrüßung aus.

Nach Ende der Begrüßung öffnet das Ziel den Sprachdialog automatisch. Der PC
nutzt seinen vorhandenen Live-/VAD-Ablauf; das Notebook erkennt Sprachabschnitte
lokal und sendet nach einer Sprechpause. Während Modellarbeit und Wiedergabe
pausiert die Aufnahme, anschließend hört Lilith wieder zu. Ein bloßes
Streamende reicht nicht: Die tatsächlich geplante Wiedergabe muss beendet sein.
Stille erzeugt keine Sprachaufträge. Am Notebook steht **Gespräch offen**;
**Gespräch pausieren** beziehungsweise ein Orb-Klick schließt den Kanal.
Am PC kann Live wie bisher ausgeschaltet werden. Stopp, Datenschutz, Standby,
Sessionwechsel oder fremder Gesprächsbesitz verwerfen eine noch wartende
Öffnung; ein verspäteter Mikrofonzugriff öffnet sie nicht wieder.

Am 13.10.2026 auf beiden Clients aktiviert: Übernahme am PC mit Revision 17
zeigte ohne weiteren Klick **Live aktiv / Hört zu**. Anschließend übernahm
das Notebook dasselbe Gespräch mit Revision 18. Nach der Begrüßung zeigte
es **Gespräch offen**; private Statusprüfung bestätigte `live:true`,
`microphoneOpen:true` und einen echten Lilith-Aufnahmestream. Im Leerlauf
blieb `localBusy:false`, während der passive PC sein Mikrofon geschlossen
hatte. Es wurden keine Mikrofonaufnahmen für diese Diagnose gespeichert.
994 Node-Tests bestanden, fünf optionale Prüfungen wurden übersprungen;
zusätzlich bestand die isolierte native Rendererprüfung. Erkennung zweier
echter gesprochener Folgesätze ist ein gesonderter Benutzertest.
Datenschutz, Standby und aktueller Gesprächsbesitz werden vor der Ansage
geprüft. Ohne funktionierende Ausgabe bleiben Übernahme und Textanzeige
erhalten; eine fehlgeschlagene Ansage wird nicht automatisch wiederholt.
Ist eine Übernahmebestätigung zunächst verloren gegangen, wird die noch nicht
ausgelöste Ansage erst nach Abgleich desselben bestätigten Belegs gestartet.
Der Beleg wird vorher dauerhaft abgeschlossen; ein gewöhnlicher Neustart
spielt bereits abgeschlossene Begrüßungen nicht wieder ab.

Die Begrüßung wurde in beiden echten Richtungen mit dem gespeicherten Gespräch
geprüft. Am Notebook bestätigten dessen Output-Monitor und Lilith-Audiostream
ein Signal, am PC der Windows-Ausgabepegel; kein Mikrofon wurde aufgenommen.
Patrik bestätigte die Notebook-Begrüßung als einmalig und verständlich hörbar.
Die PC-Ausgabe ist technisch gemessen, nicht separat menschlich bestätigt.

## Gesprächsort und zurückholen

Ist dieses Gespräch auf dem anderen Gerät aktiv, zeigt der kompakte Orb
**Away** und dessen echten Gerätenamen. Fehlt dessen Verbindungsmeldung,
bleibt der Name mit **offline** sichtbar. **Hierher zurückholen** am Orb oder
im geöffneten Gespräch fordert dieselbe gespeicherte Session zurück an.
Als Texteingabe funktioniert auch **„Hol Lilith hierher zurück“**; auf einem
passiven Gerät ist die lokale Sprachaufnahme bewusst pausiert, deshalb dort
den Knopf verwenden.

Eine erreichbare Quelle wartet auf laufende Arbeit und bestätigt dann die
normale Rückgabe. Fällt sie aus, ist Rückholung erst nach Ablauf ihrer
acht Sekunden langen Verbindungsmeldung möglich. Der Zielclient prüft auch
den tatsächlich noch laufenden Hermes-Auftrag und wartet auf dessen Ende.
Aufträge werden weder neu gesendet noch unterbrochen. Kehrt die Quelle vor
der Offline-Bestätigung zurück, scheitert diese Rückholung sichtbar; erneut
zurückholen verwendet dann den normalen Übergabeablauf. Nach erfolgreicher
Rückholung bleibt das später zurückkehrende alte Gerät passiv.

Rückholung benötigt Anmeldung und dieselbe freigegebene Session im selben
Profil. Datenschutz, geänderte Auswahl oder unklare Bestätigung verhindern
einen stillen Besitzwechsel. Die einmalige Begrüßung gilt auch für Rückholung.

Am 13.10.2026 in beiden nativen Clients bereitgestellt und geprüft:
PC → Notebook mit Revision 10, Rückholen am kompakten PC-Orb mit Revision 11,
Rückholen am Notebook mit Revision 12. Danach wurde ausschließlich der
bestätigt freie Notebook-Client beendet. Der PC zeigte nach Lease-Ablauf
**Auf lx-gaming-nb · offline** und holte dieselbe Session samt Verlauf mit
Revision 13 zurück. Der Serverbeleg bestätigt `offlineRecovery:true`.
Nach Neustart zeigte der Notebook-Orb **Auf LaxXx-Gaming**, blieb passiv und
bot Rückholen an. Dies simuliert den Clientausfall; der Notebook-Akku wurde
nicht tatsächlich entladen. Beide Clients blieben angemeldet, Einstellungen
und Gesprächsauswahl erhalten. Kein Modellprompt wurde für die Übergaben
oder Begrüßungen gesendet.

Ein abschließender PC-Neustart und weiterer nativer Rundlauf mit Revisionen
14/15 bestätigten die erhaltene Besitzzuordnung und die vollständige
Gerätename-Zeile im erweiterten Orb. Abschließend ist dieses Gespräch wieder
am PC aktiv, das Notebook passiv. Regressionen: 974 Node-Tests bestanden,
5 optionale Tests übersprungen, 45 Python-Tests bestanden; echte HTTP-/SQLite-
Rückholung und isolierter nativer Renderer zusätzlich geprüft.

## Einstellungen und Fehler

Mikrofonwahl, Stimme, Kamera, Datenschutz, Standby und Wakeword-Präferenzen
bleiben lokal erhalten. Die Übergabe hebt keine Sperre auf, schaltet keine
Kamera ein und verändert keine gespeicherte Wakeword-Präferenz. Ein passiver
Client stoppt lediglich seine eigene Aufnahme/Wiedergabe; sein **Stopp**
unterbricht keinen laufenden Gesprächszug auf dem anderen Gerät.

Geht eine Bestätigung verloren, bleibt der Eingang gesperrt, bis dieselbe
Request-ID abgefragt ist. Ein Timeout erzeugt weder einen zweiten Auftrag
noch eine erfolgreiche Übernahmebehauptung. Eine bestätigte Ablehnung vor
Besitzwechsel lässt das Quellgespräch bestehen. Der Server speichert Besitz
und Revision; ein Neustart setzt sie nicht zurück. Ein bereits übergebenes
Gespräch lässt sich auf der Quelle nicht durch ein verspätetes Wakeword
erneut antreiben.

Ohne `POST /api/lilith/handoff` bleibt der Knopf deaktiviert und die App meldet
**Gesprächsübergabe am Gateway noch nicht verfügbar**. Die normalen bisherigen
Gespräche bleiben nutzbar. Es gibt keinen Ersatz über Shell-Prompts oder eine
zweite kopierte Agentensession.

## Nachweisgrenzen

Regressionen prüfen SQLite-Besitzwechsel, Auth-/Profilgrenzen, verlorene
Antworten, verspätete Rückfragen, private Zustandsdateien, große Besitzlisten
und beide echten HTTP-Richtungen mit zwei Client-Controllern. Die HTTP-Prüfung
verwendet eine ausdrücklich synthetische verifizierte Testidentität und
Test-Sessions, keine produktiven Cookies oder echten Modellgespräche.
Electron-Prüfungen belegen Renderer und native Cookie-Fetch-Header.
Die reale Übergabe per Gesprächsknopf wurde auf beiden Geräten mit Anmeldung,
gleicher Session/Profil, Verlauf und Eingangswechsel bestätigt. Der PC schließt
bei Übergabe seinen Mikrofoneingang und nimmt nach Rückgabe seinen vorherigen
Live-Zustand wieder auf. Eine ausdrücklich gesprochene Übergabeformulierung
ist damit noch nicht separat bestätigt. Die Notebook-Begrüßung hat Patrik
als einmalig und verständlich hörbar bestätigt.
