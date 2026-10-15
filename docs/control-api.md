# Lokale Steuerungs-API

## Zwischenablage

`POST /v1/clipboard` akzeptiert ausschließlich `{action:'read',maxChars?:1..20000}`
oder `{action:'write',text:'…'}` mit 1 bis 20.000 UTF-16-Zeichen ohne Nullzeichen.
Nur für diesen Endpunkt gilt ein Bodylimit von 131.072 Bytes, damit Unicode und
JSON-Escaping passen; bestehende Endpunktlimits bleiben erhalten. Authentifizierung,
Loopback, aktive lokale Session, Standby- und Datenschutzprüfung gelten weiterhin.
Lesen liefert `ok,text,truncated,untrusted,observedAt`, Schreiben nach nativem
Abgleich `ok,verified,characters`. Kein Polling, Bildformat oder Auftragsversand.
Windows: `control.ps1 -Action clipboard -Operation read -MaxChars 20000` oder
`-Operation write -ClipboardText '<gewünschter Text>'`. Der Linux-MCP bietet
`lilith_clipboard_read` und `lilith_clipboard_write` für das Notebook.

## Eigener Werkstatt-Browser

`GET /v1/browser` liest `{ok,browser}`. `POST /v1/browser` akzeptiert ausschließlich
`{action:'navigate',url:'https://…'}` oder `{action:'state'|'back'|'forward'|'reload'}`.
`browser` liefert `ready`, `url`, `title`, `loading`, `visible`, `tab` und
Vor-/Zurück-Bereitschaft. Lesen erstellt kein Browserfenster. Navigation öffnet
die ausdrücklich beauftragte eigene Browseransicht; ein Ladefehler ist keine
Öffnungsbestätigung. HTTP(S) ohne Credentials, keine freie JS-/Shell-Ausführung.
Bearer, Origin-Sperre, Körperlimit und Datenschutz bleiben verbindlich.

Windows: `control.ps1 -Action browser`, Navigation mit `-Operation navigate
-Url https://example.com`; Vor/Zurück/Neu laden entsprechend. Der Windows-Status
enthält `workbench.tab` und `workbench.browser` als frische Metadaten.
Linux verwendet dieselben begrenzten Browser- und Werkstatt-Verträge über eine
eigene Loopback-API `127.0.0.1:8874`; nur `status`, `workbench`, `browser` sind dort
freigegeben. Das private `.local/linux-control.json` bleibt lokal (0600), wird
vom bestehenden Linux-MCP gelesen und enthält keine Agentenfreigabe für andere
API-Aktionen. Kein Token in Befehlsausgabe oder Git.

`guide` akzeptiert bei `purpose:'guide'` die optionalen festen Darstellungsfelder `color` (`cyan`, `violet`, `amber`, `green`) und `shape` (`frame`, `ellipse`). Die Ellipse umrandet das tatsächlich beobachtete Zielrechteck. Standard bleibt cyan/frame. Aktivitätshinweise akzeptieren keine Darstellungsfelder. `control.ps1 -Action guide -GuideJson ...` übergibt diese Felder im bestehenden JSON; keine neuen freien CSS- oder Koordinatenwege. Fensteridentität, ursprünglicher Beobachtungszeitpunkt, native Prüfung und Ablauf gelten unverändert. Beispielzusatz zum frisch ermittelten Hinweis: `{color:'violet',shape:'ellipse',label:'Hier klicken'}`.

## Bluetooth

`GET /v1/bluetooth-devices` liefert `{radios, devices, observedAt}` mit
`devices[].id`, `name`, `paired`, `connected`, `containerId`. Gespeicherte
Verbindungsflags sind keine Bestätigung einer frisch ausgeführten Aktion.
`POST /v1/bluetooth` akzeptiert exakt eine dieser Formen:

```json
{"action":"radio","enabled":true}
{"action":"scan"}
{"action":"connect","deviceId":"<aktuelle devices[].id>"}
```

