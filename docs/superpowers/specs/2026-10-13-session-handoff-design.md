# Gespräch zwischen Lilith-Clients übergeben

Status: Ablauf von Patrik bestätigt am 13.10.2026; Umsetzung und reale Prüfung ausstehend.

## Gewünschter Ablauf

Patrik sagt am PC „Ich wechsel aufs Notebook“. Die App erkennt die ausdrückliche
Übergabe lokal, zeigt den Fortschritt und lässt den Auftrag nicht als freien
Modellauftrag ausführen. Das bekannte Notebook übernimmt genau die gespeicherte
Hermes-Session und das zugehörige Profil. Der dortige Orb zeigt die Übernahme;
der Gesprächsverlauf ist verfügbar, ohne alte Nachrichten erneut einzusenden.
Erst nach bestätigter Übernahme wird der PC für dieses Gespräch passiv.

„Ich wechsel zurück an den PC“ verwendet denselben Ablauf in Gegenrichtung.
Ein Auswahlknopf bietet dieselbe Aktion ohne Sprache. Gerätewahl gilt dem
Gesprächseingang; ein zuvor beauftragter PC-Vorgang bleibt ein PC-Vorgang.

## Bestehende Verträge und Grenzen

`Conversation.select` öffnet gespeicherte Sessions mit `session.resume` und
übernimmt den bestätigten Running-Zustand. Windows und Linux speichern ihre
Sessionauswahl jeweils lokal. Es gibt noch keine gemeinsame Lilith-Geräteliste
und keine bestätigte Übernahme zwischen diesen Clients. Der im lokalen
Hermes-Quellstand gelesene `handoff.request` dient konfigurierten Messenger-
Plattformen und deren Home-Channels; ein Notebook ist dort kein Desktopziel.
Eine Änderung von Sessiontitel oder Chatnachrichten dient nicht als Signalkanal.

## Entscheidungsvorschlag

Eine kleine Koordination am bestehenden VPS/Gateway ist die empfohlene Lösung.
Beide Clients melden ihre Identität, Verbindung und Bereitschaft über ihre
vorhandene authentifizierte Verbindung. Die Koordination benötigt keinen neuen
Agenten und keine Übertragung von Mikrofonaufnahmen, Stimmen oder Tokens
zwischen den Geräten.

Direkte Client-zu-Client-Übergabe über Tailscale wäre ebenfalls möglich, benötigt
aber eigene Paarung, Zustellung und Ausfallsicherung. Sie erschwert spätere
Übergaben zwischen PC und Handy, wenn das Notebook ausgeschaltet ist. Bloßes
Öffnen derselben Session in beiden Clients genügt nicht, weil dann Eingänge,
Sprachausgabe und Rückfragen weiterhin konkurrieren können.

## Identität und Übergabe

- Gerätekennung: privat gespeicherte Client-ID, bekannte Anzeigenamen und
  Zielalias. Identität wird an die authentifizierte Verbindung und das
  freigegebene Hermes-Profil gebunden; fremde Profile bleiben ausgeschlossen.
- Gespräch: gespeicherte Session-ID und Profil. Eine kurzlebige Runtime-ID
  wird nicht als dauerhafte Gesprächsidentität gespeichert.
- Übergabe: eindeutige Request-ID, Quelle, Ziel, Session, Profil und monotone
  Besitzrevision. Die Nutzlast enthält keine Cookies, Audio oder Dateien.
- Zustände: angefragt, wartet auf Leerlauf, Ziel wird vorbereitet, Ziel hat
  bestätigt, abgeschlossen; daneben abgelehnt, fehlgeschlagen und unklar.

Der PC prüft seine lokale Auftrags- und Sprachspur und sperrt neue Einsendungen
für dieses Gespräch während des kritischen Übergabeabschnitts. Das Ziel muss
online, am gleichen Gateway angemeldet, freigegeben und ohne konkurrierenden
eigenen Auftrag sein. Datenschutz wird niemals aufgehoben, um eine Übergabe zu
erzwingen. Eine beschäftigte oder gesperrte Ziel-App meldet dies konkret.

