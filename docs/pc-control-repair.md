# PC-Steuerung: Prüfung und Korrektur

Am 09.10.2026 wurde die tatsächlich angebundene Windows-Steuerung geprüft.
Der Cua-Daemon läuft im interaktiven Desktop; Lilith erreicht ihn vom VPS über
die bestehende SSH-/Named-Pipe-Brücke. Der MCP meldet 61 Werkzeuge als verbunden.

## Behobene Anweisungsfehler

Der Skill `windows-desktop-control` empfahl den direkten SSH-Start von
Store-Apps und wertete schon eine Prozessanzahl als Erfolg. Der tatsächliche
Spotify-Versuch lief in Dienstsitzung 0; der sichtbare Desktop liegt bei dieser
Prüfung in Sitzung 1. Die Regeln verwenden jetzt den interaktiven Cua-Daemon,
aktuell ermittelte AUMID/Startpfade und eine frische Fenster-/Ergebnisprüfung.
Ein unveränderter Fenstertitel gilt nicht mehr pauschal als fehlgeschlagener Klick.

## Spotify aus dem Microsoft Store

`Get-StartApps` bestätigt auf diesem PC die AUMID
`SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify`. Der vorhandene Cua-Treiber kann
die Store-App direkt damit starten:

```json
{"aumid":"SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"}
```

Dieses Argument gehört zu `mcp__cua_driver__launch_app`; ein Exe-Pfad ist dabei
nicht erforderlich. Der tatsächliche Aufruf öffnete **Spotify Premium** mit
PID199080 und Fenster-ID462328 in der interaktiven Sitzung1. Das bestätigt
den App-Start, keine bestimmte Wiedergabe. Die beiden Windows-/Spotify-Skills
enthalten jetzt den konkreten Startweg. Sprachaufträge, die Spotify nennen,
bekommen die App-ID zusätzlich als nur für diesen Auftrag geltenden Hinweis.
Wenn die Registrierung sich ändert, wird die neue AUMID einmal frisch ermittelt.

Spotify- und Desktop-Skills erlauben einen geeigneten UI-Ersatzweg, wenn die API
den bereits beauftragten Effekt nicht erzielt. Eine204-Antwort gilt nicht als
Wiedergabenachweis. Titel, Künstler, Gerät und aktuelle Wiedergabe werden geprüft.
Die Payload-Regeln entsprechen der [Spotify-Wiedergabe-Dokumentation](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback).

Sechs Dateien auf dem VPS wurden vor der Änderung auf unveränderten Inhalt
geprüft, gesichert und nach dem Schreiben vollständig zurückgelesen. Bei einer
zwischenzeitlichen Änderung durch Lilith stoppte die Prüfung zunächst; die
Korrektur wurde anschließend auf der aktuellen Fassung vorbereitet. Die lokalen
Originale, Entwürfe und Nachweise bleiben unter `.local/pc-audit/` ignoriert.

Die neue leere Session **Lilith · PC und Voice** verwendet
`/home/claw/.hermes` als Arbeitsverzeichnis. Ihr Kontextbericht bestätigt die
aktuellen AGENTS- und SOUL-Dateien als geladen. Die bisherige Session bleibt
erhalten. Kamera-, Bildschirm- und Stimmpräferenzen wurden beibehalten.

## Nachweise und offene Freigaben

Der Windows-Rechner wurde im sichtbaren Desktop geöffnet. Der VPS las über die
SSH-/Cua-Pipe-Kette denselben PID und dieselbe Fenster-ID zurück. Gezielte
Tastaturbedienung schloss ausschließlich dieses zuvor erzeugte Testfenster.
Dies prüft die Verbindung und lokale Bedienung; es ist kein zusätzlicher
autonomer Hermes-Chat-Test.

Spotify-Prozesse in Sitzung0 wurden nach dem manuellen Schritt des Nutzers
nicht mehr gefunden. Zuvor wurde das automatische erzwungene Beenden vom
sicheren VPS-Shell-Zugang abgewiesen. Der Helfer
`Repair-Spotify-Desktop.ps1` bleibt standardmäßig schreibgeschützt. Nur mit
`-StopServiceSession` und Administratorrechten beendet er erneut geprüfte
Spotify-Store-Prozesse in Sitzung 0; die interaktive Sitzung bleibt unberührt.
Der Nutzer bestätigte anschließend die Bereinigung. Der Store-App-Start ist
inzwischen geprüft; eine bestimmte Wiedergabe ist damit noch nicht bestätigt.

Direkter Browserprofilzugriff meldete `browser_consent_required`.
Der Nutzer bestätigte danach die Freigabe in Chrome und Edge; beide zeigten
lokale Debugging-Endpunkte. Die tatsächliche Tab-Bedienung ist weiterhin ein
separater Prüfschritt. Für Edge beschreibt Microsoft
die Checkbox unter [Inspect → Remote debugging](https://github.com/MicrosoftDocs/edge-developer/blob/main/microsoft-edge/web-platform/devtools-mcp-server.md#auto-connect-to-a-running-edge-instance);
für Chrome gilt der [entsprechende Browser-Freigabeablauf](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session).
Keine Profile wurden kopiert oder Sicherheitseinstellungen automatisiert.