Für Geräte zusätzlich `disconnect`, `pair`, `audio`. Keine Namen statt IDs,
keine zusätzlichen Schlüssel. Wie die übrigen Endpunkte lokal authentifiziert;
Browser-Origin-Anfragen sind gesperrt. Erfolg braucht `ok=true` und
`result.verified=true`. `result.evidence.needsUser=true` verlangt Abschluss im
nativen Windows-Kopplungsdialog und bestätigt keine Kopplung. Hardware-Grenzen
und geprüfter Stand: [Bluetooth](bluetooth-control.md).

```powershell
.\control.ps1 -Action bluetooth-devices
.\control.ps1 -Action bluetooth -Operation radio -State on
.\control.ps1 -Action bluetooth -Operation scan
.\control.ps1 -Action bluetooth -Operation audio -DeviceId '<aktuelle devices[].id>'
```

## Grundsteuerung

`status.voiceHealth` zeigt beobachtete Sprachbereitschaft, einzelne Prüfungen und
eine begrenzte Reparaturempfehlung. Die App verbindet bei Leerlauf nur den schon
gewählten Eingang erneut, setzt die vorhandene Audioausgabe fort oder startet
ihre fehlenden lokalen Sprachhelfer. Keine Kameraaktivierung, Sessionresets oder
Wiederholung von Aufträgen. Ein toter Silero-/Wakeword-Worker ist ein Fehler auch
bei erreichbarem STT-/TTS-Server. Der Orb zeigt dann **SPRACHE PRÜFEN**.
`status.attention` nennt eine explizite Inhaltsquelle und ihren ursprünglichen
Zeitpunkt ohne Quelltext/native IDs. Details: [Sprachdiagnose](voice-health.md).

```powershell
.\control.ps1 -Action current-content -Kind window -Selection pointer -Question 'Erkläre den Text hier'
.\control.ps1 -Action current-content -Kind remembered -Question 'Erkläre die zuletzt gelesene Quelle nochmal'
```

`POST /v1/current-content` erlaubt zusätzlich `{kind:'window', selection:'pointer',
question:'...'}` und `{kind:'remembered',question:'...'}`. Andere Auswahlarten,
Pointer für Zwischenablage/alte Quelle und zusätzliche Schlüssel werden
abgewiesen. Nur nach ausdrücklicher Inhaltsanfrage verwenden, nicht als dauerhaftes
Beobachten. Bildinhalte weiterhin mit ausdrücklich ausgewähltem Einkreisen.

`status.localConversation` meldet die lokale Gesprächsschicht getrennt vom
Hermes-Auftrag: `enabled`, `ready`, `busy`, `model`, `pendingPlayback`, Fehler
und `turnDetector.available`. Ein bereiter lokaler Dialog bedeutet keine neuen
PC-Berechtigungen und keinen abgeschlossenen Hintergrundauftrag.
`status.voiceTiming.summary` enthält Laufzeiten ohne Sprachinhalt, einschließlich
`localFirstTokenMs`, `localModelMs` und `turnPredictionMs`. Die beiden lokalen
Gesprächseinstellungen werden in SPRACHE / DIREKT gewählt. Vertrag und Grenzen:
[Lokales Live-Gespräch](local-live-conversation.md).

Hermes erreicht die App über seine vorhandene Windows-MCP-Shell und [control.ps1](../control.ps1). Der Helfer liest das lokale Token selbst. Es muss nicht zum VPS kopiert werden. Die API bindet ausschließlich an `127.0.0.1:8872`; es ist kein zusätzlicher Netzwerkport freigegeben.

```powershell
.\control.ps1 -Action status
.\control.ps1 -Action standby
.\control.ps1 -Action look -Question "Was halte ich in der Hand?"
.\control.ps1 -Action camera -State off
.\control.ps1 -Action live -State off
.\control.ps1 -Action wakewords -State off
```

