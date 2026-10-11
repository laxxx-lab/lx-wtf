# OSIRIS-Lagekarte

Die Werkstattansicht **Lagekarte** liest öffentliche JSON-Quellen von
[OSIRIS](https://osirisai.live/docs). Daten werden auf Anfrage geladen und als
Liste, Quellendetails und Koordinaten auf einem lokalen Globus angezeigt. Es gibt
keine automatische Kamerawiedergabe. Quellen öffnen erst nach einem Klick im
separaten Werkstatt-Browser.

Die Integration verwendet feste HTTPS-GET-Adressen ohne API-Schlüssel,
Anmeldedaten oder Cookies. Sie führt keine RECON-Aufträge, Scans, Schreiboperationen
oder kostenpflichtigen OI-Modellaufrufe aus. `oi/trending` ist nur der öffentliche
GET-Feed für Prognosemärkte; seine Einträge sind keine bestätigten Vorhersagen.
Der öffentliche Dienst kann Ausfälle oder seine eigene begrenzte Abdeckung haben.

## Ansichten und weitere Feeds

Der Katalog enthält **29 feste OSIRIS-Feeds insgesamt**. Acht davon besitzen eine
eigene Aufbereitung:

| `kind` | OSIRIS-GET-Pfad | Inhalt und Grenze |
| --- | --- | --- |
| `earthquakes` | `/api/earthquakes` | USGS-Meldungen, nach Magnitude sortiert und auf einen Berliner Kalendertag gefiltert |
| `cameras` | `/api/cctv` | Gefilterte öffentliche Betreiber-Webcams; keine private Kamera-Erfassung |
| `ukraine` | `/api/frontlines` und `/api/news` | DeepState-Kartenstand und passende Nachrichten; keine unabhängige Lagebestätigung |
| `news` | `/api/news` | Nachrichten mit Quellenangaben; Länderanker werden nicht als genaue Ereignisorte gezeichnet |
| `weather` | `/api/weather` | Naturereignisse und Warnungen, keine allgemeine lokale Wettervorhersage |
| `flights` | `/api/flights` | Gelieferte Flugpositionen mit unvollständiger ADS-B-Abdeckung |
| `ships` | `/api/maritime` | Schiffe, Häfen und Engstellen; Referenzorte sind keine aktuellen Schiffspositionen |
| `stats` | `/api/stats` | Numerische globale Zähler der Quelle |

Die übrigen **21 Feeds** werden mit `kind:"feed"` und einer festen `feed`-ID
allgemein aufbereitet: `health`, `satellites`, `space-weather`, `fires`,
`air-quality`, `radar`, `sentinel`, `conflicts`, `gdelt`, `country-risk`,
`region-dossier`, `live-news`, `markets`, `crypto`, `scm-suppliers`,
`infrastructure`, `arcgis`, `cyber-threats`, `cyber-attacks`, `malware` und
`oi/trending`. Ihr GET-Pfad lautet jeweils `/api/<feed-ID>`. Listenzeilen oder
einfache Werte werden begrenzt dargestellt; ohne passende Felder können Ort,
Quellenzeit oder Bedeutung unbekannt bleiben. Diese Ansicht ersetzt keine
fachliche Analyse der Originaldaten.

`intel-catalog` liefert IDs, Pfade, Quellenlinks und den Hinweis auf eine
Fokusansicht. Aufgelistete Anbieterparameter für etwa Sentinel, ArcGIS oder
Regionsdossiers sind keine implementierte Parameterweitergabe: die allgemeine
Feed-Abfrage ruft derzeit nur den festen Pfad ohne diese Parameter ab. Räumliche
Parameter werden ausschließlich für die öffentliche Kameraabfrage verwendet.

```powershell
.\control.ps1 -Action workbench -State on -Tab intel
.\control.ps1 -Action intel-catalog
.\control.ps1 -Action intel -Kind earthquakes
.\control.ps1 -Action intel -Kind ukraine
.\control.ps1 -Action intel -Kind news -Query Ukraine
.\control.ps1 -Action intel -Kind feed -Feed space-weather
```

## Zeitstände, Karte und Unsicherheit

`fetchedAt` ist der Zeitpunkt, zu dem die App die Antwort empfangen hat. Antworten
derselben URL werden bis zu 60 Sekunden im Arbeitsspeicher wiederverwendet; ein
erneuter Aufruf innerhalb dieser Frist liefert denselben Abrufzeitpunkt.
`sourceTime` beziehungsweise die Zeit eines Eintrags stammt, soweit vorhanden,
aus der Quelle. Abrufzeit beweist keine aktuelle Messung. Fehlt die Quellenzeit,
bleibt ihr Alter unbekannt.

Der Globus zeichnet nur gültige gelieferte Koordinaten; er ist keine vollständige
Weltkarte. Nachrichten mit Länder-/Ankerpositionen bekommen keinen präzisen Punkt.
Metadaten wie `locationPrecision`, `lean` und `riskMethod` bleiben, soweit
geliefert, in den Nachrichteneinträgen erhalten, sind aber kein Prüfbeleg. Für
Ukraine werden gelieferte DeepState-Linien und Polygone als begrenzte, vereinfachte
Kartenebenen angezeigt. Kartenzeit und Nachrichtenzeit können verschieden sein.
Weder Karte noch Bericht werden durch diese Anzeige unabhängig bestätigt.

Eine Abfrage zeigt höchstens 100 Einträge. Die lokale Kontroll-API liefert Hermes
höchstens zehn Einträge mit `totalItems`, `additionalResultsInWorkbench` und
`mapLayersAvailable`; größere Ergebnislisten und die eigentliche Kartengeometrie
bleiben in der Werkstatt. Ausbleibende Punkte oder leere Ergebnisse beweisen keine
Abwesenheit von Ereignissen. Fehler werden angezeigt und nicht mit Beispieldaten
aufgefüllt.

Ein Klick auf einen Eintrag markiert die ausgewählte Zeile und richtet den Globus
nach ihrem Breiten- und Längengrad aus. Ortsname und Koordinaten stehen über dem
Globus; weitere Details und Quellen sind über den scrollbaren Bereich erreichbar.
Die aktive Markierung wird nach den übrigen Punkten gezeichnet, damit mehrere
Ereignisse am selben Ort sie nicht überdecken. Dieselbe Eintrags-ID bleibt bei
einer Aktualisierung derselben Datenart ausgewählt, sofern sie noch enthalten ist.
Bei fehlenden Koordinaten erscheint eine ausdrückliche Angabe statt einer
erfundenen Kartenposition.

## Erdbeben: „heute“ in Berlin

Ohne `date` gilt der aktuelle Kalendertag in **Europe/Berlin**, von Mitternacht bis
zur nächsten Mitternacht. Sommer-/Winterzeit werden berücksichtigt; ein solcher
Tag muss nicht genau 24 Stunden lang sein. Ereignisse außerhalb dieses Tages oder
nach dem aktuellen Zeitpunkt werden ausgeschlossen.

Für den heutigen Tag liefert OSIRIS USGS-Ereignisse ab M2,5 aus seinem rollierenden
24-Stunden-Feed; die App filtert diesen Feed zusätzlich auf den Kalendertag. Eine
Abfrage vergangener Tage nutzt stattdessen den festen öffentlichen
[USGS-Katalog](https://earthquake.usgs.gov/fdsnws/event/1/) mit den Berliner
Tagesgrenzen. Auch der seltene Fall, dass der heutige Berliner Tag bereits länger
als 24 Stunden läuft, nutzt den Katalog. Zukünftige Tage werden abgewiesen. Die
Liste ist nach gemeldeter Magnitude sortiert; Messungen können später korrigiert
werden, und höchstens 100 Ereignisse werden angezeigt.

```powershell
.\control.ps1 -Action intel -Kind earthquakes -Date 2026-10-09
```

## Öffentliche Webcams und Orte

„Webcams aus London“ bedeutet öffentliche, im OSIRIS-Feed gelistete
Betreiberquellen. Die lokale Webcam für Liliths Bildschirm-/Kamerablick ist eine
andere Funktion. Es werden keine privaten Kameras gesucht oder angemeldet.
Die App akzeptiert nur ausgewählte Betreiberbezeichnungen und öffentliche
HTTPS-Quellenlinks; diese Filter sind keine Garantie für Inhalt, Verfügbarkeit
oder Rechte zur Weiterverwendung.

Bekannte Ortsnamen können eine Quellenregion auswählen, etwa London → `uk` oder
Berlin → `germany`. Anschließend wird der Ortsname in Name/Stadt/Land der Kamera
gesucht. Das ist keine allgemeine Geokodierung und keine Garantie für eine Kamera
in jedem Ort. Bei einem unbekannten Ort ohne Region oder Koordinaten liefert die
Abfrage `clarificationNeeded` und die erlaubten Regionen, statt einen Ort zu
erraten. Bis zu vier erlaubte Regionen können kommasepariert angegeben werden.
Regionen, die der Anbieter noch lädt, bleiben als Warnung sichtbar.

```powershell
.\control.ps1 -Action intel -Kind cameras -Query London -Region uk
.\control.ps1 -Action intel -Kind cameras -Region germany -Latitude 52.52 -Longitude 13.405 -RadiusKm 25
```

Breiten- und Längengrad müssen gemeinsam angegeben werden. Dann filtert die App
gelieferte Kamerakoordinaten nach Entfernung und sortiert Treffer nach Abstand;
der Standardradius beträgt 25 km, maximal 1000 km. Ein Suchtext bleibt zusätzlich
ein Textfilter und sollte bei einer reinen Umkreissuche weggelassen werden.

API-Antworten sind auf 4 MiB und 15 Sekunden pro Quellenanfrage begrenzt.
Weiterleitungen werden abgewiesen. Datenschutz/Not-Aus brechen laufende Abfragen
ab und entwerten verspätete Ergebnisse; Entsperren startet keine neue Abfrage.
