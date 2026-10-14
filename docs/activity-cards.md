# Kleine Aktivitätsfenster

Lilith kann am aktiven Gesprächsgerät ein kompaktes, verschiebbares Fenster
anzeigen: Gerätestatus, absolute Restzeit oder Zugriff auf eine bekannte
Home-Assistant-Kamera. Es öffnet sich ohne Fokusübernahme, bleibt vor anderen
Fenstern und lässt sich mit × schließen. Mehrere Karten sind mit Pfeilen
umschaltbar; maximal sechs sind gleichzeitig gespeichert.

## Aktueller Anschluss

Windows: `control.ps1 -Action activity-cards` liest den Zustand;
`-CardJson` sendet eine Upsert- oder Dismiss-Anforderung. Die bestehende
Windows-MCP-Shell oder der eingerichtete SSH-Aufruf dieser lokalen API ist
auch für den Hermes-/Home-Assistant-Agenten der vorhandene Zugriffsweg.
Linux verwendet dieselben authentifizierten Loopback-Endpunkte auf Port 8874;
Zugriff über die bestehende Notebook-MCP-Shell und private
`.local/linux-control.json`, nicht über eine öffentliche Netzwerkfreigabe.

`GET/POST /v1/activity-cards` und `POST /v1/home-display` sind mit dem
bestehenden lokalen Bearer-Token geschützt und lehnen Browser-Origin-Anfragen
ab. Datenschutz, fehlende Verbindung und fremder Gesprächsbesitz sperren die
Darstellung; Datenschutz schließt auch das Home-Assistant-Fenster sofort.
Die Karten besitzen eine separate Browser-Session und überschreiben keine
Mikrofonberechtigungen der Voice-App.

Upsert-Schema, mit tatsächlich beobachteten Werten füllen:

`{action:'upsert',id:'washer',kind:'countdown',title:'Waschmaschine',source:'Home Assistant',observedAt:ISO,status:'running',deadline:ISO}`

`kind`: status/countdown/camera. `status`: running/complete/unavailable/estimate.
`observedAt` muss einen ISO-Zeitpunkt mit Zeitzone innerhalb der letzten zwei
Minuten enthalten. `deadline` ist eine absolute Geräte-Endzeit, maximal sieben
Tage entfernt; `startedAt` optional eine bestätigte Startzeit. Geräte-Einschätzung
als estimate kennzeichnen. Ohne bestätigte Start-/Endzeit keinen Vorheiz-Countdown
erfinden: tatsächliche Temperatur oder unavailable als Statuskarte anzeigen.
Kamera benötigt `cameraEntity:'camera.<id>'`; beliebige URLs, HTML und
Medienadressen werden nicht angenommen. Titel/Detail/Quelle sind begrenzt und
werden als Text dargestellt. Dismiss: `{action:'dismiss',id:'washer'}`.

Restzeit wird sekündlich aus der absoluten Endzeit berechnet und übersteht einen
Client-Neustart. 0:00 bestätigt kein Geräteende: die Karte wartet auf frische
Gerätedaten. Nur eine neue authoritative Meldung darf complete setzen.
Gleiche/ältere Beobachtungen öffnen geschlossene Karten nicht erneut.
Speicherort `.local/activity-cards.json` bleibt privat; ein beschädigter Stand
wird erhalten und gemeldet, nicht still überschrieben.

## Home Assistant und Ring

Die private Datei `.local/home-display.json` enthält nur `{url:ORIGIN}`.
`control.ps1 -Action home-display -Operation open` öffnet die native
Home-Assistant-Ansicht zur Anmeldung. Zugangsdaten werden ausschließlich dort
eingegeben; die eigene persistente Browser-Partition bewahrt die Anmeldung.
Lilith liest keine Passwörter, Cookies, Zugriffstokens oder signierten Video-URLs.
`-Operation inventory` liest begrenzte öffentliche Entity-Metadaten;
`-Operation camera -CameraEntity camera.<id>` öffnet eine vorhandene Kamera
über Home Assistants eigene Entity-Ansicht. Eine fehlende Entity wird gemeldet.
Der Knopf auf einer Kamerakarte öffnet dieselbe Ansicht.

Home Assistant übernimmt seinen vorhandenen Kamera-Player. Eine geöffnete
Ansicht belegt kein Livebild; `inventory.camera.playing` wird nur aus einem
wirklich laufenden HTML-Videoplayer gelesen. Ein alter Aufnahme-/Snapshot-
Kameratyp ist kein Livestream. Ring-Netzwerk und Konto bleiben Voraussetzungen;
die Ring-Integration unterstützt live_view und last_recording:
[Ring-Dokumentation](https://www.home-assistant.io/integrations/ring/).
Die Entity-Ansicht verwendet Home Assistants vorhandenes
[Frontend-Ereignis](https://github.com/home-assistant/frontend/blob/dev/src/panels/media-browser/ha-panel-media-browser.ts).

Dies ist der Anzeigevertrag für den vorhandenen Agenten, keine zusätzliche
Home-Assistant-Automation oder selbst erfundene Geräteintegration. Für automatische
Meldungen muss der beauftragte Agent frische Geräteereignisse an diesen Vertrag
liefern. Defekte Waschmaschinen-/Backofen-Integrationen bleiben unavailable;
das Anzeigen repariert sie nicht. Kamera-Livebetrieb wird nach der lokalen
Home-Assistant-Anmeldung am tatsächlichen Gerät separat geprüft.

Prüfungen: activity-cards.test.cjs, activity-display-api.test.cjs,
home-display.test.cjs und der isolierte native activity-cards.electron.cjs.