Für „an“ jeweils `-State on`. Die rückgemeldeten Statusfelder unterscheiden eingestellte und tatsächlich aktive Zustände. Kamera, Live und Wakewords sind unabhängige Schalter. Live aus lässt bei eingeschalteten Wakewords das Mikrofon in Bereitschaft; beide ausschalten beendet den Mikrofonzugriff. Live aus unterbricht nicht den aufrufenden Hermes-Auftrag.

`standby` (`POST /v1/standby` mit exakt `{}`) schaltet Live und Kamera aus, stellt Wakewords an und merkt die bisherige Kamera-Einstellung. Eine direkte gesprochene Anweisung wie „Geh in den Standby“ oder „Schalte den Live-Modus aus“ wird von der App selbst verarbeitet und kurz bestätigt. Beim Wakeword oder bewussten Live-Start wird dieselbe Kamera nur dann wieder aktiviert, wenn sie vorher aktiviert war; eine vorher ausgeschaltete Kamera bleibt aus. Gesten bleiben eingestellt, laufen aber erst wieder mit aktiver Kamera. Wiederholter Standby behält die Erinnerung. Ein explizites Kamera-Aus im Standby widerruft deren Wiederanlauf. Datenschutz und Not-Aus verwerfen die Erinnerung. `standbyActive` und `standbyCameraEnabled` sind interne, lokal gespeicherte Zustandsfelder; sie lassen sich nicht über allgemeine Einstellungen setzen. Das Mikrofon bleibt für Wakewords aktiv.

Für direkte lokale Clients: `GET /v1/status`, `POST /v1/camera`, `/v1/live`, `/v1/wakewords` mit exakt `{"enabled":true}` bzw. `false`. `POST /v1/look` benötigt exakt `{"question":"Was halte ich in der Hand?"}` (1–500 Zeichen, maximal1KiB Payload). Alle Endpunkte benötigen `Authorization: Bearer <lokales Token>` aus der ignorierten `.local/control-api.json`. Browser-Origin-Anfragen werden abgewiesen, Weiterleitungen sind im Helfer deaktiviert. Es gibt keine Endpunkte für Bildabruf, beliebige Shell-Befehle oder beliebigen Dateizugriff.

`look` erfasst genau einen aktuellen Frame aus dem bereits laufenden Kamerastream von Hermes Voice. Es öffnet keine zweite Kamera und schaltet eine ausgeschaltete Kamera nicht automatisch ein. Die Antwort enthält `observation.description`, `held_object`, `uncertain`, lokal erkannte Namen, `source.label`/`deviceId` und `capturedAt`. Bilder und biometrische Referenzen bleiben lokal. Für jede Folgefrage muss ein neuer Blick erfolgen; eine alte Beschreibung ist kein Ersatz. In der App werden auch Formulierungen wie „schau mal, was ich in der Hand halte“ direkt als frische Kamerafrage behandelt.

Der API-Blick ist während eines laufenden Hermes-Auftrags erlaubt und sendet keinen neuen Agentenauftrag. Ein Kamera-Aus oder Kamerawechsel bricht einen ausstehenden Blick ab. Die Analyse kann beim kalten Modell bis zu150Sekunden dauern. Der Skill schreibt diesen Zugriff vor und untersagt einen konkurrierenden Hardwarezugriff über OpenCV/ffmpeg oder VPS-Skripte. Eine von Hermes Voice belegte Kamera ist im normalen Betrieb korrekt.

Der Hermes-Skill liegt als überprüfbare Vorlage unter [hermes-voice-control/SKILL.md](hermes-voice-control/SKILL.md). Er enthält nur die Bedienbefehle und kein Token.

Der nachträglich ergänzte Blick wurde mit der aktivierten `HD Webcam C525 (046d:0826)` geprüft: PowerShell-Helfer meldete `ok=true`, aktuellen Aufnahmezeitpunkt, vorhandene Beschreibung und dieselbe Kamera weiterhin aktiv; kein Bildfeld in der Antwort. Der Gateway-Skill wurde aktualisiert und vollständig zurückgelesen. Agentenantworten nach dieser Änderung bleiben ein Nutzertest; die lokale API und die Weitergabe des Kameravertrags an Hermes sind geprüft.

