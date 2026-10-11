# Lilith / JARVIS-Arbeitsplatz

Die Erweiterung benutzt die bestehende Hermes-Session und die lokale Windows-App. Es gibt keine zusätzliche Cloud-Bildanalyse oder kostenpflichtige Sprachintegration.

## Lagebild, Aufgaben und lokale Sicherheitssteuerung · 10. Oktober 2026

Die Werkstatt hat jetzt den Bereich **Lagebild**. Dort lassen sich ein Projekt,
die freiwillige Fenster-/Logbeobachtung, eine löschbare Ereigniszeitleiste und
gespeicherte Abläufe verwalten. Beobachtung bleibt standardmäßig aus. Es werden
keine dauerhaften Bildschirmaufnahmen, Zwischenablageinhalte oder Dokumenttexte
gesammelt. Höchstens200 bereinigte Ereignisse bleiben sieben Tage lokal; bei
aktivierter Funktion werden bis zu fünf historische Beobachtungen einem Auftrag
als ausdrücklich unverbindliche Daten hinzugefügt. Ganze Antworten werden nicht
als Abschlussereignis gespeichert. Details: [Kontextgedächtnis](context-memory.md).

Das Aufgabenbuch folgt echten Hermes-Ereignissen. **Agent beendet** bedeutet
keinen bewiesenen Gesamterfolg. Ein strukturiert bestätigter Spotify-Aufruf kann
als begrenzter Werkzeugbeleg angezeigt werden; ein angenommener Start oder204
genügt nicht. Gespeicherte Abläufe benötigen Name, Schritte und Erfolgskriterium.
Sie starten bewusst über die Oberfläche oder „Starte Ablauf NAME“. Eine API-Anfrage
während eines laufenden Auftrags bereitet nur dessen Schritte vor. Dies ist noch
kein Teach Mode, kein automatisch aufgezeichneter Klickablauf und keine allgemeine
Wiederaufnahme abgebrochener Aufgaben. Details: [Abläufe](routines.md).

**Ctrl+Alt+P** sperrt/entsperrt Datenschutz lokal, **Ctrl+Alt+Escape** löst Not-Aus
aus. Sensoren, lokale Ausgabe, neue Kontextbeobachtung und wartende Loghinweise
werden gestoppt; nach Entsperren bleiben Sensoren aus. Die Sperre bleibt über
Neustart. API-Entsperren ist verboten. Not-Aus fordert zusätzlich das Unterbrechen
bei Hermes an und behauptet keine Beendigung bereits gestarteter externer Prozesse.
Die unabhängige Windows-Cua-Verbindung besitzt weiterhin ihre eigenen Rechte;
diese App ersetzt keinen zentralen Berechtigungsmanager. Details:
[Datenschutz und Not-Aus](privacy-mode.md).

Lokale Wakeword-Bereitschaft ist auch ohne Gateway/Session möglich. Lilith meldet
die fehlende Verbindung/Session, statt einen Auftrag an eine alte Session zu senden.
Sprachaufträge benötigen weiter Hermes. Sensible Fenster werden vor einem
Monitorblick frisch geprüft; unbekannte Vordergrunddaten verlangen eine konkrete
Fensterquelle. App-/Titelheuristiken garantieren keine Erkennung jedes Geheimnisses.

Prüfung: echte Electron-Werkstatt mit neuen Fehler-/Erfolgsmeldungen aus eigenem
Testlog, Ablaufspeicherung, ehrlichen Aufgabenzuständen, bestätigtem Sensor-Aus,
Entsperren ohne automatische Sensoraktivierung und Not-Aus. Der aktualisierte
Hermes-Skill wurde auf dem VPS gesichert, geschrieben und vollständig zurückgelesen;
Aktivierung und bestehende Alltagssession sind bestätigt. Raum-Wakewords und
beliebige mehrstufige Programmabläufe bleiben eigene Praxistests.

## Digitale Werkstatt und Lagebericht · 10. Oktober 2026

**Ctrl+Alt+W**, **Digitale Werkstatt** im Orb oder „Lilith, öffne die Werkstatt“
blenden den größeren Arbeitsplatz ein. Er enthält Systemübersicht, Einsatzkonsole
und einen eigenen Browser. Die Konsole zeigt echte Werkzeugereignisse und
nimmt Aufträge für dieselbe Hermes-Session entgegen; sie ist kein direktes
PowerShell-Terminal. Der Browser hat eine eigene Sitzung und übernimmt keine
Chrome-/Edge-Tabs oder deren Anmeldungen. Webinhalte bekommen keine lokale
Steuerungs-API. Details: [Workbench](workbench.md).

„Systemstatus“, „Gib mir einen Statusbericht“ und „Wie geht es meinem PC?“
lesen die vorhandenen lokalen Messwerte ohne zusätzlichen Hermes-Auftrag vor.
CPU, RAM, GPU und Speicherplatz werden mit Messalter dargestellt. Werte älter
als45Sekunden gelten im Bericht als veraltet. Hohe GPU-Auslastung allein löst
keine Warnung aus. Temperatur wird nicht gemessen.

