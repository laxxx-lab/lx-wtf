# Datenschutz und lokaler Not-Aus

`Ctrl+Alt+P` schaltet den Datenschutzmodus lokal um. `Ctrl+Alt+Escape` löst den
Not-Aus aus und lässt den Datenschutzmodus eingeschaltet. Entsperren erfolgt
bewusst lokal in Lilith. Danach bleiben die Sensoren ausgeschaltet, bis sie
wieder ausdrücklich aktiviert werden.

Datenschutz sperrt neue Sensoraktionen sofort, stoppt Mikrofon und Wakewords,
Kamera, Bildschirmaufnahmen, Gestenerkennung und die Kontextbeobachtung. Die
Sprachausgabe wird beendet. Bereits angefragte Kamera- und Mikrofonfreigaben
werden verworfen: Trifft eine Freigabe später ein, werden ihre Tracks sofort
gestoppt. Ausstehende Aufnahmeergebnisse und ältere Einstellungen dürfen die
Sensoren nicht wieder einschalten. Lokale Vorschaubilder und die letzten
Bildbeschreibungen werden geleert. Bereits gespeicherte Chatverläufe,
Gesichtsprofile und die Ereignishistorie werden dadurch nicht gelöscht.

Der Not-Aus sendet bei bestehender Verbindung zusätzlich eine begrenzte
Unterbrechungsanfrage an Hermes. `privacy.remoteStop` unterscheidet
`requested`, `unavailable` und `failed`. `requested` bedeutet, dass die Anfrage
übermittelt wurde; es bestätigt weder das Ende eines externen Prozesses noch
das Rückgängigmachen bereits ausgeführter PC-Aktionen.

Ein erneuter Not-Aus versucht die Unterbrechung erneut, auch wenn Datenschutz
bereits aktiv war oder aus dem vorherigen App-Start übernommen wurde. Während
eines noch laufenden Stoppversuchs werden weitere Aufrufe zusammengefasst.
Die Sensoren bleiben dabei gesperrt.

Die lokale Sperre funktioniert ohne VPS. Sie ersetzt keinen zentralen
Berechtigungsmanager für alle Windows-MCP-Werkzeuge und beendet keine anderen
Programme auf dem PC.

## API

Die vorhandene lokale Bearer-Authentifizierung gilt weiterhin. Hermes darf
über die API sperren und stoppen, aber nicht entsperren:

```text
POST /v1/privacy       {"enabled":true}
POST /v1/emergency-stop {}
GET  /v1/status
```

`POST /v1/privacy` mit `enabled:false` wird mit HTTP 403 abgewiesen. Unter
aktivem Datenschutz werden neue geschützte Aktionen mit HTTP 423 abgewiesen.
Der PowerShell-Helfer liest das Token lokal; es soll nicht zum VPS kopiert
werden:

```powershell
.\control.ps1 -Action privacy -State on
.\control.ps1 -Action emergency-stop
.\control.ps1 -Action status
```

## Wakewords ohne Verbindung

Bei ausgeschaltetem Datenschutz und ausdrücklich aktivierten Wakewords bleibt
die lokale Bereitschaftserkennung auch ohne ausgewählte Hermes-Session oder
VPS-Verbindung aktiv. Ein erkanntes Wakeword meldet die fehlende Verbindung
lokal. Es startet keinen Live-Auftrag und übermittelt keinen Auftrag an eine
alte Session. Ist die Verbindung bereits da, aber keine Session gewählt,
erklärt Lilith auch diesen Zustand lokal. Live-Gespräche brauchen weiterhin eine aktive Verbindung und
eine ausgewählte Session.

Das bedeutet keine allgemeine Offline-KI: Wakeword-Erkennung und lokale
Kontrollen funktionieren lokal; Hermes-Aufträge brauchen den VPS. Nach
Datenschutz oder Not-Aus wird auch die Offline-Bereitschaft erst durch
bewusstes Aktivieren der Wakewords wieder eingeschaltet.

## Prüfung

Die Regressionstests prüfen die sofortige Sperre, Fehler beim Abschalten,
zusammengefasste parallele Sperraufrufe, explizites Entsperren ohne
Sensorwiederherstellung, verspätete Medienfreigaben, ausstehende Audiopakete,
alte Bildresultate und die Wakeword-Bereitschaft ohne VPS. Die tatsächliche
Wakeword-Erkennung im eigenen Raum bleibt ein Mikrofontest.

```powershell
node --test tests/local-safety.test.cjs tests/renderer-control.test.cjs
```