Die Wakeword-Erkennung reagiert auch innerhalb eines aktiven Live-Gesprächs auf reine Anreden mit einer lokalen Begrüßung. Die Bereitschaftserkennung nutzt einen kurzen Audiovorlauf und eine niedrigere Anfangsschwelle; Silero-VAD prüft weiterhin, ob tatsächlich Sprache vorliegt. Die zusätzliche Sprachwahrscheinlichkeitsberechnung von whisper.cpp ist deaktiviert: Bei einem vollständig durch VAD entfernten Geräusch führte sie in dieser Engine-Version zu einem ungültigen Sprachindex und Serverabsturz. Deutsch bleibt fest eingestellt.

Geprüft am 09.10.2026: Kamera aus/an, Live an/aus und Wakewords aus/an in der laufenden nativen App bestätigt; vollständiges Mikrofon-Aus bei beiden Schaltern aus bestätigt; nicht authentifizierter API-Zugriff ergibt HTTP401. Drei synthetische Geräuschaufnahmen liefern leere Transkripte, der echte Sprachserver bleibt danach erreichbar und erkennt die leise Testaufnahme „Hey Lilith, bist du da?“. Der Hermes-Skill wurde im Gateway-Profil `default` installiert, vollständig zurückgelesen und als aktiviert geprüft. Seine Datei liegt auf dem VPS unter `/home/claw/.hermes/skills/hermes-voice-control/SKILL.md`. Der genaue Windows-PowerShell-Befehl aus dem Skill wurde lokal geprüft. Die tatsächliche Ausführung eines Sprachauftrags durch den VPS-Hermes über Windows-MCP braucht noch einen Nutzertest.

Kurze Testclips für „Hey Hermes“, „Hey Lilith“, „Lilith“ und „Lillis“ funktionieren. „Hey Lillis“ mit folgendem Auftrag funktioniert ebenfalls; der vorhandene sehr kurze alleinstehende synthetische Clip wird dagegen falsch transkribiert. Es wird bewusst keine entfernte Schreibweise als Wakeword zugelassen. Die Erkennung aller Varianten im echten Raum bleibt ein Mikrofontest.
# Digitale Werkstatt und lokale Statusberichte

`status` enthält zusätzlich `system` mit Messalter, CPU/RAM/GPU/Speicherplatz
und geprüften Verbindungen sowie `workbench.visible` und `workbench.presentation`
mit `owner`, `requestId` und `reason`. Fehlende Werte bleiben
unbekannt. Neues authentifiziertes `POST /v1/workbench`:

```json
{"enabled":true,"tab":"system"}
```

Tabs: `system`, `console`, `browser`, `context`, `graph`, `intel`, `artcraft`;
bei explizit beauftragter Browsernavigation
zusätzlich `url` mit HTTP/HTTPS ohne Zugangsdaten. Keine Shell-/Datei-URLs.

```powershell
.\control.ps1 -Action workbench -State on -Tab system
.\control.ps1 -Action workbench -State on -Tab browser -Url https://example.com
.\control.ps1 -Action workbench -State off
```

Ein Aufruf ohne `-Agent` bleibt eine manuelle Nutzeraktion. Für eine Darstellung
des Agenten kommen optional `agent` (Boolean), `requestId` (1–80 Zeichen aus
`A–Z`, `a–z`, `0–9`, `_`, `-`) und `reason` (bis 160 Zeichen ohne Steuerzeichen)
hinzu. Neue Felder und unbekannte Schlüssel werden strikt geprüft. Agentisches
Öffnen erhält bei fehlender ID eine neue ID vom Backend; agentisches Schließen
benötigt die zurückgemeldete ID. Die JSON-Antwort enthält zusätzlich `result`.