Die Windows-Anbindung wird beim verbundenen Gateway höchstens einmal pro
Minute und außerhalb aktiver Agentenaufträge abgefragt. Drei unabhängige,
ausdrücklich negative Prüfungen lösen eine Warnung aus; fehlende Daten bleiben
unbekannt. Der Status belegt Werkzeugregistrierung/Transport, nicht erfolgreiche
Bedienung jeder Anwendung. Normale Messungen brauchen keine Modellanfrage.

Unter Kamera lässt sich **Werkstatt per Handgesten steuern** einschalten.
Erst die ausgewählte Kamera aktivieren. Offene Hand halten öffnet, Faust halten
schließt; bewusstes seitliches Bewegen wechselt die Ansicht. Handanalyse läuft
lokal in einem separaten Worker mit dem vorhandenen Kamerastream. Details und
Prüfgrenzen: [Gesten](gestures.md).

Einsatzmodi bieten jetzt **Installierte Apps laden**. Store-Anwendungen werden
über ihre bestätigte Windows-App-ID eingetragen; klassische Verknüpfungen und
Dateipfade bleiben gültig. Ein angenommener Start bestätigt weiterhin keine
laufende Musik oder fertige Anwendung.

Native Prüfung: System- und Konsolenansicht visuell geprüft; echter Browser
lädt eine eigene lokale Testseite ohne IPC-Zugriff. Das lokale Handmodell
erkennt eine Hand im öffentlichen MediaPipe-Testbild und löst die Öffnen-Geste
aus; leeres Bild bleibt ohne Hand. Eigene Kamera/Licht/Handhaltung sind durch
diese Bildprüfung noch nicht geprüft.

## Einsatz-HUD

Eine schmale transparente Karte erscheint links neben dem Orb, sobald ein Auftrag läuft. Sie zeigt den Auftrag, tatsächlich gestartete/beendete Werkzeuge und ein Ergebnis. Nach Abschluss verschwindet sie nach sechs Sekunden. Fehler, Unterbrechungen und Verbindungsverlust werden nicht als Erfolg dargestellt. Der Zähler zählt beobachtete Werkzeug-Endereignisse; er ist kein Prozentfortschritt. Das HUD nimmt keinen Tastaturfokus und lässt Mausklicks durch. Unter **Einstellungen → JARVIS / ARBEITSPLATZ** kann es ausgeschaltet werden.

## Bildschirmblick

Bildschirmblick ist zunächst ausgeschaltet. In den Einstellungen einschalten und **Monitor, auf dem Lilith steht** oder ein bestimmtes Fenster auswählen. **Quellen aktualisieren** liest nur Namen/IDs, keine Vorschaubilder. Für ein geschlossenes Fenster gibt es eine Fehlermeldung; die App wechselt nicht heimlich auf einen anderen Bildschirm.

„Lilith, schau auf meinen Bildschirm“ und entsprechende Bildschirm-/Fehlerfragen werden vor Webcam-Fragen verarbeitet. Die App erfasst kurz genau die ausgewählte Quelle, stoppt den Stream nach einem JPEG und analysiert lokal mit dem bereits installierten Qwen3-VL. Der Frame wird nicht gespeichert oder zum VPS geschickt. Hermes erhält eine Textbeobachtung mit Quelle und Aufnahmezeit. Die Schaltfläche **Bildschirmblick** analysiert lokal, ohne zusätzlich einen Hermes-Auftrag zu schicken.

Für präzise Markierungen kann Hermes die UIA-Rechtecke seines bereits verbundenen Windows-MCP übergeben. Der Rahmen klickt nichts an, lässt Mausereignisse durch und verschwindet nach acht Sekunden. Physische Pixel werden für die Electron-Anzeige in DIP umgerechnet; Rechtecke müssen vollständig auf einem Monitor liegen. **Rahmen aus** entfernt ihn sofort. Die Modellbeschreibung wird nicht als präzise Koordinate behandelt.

## Einsatzmodi

Gaming, Arbeit und Feierabend sind vorbereitet, mit zunächst leeren Programmlisten. Pro Modus Programme über den Dateidialog auswählen oder absolute lokale `.exe`-/`.lnk`-/`.appref-ms`-Pfade eintragen. Zusätzlich einen Ablauf für Hermes und die Optionen für Hinweise, Kamera-Aus und abschließenden Standby speichern. Kein Modus enthält vorgegebene Löschbefehle oder Shellskripte.

Aktivierung über **Jetzt aktivieren** oder „Lilith, aktiviere den Gaming-Modus“. Programme werden lokal geöffnet. Ein hinterlegter Ablauf wird über die ausgewählte Session ausgeführt; bei einem API-Aufruf innerhalb eines Agentenauftrags bekommt der Agent den Ablauf zurück, um ihn im bestehenden Auftrag auszuführen. Ein nicht angenommener Programmstart wird als Fehler angezeigt. Ein angenommener Start bestätigt keine Musikwiedergabe oder fertige Anwendung.