Im ersten Lieferumfang wird ein laufender Gesprächsauftrag beendet, bevor die
Übernahme festgeschrieben wird. Die Übergabe bleibt bis dahin sichtbar
vorgemerkt. Bereits lokale/queued Aufträge werden nicht auf das andere Gerät
umgebunden oder erneut eingereicht. Das System meldet erst „übernommen“, wenn
die Ziel-App ihre Session und Eingangsbereitschaft bestätigt hat und die
Koordination den Besitzer atomar gewechselt hat.

Bei verlorener Bestätigung fragt die Quelle den Zustand derselben Request-ID
ab. Sie startet weder eine zweite Übergabe noch einen neuen Gesprächszug auf
Verdacht. Reconnect und App-Neustart stellen die Besitzrevision wieder her.
Ein Timeout ist kein Beleg für Erfolg oder Ablehnung. Ein gescheiterter Versuch
vor Besitzwechsel lässt das bestätigte Quellgespräch erhalten.

## Oberfläche und Geräte

Der Orb zeigt „Übergabe aufs Notebook …“, „Notebook nicht erreichbar“ oder die
tatsächlich bestätigte Übernahme. Das Ziel bietet den übernommenen Verlauf;
neue Antworten und Rückfragen erscheinen auf dem aktiven Gesprächsgerät.
Der alte Client bleibt für andere eigene Gespräche/Projekte benutzbar.
Ein zurückgestelltes Gespräch lässt sich nicht versehentlich über dessen
Wakeword, Sprechtaste, lokale Gesprächsschicht oder automatische Queue treiben.

Mikrofonwahl, Live-/Wakeword-, Kamera-, Datenschutz-, Standby- und Stimmpräferenzen
bleiben gerätelokal. Übergabe ist kein Auftrag zum Öffnen einer Kamera, zum
Beenden von RDP oder zum Einschalten eines bislang deaktivierten Mikrofons.
Neue Geräteaktionen verwenden nach Übernahme das neue Standardziel; laufende
PC-Aktionen behalten ihren bisherigen Zielcomputer. Lokale Projektpfade werden
nicht kopiert oder automatisch in Notebook-Pfade übersetzt.

## Prüfungen und Bereitstellung

Regressionen müssen die echte Zustandsmaschine und Protokollgrenzen prüfen:
Offlineziel, Datenschutz, falsches Profil, beschäftigtes Ziel, gleichzeitige
Übergaben, verlorene Antwort, doppelte Requests, Reconnect, veraltete Revision
und verspätete Sprach-/Freigabeereignisse. Zwei isolierte echte Clients prüfen
denselben gespeicherten Gesprächsverlauf, genau einen aktiven Eingang und keine
doppelte Prompt-Einsendung. Anschließend reale PC-/Notebook-Übergabe mit
gespeicherten Audio-/Datenschutzpräferenzen prüfen.

Anpassungen betreffen eine gemeinsame Übergabelogik, lokale Intent-Erkennung,
`main.cjs`, `linux-main.cjs`, deren Renderer/Preloads und die Gateway-seitige
Koordination. Bestehende Sitzung, Agent und MCP-Registrierung bleiben erhalten.
Die laufende Umgebung muss den neuen Vertrag ausdrücklich unterstützen;
fehlende Serverfähigkeit wird sichtbar gemeldet.

Derzeit ist der VPS über Tailscale online, akzeptiert aber den vorhandenen
direkten SSH-Zugang auch als `root` nicht. Vor produktiver Serverbereitstellung
sind akzeptierter Zugang und der tatsächliche Gateway-Prozess/Quellstand nötig.
Es erfolgt kein Gateway-Neustart als Diagnoseversuch. Die Umsetzung ist erst
nach Code-/Regression-/Renderer- und realem Übergabetest als funktionierend
zu bezeichnen.