```powershell
$control = Join-Path $PWD 'control.ps1'
$status = & $control -Action status | ConvertFrom-Json
$opened = & $control -Action workbench -State on -Agent -Tab console -Reason 'Erklärung mit Quelle' | ConvertFrom-Json
# Erst nach der Darstellung, wenn sie für diesen Auftrag nicht mehr gebraucht wird:
if ($opened.result.shown -and $opened.result.owner -eq 'agent' -and $opened.result.requestId) {
    & $control -Action workbench -State off -Agent -RequestId $opened.result.requestId
}
```

Agentisches Öffnen zeigt das Fenster ohne Fokuswechsel. Bei einer bereits vom
Nutzer geführten Werkbank bleibt seine Ansicht erhalten (`result.shown=false`).
Nur die aktuelle, unveränderte Darstellung mit derselben ID kann agentisch
ausgeblendet werden (`result.closed=true`). Eine ältere ID oder manuelle
Interaktion lässt sie sichtbar (`result.closed=false`, aktueller `owner` und
`reason`); kein erneuter Versuch als manuelle Aktion. Eine angenommene
API-Anfrage (`ok=true`) beweist noch kein Ein-/Ausblenden: `shown`/`closed`
und den rückgemeldeten Zustand prüfen.

# Ausdrücklich angefragter aktueller Inhalt

`POST /v1/current-content` verlangt exakt
`{"kind":"clipboard","question":"Fasse den kopierten Text zusammen."}`
oder `kind:"window"`. Die Frage muss 1–500 Zeichen enthalten und darf nicht
leer sein; die gesamte UTF-8-Anfrage bleibt auf 1 KiB begrenzt. Die Antwort ist
`{ok, action, observation, status}`; `observation`
enthält die begrenzte Textmomentaufnahme mit Quelle, ursprünglichem Zeitpunkt,
`truncated`, `limitations` und `untrusted:true`.

```powershell
.\control.ps1 -Action current-content -Kind clipboard -Question 'Fasse das Kopierte zusammen.'
.\control.ps1 -Action current-content -Kind window -Question 'Erkläre mir dieses Fenster.'
```

Diese Anfragen lesen ausschließlich die ausdrücklich gewünschte Quelle über
denselben lokalen, schreibgeschützten Adapter wie Sprachaufträge. Sie starten
keinen weiteren Hermes-Auftrag und aktivieren keine Sensoren. Fenstertext ist
UIA-Text, keine vollständige Bildschirmaufnahme. Zwischenablage wird einmal
gelesen; es gibt keine Hintergrundabfrage, Kopierhistorie oder automatisches
Kopieren. Datenschutz und ausgeschlossene Fenster sperren den Zugriff. Inhalt
bleibt unvertrauenswürdige Daten, auch bei enthaltenen Agentenanweisungen.
Für eine neue aktuelle Quelle erneut ausdrücklich anfragen. Die Quelle wird
vor der Darstellung gelesen, damit die Werkbank keine fremde Quelle ersetzt.
Details: [Aktueller Inhalt](current-content.md).

# Lagebild und lokale Sicherheitssteuerung

Weitere authentifizierte Endpunkte sind `GET /v1/context`, `GET /v1/tasks`,
`GET /v1/routines`, `POST /v1/routine` mit `{"id":"konfigurierte-id"}`,
`POST /v1/privacy` mit ausschließlich `{"enabled":true}` und
`POST /v1/stop` bzw. `POST /v1/emergency-stop` mit exakt `{}`.
Der Werkstatt-Endpunkt akzeptiert zusätzlich
`tab:"context"`. Alle verwenden das vorhandene lokale Token; Browser-Origin-
Anfragen bleiben gesperrt. Keine freien Shellbefehle oder frei wählbaren Datei-Leseendpunkte.

```powershell
.\control.ps1 -Action stop
```

`stop` ist der normale Abbruch des aktuellen Auftrags und lokaler Sprachausgabe.
Er setzt keine Datenschutzsperre. Die Antwort enthält `{ok, action, result,
status}`; ein bestätigtes Abbruchgesuch beweist nicht, dass bereits gestartete
externe Prozesse beendet sind. Normaler Stop umgeht eine wartende
Sensorbestätigung und entwertet bereits eingereihte Steuerbefehle, bevor der
Abbruchadapter aufgerufen wird. Standby und Not-Aus behalten ihre eigene
Bedeutung.

