# Spotify-Wiedergabe und fehlende Voice-Antworten

Am 10.10.2026 wurden die tatsächlich gespeicherten Werkzeugaufrufe und die
nativen Spotify-Funktionen auf dem VPS geprüft. Zugangsdaten wurden nicht
ausgegeben oder übertragen.

Die Suche liefert Treffer. Eine auf Titel und Künstler begrenzte Query wie
`track:Bohemian Rhapsody artist:Queen` liefert passendere Ergebnisse als die
ungefilterte Wortfolge. Die native Suche unterstützt `types: ["track"]` und
ein kleines `limit`.

Der fehlerhafte Start wurde direkt reproduziert: Das PC-Gerät war erreichbar,
Transfer und Einzeltrack-Play antworteten mit204, danach meldete der Zustand
weiter `is_playing=false`. Der gleiche Track als Albumkontext mit URI-Offset
startete auf dem richtigen PC; Fortschritt725→1551ms belegte laufende Wiedergabe.

## Native Korrektur

In `/home/claw/.hermes/hermes-agent/plugins/spotify/tools.py` wurde nur der
Einzeltrack-Start ergänzt. Er versucht zunächst den bisherigen URI-Befehl und
prüft begrenzt tatsächliche Wiedergabe, Track-URI und angefordertes Gerät.
Bleibt der Effekt aus, ermittelt er das Album und verwendet Kontext plus
Track-Offset. Erneute Nachprüfung entscheidet über `playback_verified`.
Angenommen, aber weiterhin unverifiziert heißt `success=false`; ein anderer
Titel oder ein anderes Gerät wird nicht als Erfolg ausgegeben. Funktionierende
URI-Starts, explizite Kontexte und Mehrtrack-Listen behalten ihre Payloads.

Fehlende oder unerwartet geformte Statusdaten bleiben unverifiziert. Ein
Positionsabgleich berücksichtigt die seit dem Start verstrichene Zeit.
Auch fehlende Metadaten eines nicht ausdrücklich ausgewählten Geräts führen
nicht zu einem Absturz oder einem erfundenen Gerätenamen. Acht isolierte
Regressionstests prüfen diese Fälle; die ursprüngliche
Implementierung scheiterte zuerst an vier davon, die zwei Review-Fälle wurden
ebenfalls vor ihrer Korrektur reproduziert.

Der VPS-Code wurde vor dem Schreiben auf unveränderten Inhalt geprüft,
gesichert und vollständig zurückgelesen. Die Patchdatei daneben dokumentiert
die Änderung. Ein Hermes-Update kann die lokale Anpassung ersetzen; dann
gegen die neue Version prüfen und nicht blind überschreiben.

Das Spotify-Plugin wurde ohne Gateway-Neustart neu geladen. Die Rückgabe
bestätigt die Aktivierung der Python-Werkzeuge ab der nächsten Session.
Der direkte Test gegen die gepatchten nativen Funktionen startete den
richtigen Titel auf `LAXXX-GAMING`; Fortschritt1237→2046ms bestätigte Wiedergabe.
Das ist ein echter API-Test, kein zusätzlicher generierter Hermes-Chat-Auftrag.

## Voice-Rückmeldung

Die Voice-App meldet nun einen fehlgeschlagenen Auftrag einmal kurz gesprochen
und beendet den Turn auch beim eigenständigen Gateway-Fehlerereignis.
Eine leere, unmarkierte Abschlussantwort meldet „Ich habe keine Abschlussantwort
erhalten.“ statt Erfolg. Doppelte Fehlerereignisse stoppen diese Rückmeldung
nicht erneut. Ausdrückliche Unterbrechungen und Text-Aufträge bleiben still;
bereits vorgelesene oder wiederverwendete Abschlussantworten bleiben gültig.

Eine zuvor protokollierte abgebrochene Erklärung trug tatsächlich
`interrupted=true`; das wird nicht als erfolgreicher Abschluss umgedeutet.
Während der Aktivierung lief außerdem die Gateway-Cookie-Anmeldung ab
(`session_expired`). Die Anmeldung wird vom Nutzer erneuert, nicht umgangen.