## Lokale API

Der aktivierte Hermes-Skill `hermes-voice-control` verwendet weiterhin `control.ps1` über Windows-MCP. Das Token bleibt lokal. Neue Aufrufe:

```powershell
.\control.ps1 -Action screen -Question "Was bedeutet diese Fehlermeldung?"
.\control.ps1 -Action modes
.\control.ps1 -Action mode -Mode gaming
.\control.ps1 -Action highlight -X $x -Y $y -Width $width -Height $height -Label "Hier klicken" -CapturedAt $capturedAt
```

Die Markierungswerte und `$capturedAt` müssen aus einer aktuellen UI-Beobachtung stammen; den Zeitpunkt eines alten Bildes nicht durch „jetzt“ ersetzen. Die HTTP-Endpunkte sind `/v1/screen`, `/v1/modes`, `/v1/mode` und `/v1/highlight`. Sie benötigen dieselbe lokale Authentifizierung und erlauben keine beliebigen Shell-Befehle.

## Prüfung

Native Prüfung mit einem eigens erzeugten Fenster **Lilith Bildschirmtest**: Die lokale Analyse erkannte `TEST_404: Datei nicht gefunden`, lieferte Text/Quelle/Zeit ohne Bildfeld und zeigte einen durchklickbaren Rahmen. Der kalte Modellstart samt erster Analyse dauerte etwa32Sekunden; spätere Blicke können schneller sein. HUD und Einstellungen wurden visuell geprüft. Echte App-Abläufe wie Spotify müssen nach dem Hinterlegen der gewünschten Programme/Anweisungen getestet werden.

## Projektgraph, Lagekarte und geführte Hinweise · 10. Oktober 2026

Die Werkstatt hat die zusätzlichen Ansichten **Projektgraph** und **Lagekarte**.
Im Graphen bewusst einen Projektordner wählen und **Code indexieren** ausführen.
Graphify analysiert Code lokal ohne LLM-API-Aufruf; der letzte passende Index kann
beim Neustart wieder geladen werden. Suche markiert echte Knoten und ihre
Beziehungen, ein Klick zeigt eine begrenzte aktuelle Quellvorschau. Der gespeicherte
Graph beschreibt statische Struktur und kann veraltet oder unvollständig sein.
Er beweist keine laufenden Endpunkte oder tatsächlichen Funktionsaufrufe.
Details: [Projektgraph](project-graph.md).

Die Lagekarte zeigt öffentliche OSIRIS-Quelldaten mit Abrufzeit, verfügbaren
Quellenzeiten und gelieferten Koordinaten. Acht Fokusansichten und 21 zusätzliche
allgemeine Feeds sind integriert. „Erdbeben heute“ bedeutet den aktuellen
Kalendertag in Europe/Berlin. Ukraine-Linien stammen aus dem gelieferten
DeepState-Kartenstand; Nachrichten und Karten sind keine unabhängige Bestätigung.
Öffentliche Webcams sind gelistete Betreiberquellen und öffnen erst auf einen
Klick. Unklare Orte brauchen eine Quellenregion oder Koordinaten. Die lokale
Webcam bleibt eine eigene Funktion. Es gibt keine kostenpflichtigen
OI-Modellaufrufe. Details: [OSIRIS-Lagekarte](osiris.md).

Hermes kann einen Fensterglow und einen künstlichen Zeiger mit kurzer Erklärung
zeigen. Dazu benötigt er exakte frische UIA-Daten: dezimale HWND-ID, PID,
Fenster-/Zielrechtecke in physischen Desktop-Pixeln und den ursprünglichen
Beobachtungszeitpunkt. Die Position darf höchstens 15 Sekunden alt sein. Der
Hinweis klickt nichts und nimmt keinen Fokus; der Nutzer klickt selbst. Bewegung,
Minimieren, Schließen, Ablauf oder Datenschutz entfernen ihn. Externe Browser
bekommen dadurch keine vollautomatische DOM-Anleitung; eine lokale
Bildbeschreibung ersetzt keine präzise Zielposition. Werkzeugaktivität leuchtet
nur bei einem eindeutig zugeordneten laufenden Aufruf mit gültigem Fensterziel.

```powershell
.\control.ps1 -Action workbench -State on -Tab graph
.\control.ps1 -Action graph-search -Query createControlApi
.\control.ps1 -Action workbench -State on -Tab intel
.\control.ps1 -Action intel -Kind earthquakes
.\control.ps1 -Action intel -Kind ukraine
.\control.ps1 -Action guide -GuideJson $guideJson
.\control.ps1 -Action guide-clear
```

`$guideJson` wird aus den tatsächlichen aktuellen Fensterdaten erstellt. Schema
und weitere Befehle: [lokale Steuerungs-API](control-api.md). Datenschutz/Not-Aus
brechen Indexierung und Lageabfragen ab und löschen Hinweise; Entsperren startet
sie nicht automatisch neu.