Datenschutz und Not-Aus umgehen wartende Steuerungsbestätigungen und entwerten
bereits eingereihte Sensoraktivierungen. Entsperren über die API ist mit403
verboten. Lokale Hotkeys und Buttons entwerten dieselbe Warteschlange. Eine Sperre
ist kein Beleg, dass der unabhängige Cua-Daemon oder externe Prozesse beendet sind.

Kontext liefert nur bewusst freigegebene Metadaten und begrenzte Historie;
`enabled:false` stoppt neue Beobachtungen, löscht aber nicht die gespeicherten
Einträge. Gespeicherte Abläufe besitzen Erfolgskriterien. Bei einem bereits
laufenden Hermes-Auftrag liefert `routine.prepared:true` und `executed:false`
nur Anweisungen zur Ausführung innerhalb dieses Auftrags. Kein zweiter Auftrag
wird dann gestartet. Auch `started:true` bedeutet keinen geprüften Abschluss.

# Projektgraph, Lagekarte und visuelle Anleitung

Die Werkstatt akzeptiert zusätzlich `tab:"graph"` und `tab:"intel"`. Die neuen
Aufrufe verwenden dasselbe lokale Token und dieselbe Grenze von 1 KiB pro
Anfrage. Indexierung und Projektordnerwahl erfolgen bewusst in der Oberfläche.

| Endpunkt | Payload / Ergebnis |
| --- | --- |
| `GET /v1/graph` | Indexstatus, Indexzeit, `stale`, Zähler und Auswahl |
| `POST /v1/graph-search` | Exakt `{"query":"createControlApi"}`; echte Knoten-IDs und markierte Treffer |
| `POST /v1/graph-source` | Exakt `{"id":"ID aus einem Treffer"}`; begrenzte aktuelle Quellvorschau |
| `GET /v1/intel-catalog` | 29 feste öffentliche GET-Feeds, acht Fokusansichten |
| `POST /v1/intel` | `kind`, optional `query`, `region`, `lat`, `lon`, `radiusKm`, `date`; für weitere Feeds `kind:"feed"` und `feed` |
| `POST /v1/guide` | Frische Fensteridentität und physische Rechtecke; durchklickbarer Hinweis |
| `POST /v1/guide-clear` | Exakt `{}`; Hinweis entfernen |

```powershell
.\control.ps1 -Action workbench -State on -Tab graph
.\control.ps1 -Action graph
.\control.ps1 -Action graph-search -Query createControlApi
.\control.ps1 -Action graph-source -NodeId $nodeId
.\control.ps1 -Action workbench -State on -Tab intel
.\control.ps1 -Action intel -Kind earthquakes
.\control.ps1 -Action intel -Kind cameras -Query London -Region uk
.\control.ps1 -Action intel -Kind feed -Feed space-weather
.\control.ps1 -Action guide -GuideJson $guideJson
.\control.ps1 -Action guide-clear
```

`$nodeId` stammt aus der aktuellen Graphsuche. Der Graph beschreibt statische
Codebeziehungen; Laufzeitverhalten braucht eigene Belege. Details:
[Projektgraph](project-graph.md). OSIRIS-Orts-/Zeitfilter, Quellenmetadaten und
Abdeckungsgrenzen: [Lagekarte](osiris.md). Die API-Lageantwort enthält höchstens
zehn Einträge und verweist auf weitere Ergebnisse und Kartenebenen in der
Werkstatt.

