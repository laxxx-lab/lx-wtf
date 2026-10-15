# Artcraft-Werkbank

`Ctrl+Alt+W` öffnet die Werkbank, Reiter **07 Artcraft**. Zwölf installierte native Programme unter `C:\Tools\artcraft\apps` sind auswählbar. „App öffnen“ startet ausschließlich den bekannten Editor und richtet bei fehlender lokaler Registrierung einen freien GUI-Control-Kanal ein; „App zeigen“ fokussiert ein eindeutig erkanntes Fenster. Bearbeitungsaufträge laufen über die ausgewählte bestehende Hermes-Session und deren MCP.

**Fensterstream** zeigt echtes lokales Video des ausgewählten nativen Fensters, Ziel 30 fps. Die Erfassung bindet sich an die genaue PID und HWND des bekannten installierten Editors, nicht an einen Fenstertitel oder den gesamten Desktop. Sie verwendet Electron `getDisplayMedia` und benötigt keinen GUI-Control-/MCP-Kanal. Video wird weder gespeichert noch zum VPS gesendet. Audio und Mikrofon werden nicht erfasst. Bei statischem Bild sendet Windows weniger neue Frames; bei Minimierung der Quelle kann die Ausgabe stehen bleiben oder die Quelle verschwinden.

Der Fensterstream startet automatisch für die ausgewählte geöffnete Anwendung. Einen Einschalter gibt es nicht mehr. Alle drei Sekunden wird der Fensterstatus ohne Bildabfrage aktualisiert: extern geöffnete Quellen starten und geschlossene Quellen verschwinden automatisch. App-/Reiterwechsel, Ausblenden oder Minimieren der Werkbank stoppen die Video-Tracks; beim Wiederanzeigen startet der Stream erneut. Datenschutz und Not-Aus verhindern die Erfassung. Ein Fokuswechsel allein beendet den Stream nicht. Der Besitzer-Check bindet die Verbindung weiter an die genaue native Fensterinstanz. Aufnahmeberechtigung gibt es nur für die lokale Werkbank-Hauptseite in einer eigenen Electron-Session; Browserseiten, Mikrofon und Webcam-Anfragen bleiben gesperrt.

„Aktualisieren“ prüft Metadaten und versucht einen fehlgeschlagenen Stream erneut. Es fordert keine PNG-Bildfolge an. „GUI-Steuerung verbunden“ ist vom Videozustand getrennt. Die Werkbank ist eine Anzeige mit Auftragseingabe; direkte Bearbeitung erfolgt im nativen Fenster oder über Hermes/MCP.

Installation, geöffnetes Fenster und erreichbare Live-Verbindung sind getrennte Zustände. „GUI-Steuerung verbunden“ bestätigt den lokalen GUI-Kanal, nicht den MCP-Zustand auf dem VPS. Eine Headless-MCP-Instanz erzeugt keine Vorschau des geöffneten Editors. Liliths MCP-Konfiguration wird von dieser Integration nicht geändert.

## Bestehende GUI-Steuerung verbinden

Die Anwendung erkennt explizite `--control`-Argumente laufender bekannter Editor-Prozesse. Die TCP-Adresse muss Loopback sein und der Listener genau diesem GUI-Prozess gehören. PhotoCraft braucht zusätzlich dessen Token-Datei, PdfCraft eine Endpoint-Datei mit passender PID. Alternativ kann Lilith den vorhandenen Kanal über die authentifizierte lokale API registrieren:

```powershell
.\control.ps1 -Action artcraft
.\control.ps1 -Action workbench -State on -Tab artcraft
.\control.ps1 -Action artcraft-select -App photo
.\control.ps1 -Action artcraft-link -App photo -Port <bestehender-GUI-Port> -TokenFile '<absoluter lokaler Token-Dateipfad>'
.\control.ps1 -Action artcraft-link -App pdf -EndpointFile '<absoluter lokaler Endpoint-Dateipfad>'
.\control.ps1 -Action artcraft-open -App photo
```

IDs: `photo`, `vector`, `design`, `deck`, `grid`, `word`, `cad`, `light`, `sound`, `effect`, `film`, `pdf`. Kein frei angegebener Host, Befehl, EXE-Pfad oder Schlüsseltext ist möglich. Lokale Registrierungen bleiben unter `.local/artcraft/artcraft-connections.json`. Tokens, Commandlines und Bilder erscheinen nicht in API-Statusantworten. `GET /v1/artcraft` liefert den zuletzt geprüften bereinigten Status; neue Bildprüfung erfolgt ausdrücklich in der Werkbank.

Neu aus der Werkbank gestartete Programme erhalten einen lokalen GUI-Control-Kanal, bei Photo eine eigene Token-Datei und bei Pdf eine Endpoint-Datei. Bereits laufende Programme ohne aktiven GUI-Control-Kanal lassen sich zeigen und über Hermes beauftragen; ihre Vorschau meldet ehrlich „Live nicht angebunden“. Bestehende Fenster werden nicht neu gestartet. MCP-Server müssen ausdrücklich zur gleichen GUI verbinden; insbesondere VectorCraft kann ohne `--connect` auf Headless ausweichen. PdfCrafts lokale UI-Steuerung ist separat von seinen MCP-Dokumentwerkzeugen.

## Verifikation

Echter Test der installierten PhotoCraft 0.6.0: authentifizierter GUI-Kanal, passive PNG-Vorschau 1440×900 in der nativen Electron-Werkbank, App-Auswahl, Auftragseingabe und Datenschutzschalter. Die anderen elf Vorschauadapter wurden anhand ihrer versionsgebundenen Protokolle mit kontrollierten TCP-Antworten geprüft; noch kein Ende-zu-Ende-Nachweis ihrer jeweiligen Hermes-MCP-Einrichtung. Keine Nutzerdokumente geändert.


Video-Test: echte PhotoCraft-GUI als MediaStream 1440×900, sichtbare nicht schwarze Bildinhalte. Eine separat gekennzeichnete animierte native Testansicht lieferte 67 Frames in 2,2 Sekunden. Ausschalten beendet Tracks; Reiterwechsel, Datenschutz und Ausblenden stoppen die Erfassung. Electron 40.10.2, keine zusätzliche Abhängigkeit. Grundlage: https://www.electronjs.org/docs/latest/api/desktop-capturer und https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts.