## Prüfung über Lilith selbst und frische Session

Der spätere Nutzerfehler wurde anhand der tatsächlich gespeicherten Aufrufe
bestätigt: Die alte Session erhielt weiterhin die ursprüngliche Play-Rückgabe
ohne `playback_verified`. Ihr Kontext enthielt rund 172.338 Tokens, davon
147.103 im Gespräch und etwa 360 Nachrichten. Eine neue Session alleine
ersetzt aber keinen veralteten Python-Import im Gateway-Prozess.

Der Plugin-Loader lädt den Namensraum `hermes_plugins.spotify` und verwirft
bei einem Neuladen dessen Untermodule. Spotify importierte `tools` jedoch
absolut aus `plugins.spotify`; dieser alte Modulcache blieb erhalten.
`plugins/spotify/__init__.py` importiert jetzt relativ mit `from . import tools`.
Ein Regressionstest reproduzierte den alten Handler und prüft den neuen.
Beide Dateien wurden gesichert, auf konkurrierende Änderungen geprüft und
zurückgelesen. Das offizielle Plugin-Toggle deaktivierte und aktivierte
Spotify wieder; die Aktivierungsantwort meldete einen erfolgreichen Reload.
Ein Gateway-Neustart war nicht erforderlich.

Eine separate frische Hermes-Testsession erhielt einen normalen Sprachauftrag:
Spotify auf dem PC öffnen, Thunderstruck von AC/DC suchen und spielen.
Lilith führte den Store-App-Start selbst über Cua aus. Ihr Play-Aufruf lieferte
`playback_verified=true`, `strategy=album_offset`, den korrekten Track und
`LAXXX-GAMING`. Der anschließende Status zeigte Fortschritt195→3322ms;
zwei unabhängige native Abfragen bestätigten49877→51589ms. Die abschließende
Antwort war kurz und deutsch. Dieser erste Agententest dauerte etwa32,7s;
er enthielt noch zusätzliche Aufrufe mit unnötigen oder falschen Parametern.

Der Spotify-Skill nennt deshalb nun den konkreten Ablauf und gültige Aktionen:
Suchfilter/kleines Limit, aktuelle PC-ID, Transfer mit `play=false`, Play,
`get_state` und Wirkungskontrolle. Der Voice-Prompt verweist auf diesen Skill
und enthält die wichtigsten Parameter; Standardantwortsprache ist Deutsch.
Keine Diagnose über verlorene Gerätenamen oder Schreibrechte ohne Beleg.
Eine separate Alltagssession wird mit null Nachrichten aktiviert; Testverläufe
und bisherige Nutzersession bleiben erhalten.

Der anschließende tatsächliche Titelwechsel über Lilith war ebenfalls erfolgreich:
Bohemian Rhapsody von Queen wurde mit `playback_verified=true` auf dem PC
gestartet; Statusfortschritt398→2077ms. Mit dem aktualisierten Skill und
Voice-Prompt brauchte dieser Agentenauftrag etwa8,9s und verwendete direkt
`get_state`. Das ist ein getesteter Titelwechsel bei bereits geöffnetem Spotify,
keine Zusage für jeden zukünftigen Start. Pause-/Status-/Erklärungsfragen dürfen
den Titelstart-Ablauf ausdrücklich nicht auslösen; „Musik an“ ohne Titelwunsch
setzt die vorhandene Wiedergabe fort.

Aktiviert wurde `Lilith · PC und Voice · Frisch`, gespeicherte ID
`20261010_024019_2f0e3c`, mit null Nachrichten. Verbindung, ausgewählte Session
und erhaltene Kamera-/Bildschirmeinstellungen wurden nach dem Neustart geprüft.

Auch der erneute Aufruf `launch.ps1 -Login` wurde korrigiert: Eine laufende
Instanz ignorierte zuvor das Argument. Sie öffnet nun das Anmeldefenster.
Eine aktive WebSocket-Verbindung kann noch funktionieren, während neue
HTTP-Anfragen bereits eine erneute Anmeldung verlangen.