`$guideJson` muss aus einer gerade gelesenen UIA-/Fensterbeobachtung aufgebaut
werden. Er benötigt `purpose:"guide"`, `windowId` als dezimale HWND-Zeichenkette,
`pid`, `windowRect:{x,y,width,height}` und `observedAt` als ursprünglichen
ISO-Zeitpunkt. Ein optionales `targetRect` mit denselben vier Feldern muss im
Fenster liegen. Beide Rechtecke verwenden **physische Desktop-Pixel**, keine
Browser-CSS-Pixel. Optional sind `snapshotId`, `label` (höchstens 80 Zeichen) und
`text` (höchstens 500 Zeichen). Eine Bildbeschreibung allein liefert kein exaktes
Ziel. DOM-Rechtecke müssen zuerst anhand frischer Fenster-/Darstellungsdaten in
physische Desktop-Koordinaten umgerechnet werden; die App erledigt keine
vollautomatische DOM-Anleitung externer Browser.

Die Beobachtung darf höchstens 15 Sekunden alt sein. Die App prüft HWND, PID,
Sichtbarkeit und native Fensterposition erneut, auch während der Anzeige. Der
Hinweis läuft spätestens 15 Sekunden nach der ursprünglichen Beobachtung ab;
Bewegen, Minimieren, Schließen, Monitoränderung, Browsernavigation oder eine
Datenschutzsperre entfernen ihn. Der Zeiger ist simuliert: Er bewegt keine
OS-Maus, setzt keinen Fokus und klickt nichts. Der Nutzer klickt selbst.

`purpose:"activity"` benötigt zusätzlich `taskId` und `toolCallId` einer
nachweislich laufenden Werkzeugaktion. Der Fensterglow zeigt nur deren gebundenes
Ziel, keinen erfundenen Fortschritt; er läuft höchstens zehn Sekunden und bleibt
ebenfalls an die 15-Sekunden-Frische gebunden.

Der ältere `highlight`-Aufruf benötigt jetzt zusätzlich `-CapturedAt` aus der
ursprünglichen UI-Beobachtung:

```powershell
.\control.ps1 -Action highlight -X $x -Y $y -Width $width -Height $height -Label "Hier klicken" -CapturedAt $capturedAt
```

Nicht nachträglich „jetzt“ auf einen alten Screenshot schreiben. Diese Markierung
akzeptiert maximal 30 Sekunden alte Koordinaten und bleibt acht Sekunden sichtbar;
sie besitzt die HWND-/PID-Prüfung der neuen Anleitung nicht. Physische Pixel sind
Standard, `-CoordinateSpace dip` ist nur für ausdrücklich so gelieferte Werte
gedacht.


Artcraft: `GET /v1/artcraft`, `POST /v1/artcraft-select`, `/v1/artcraft-open` mit `{appId}`; `/v1/artcraft-link` mit `{appId,port,tokenFile?}` bzw. Pdf `{appId:"pdf",endpointFile}`. Siehe [Artcraft](artcraft.md). Workbench-Tab `artcraft` ist verfügbar. Keine Vorschau-Bytes in HTTP-Antworten.

## Mikrofon, Lautstärke und Apps/Fenster

Authentifizierung, Loopback und Origin-Sperre gelten unverändert.

| Endpunkt | Methode / exakt erlaubter Body |
|---|---|
| `/v1/microphones` | GET; frische Browser-Input-IDs/Labels, Auswahl und aktiv |
| `/v1/microphone` | POST `{deviceId:"<ID>"}`; leere ID bewusst Windows-Standard |
| `/v1/volume` | GET; oder POST `{action:"set",value:25}` / `{action:"up"}` / down/mute/unmute |
| `/v1/apps` | GET; vorhandener Windows-App-Katalog |
| `/v1/app-open` | POST `{appId:"<apps[].id>"}` |
| `/v1/windows` | GET; frische Fenster-ID, PID, Prozessstart, Titel/App |
| `/v1/window-focus` | POST `{id:"<HWND>",pid:123,processStartedAt:"<unverändertes ISO>"}` |

POST meldet `ok=true` nur mit `result.verified=true`; angenommene App-Starts
oder Fokusversuche ohne tatsächlichen Fenster-/Vordergrundbeleg bleiben
unverifiziert. Keine freien Exe-Argumente oder Shellbefehle. Für reservierte
Desktop-Aufträge ist zusätzlich `jobId` bei app-open/window-focus nötig;
Fremdaufträge ergeben HTTP409. Mikrofonwechsel wartet auf Rendererbestätigung,
behält Live/Wake und stellt bei Fehler die vorherige Auswahl zurück. Bei
Privacy werden diese Aktionen gesperrt. Details: [Mikrofon](microphone.md),
[Fenster](windows-control.md).

## Zeitaufträge

GET `/v1/power` und `/v1/reminders` liefern eigene Timer bzw. Erinnerungen.
POST `/v1/power`: exakt `{action:"shutdown"|"restart",delaySeconds:30..86400}`
oder `{action:"cancel"}`. POST `/v1/reminders`: exakt
`{action:"create",kind:"reminder"|"alarm",text:"...",at:"ISO mit Zeitzone"}`
oder `{action:"cancel",id:"UUID"}`. Bei Planung bedeutet `ok=true` nur, dass
lokal gespeichert/geplant wurde. Power benötigt bis zur Fälligkeit laufende
App und wird nach deren Neustart nicht wiederholt; fällige Erinnerungen werden
nachgeholt. Datenschutz hält Erinnerungen zurück und bricht Power ab.
Not-Aus/gewöhnlicher Stopp brechen einen eigenen Power-Timer ab. Keine globale
Windows-Timeränderung und kein erzwungenes Schließen. Details:
[Power/Erinnerungen](power-and-reminders.md).

```powershell
.\control.ps1 -Action microphones
.\control.ps1 -Action microphone -DeviceId '<aktuelle Eingangs-ID>'
.\control.ps1 -Action volume -Operation set -Value 25
.\control.ps1 -Action apps
.\control.ps1 -Action app-open -AppId '<aktuelle Katalog-ID>'
.\control.ps1 -Action windows
.\control.ps1 -Action power -Operation restart -DelaySeconds 600
.\control.ps1 -Action power -Operation cancel
.\control.ps1 -Action reminders -Operation create -Kind reminder -Text 'Pause' -At '2026-10-12T18:00:00+02:00'
```

Direkte Sprache wie „Wechsle zum Tischmikrofon“, „Erinnere mich in 10 Minuten
an eine Pause“, „Stelle einen Timer auf 5 Minuten“ und „Fahre den PC in
10 Minuten herunter“ wird bei eindeutigem Wortlaut lokal ausgeführt.

## Kleine Aktivitätskarten und Home Assistant

`GET/POST /v1/activity-cards` und `POST /v1/home-display` verwenden denselben
privaten Loopback-Zugang. Status, absolute Countdownzeit und bekannte
Kameraentity; Typen, Grenzen und Beispiele: [Aktivitätskarten](activity-cards.md).
Keine frei wählbare URL, Shell oder Medienadresse. Beide Clients prüfen
Datenschutz und aktuellen Gesprächsbesitz.

`POST /v1/home-display` unterstützt zusätzlich `{action:"show",query:"Haustür"}`
für den vollständigen Ablauf mit bestätigtem Player. `X-Lilith-Session` bindet
Änderungen an die aktuell ausgewählte stabile `status.sessionContext.id`.
`POST /v1/session-handoff` akzeptiert `state`, `recall` oder `transfer` mit
`target:"windows"|"notebook"`; ein wartendes Ergebnis ist noch keine Übernahme.
Der MCP-Adapter benutzt diese Verträge direkt: [Gerätewerkzeuge](device-tools.md).

`POST /v1/window-place` ordnet ein bekanntes Fenster nativ an: genau
`{id,pid,processStartedAt,monitorId,rect:{x,y,width,height}}`, optional passender
`jobId`. Frische physische WorkArea über windows lesen; Erfolg erst bei
`result.verified` und tatsächlichem Rechteck. [Vertrag](windows-control.md).

Nur der Notebook-Client unterstützt zusätzlich `POST /v1/session-new` mit
genau `{}`: separate leere Session erstellen, keine PC-Unterbrechung.
[Bedienung und Grenzen](linux-client.md).
