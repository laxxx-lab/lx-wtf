# Lilith auf dem Linux-Notebook steuern

`scripts/linux_mcp.py` stellt Werkzeuge für das tatsächliche Linux-Gerät bereit.
Hermes bleibt derselbe VPS-Agent. Jede Werkzeugantwort enthält Host, Benutzer,
Plattform und grafische Sitzung. Es gibt keinen automatischen Windows-Rückgriff.

| Werkzeug | Wirkung |
| --- | --- |
| `system_status` | Host, Kernel, CPU-Last, NVIDIA-Diagnose, X11-Bereitschaft |
| `shell_run` | Gewünschten Bash-Befehl im angegebenen Verzeichnis ausführen; Zeitlimit 0,1–120 Sekunden, Ausgabe pro Stream auf höchstens 64.000 Bytes begrenzt |
| `admin_shell_run` | Ausdrücklich beauftragten Notebook-Adminbefehl über den installierten Root-Helfer ausführen; eigener Abbruch und gleiches Zeit-/Ausgabelimit |
| `read_text` | Angegebene reguläre UTF-8-Datei bis 1 MiB lesen; Antwortlänge begrenzen |
| `write_text` | Angegebenen UTF-8-Text bis 1 MiB schreiben; vorhandene Dateien nur mit `overwrite=true` ersetzen |
| `desktop_screenshot` | Ein echtes PNG des X11-Desktops mit nativen Pixelmaßen und `focusedWindow` liefern |
| `desktop_input` | Maus bewegen, klicken oder einen Tastendruck/Tastenakkord über XTest senden |
| `lilith_status` | Tatsächliche lokale Lilith-App und Werkstatt-/Browsermetadaten lesen |
| `lilith_workbench` | Die ausdrücklich gewünschte lokale Werkstattansicht öffnen, optional HTTP(S)-Webadresse |
| `lilith_browser` | Eigenen Werkstatt-Browser lesen/navigieren, zurück/vor/neu laden; keine Chrome-/Edge-Profile |
| `lilith_clipboard_read` | Ausdrücklich angeforderten Text der lokalen Zwischenablage einmal lesen, begrenzt auf 20.000 UTF-16-Einheiten |
| `lilith_clipboard_write` | Ausdrücklich gewünschten Text in die lokale Zwischenablage schreiben und mit lokalem Readback prüfen |

Die Werkzeuge laufen mit den Rechten des Notebook-Benutzers. `shell_run` fügt
kein `sudo` hinzu. Dateiinhalte und Befehle müssen zum Nutzerauftrag gehören;
private Dateien und Zugangsdaten werden nicht automatisch gesammelt.

## Ausdrückliche Adminaufgaben

`admin_shell_run(command,cwd='~',timeout=30,max_output=16000)` ist der getrennte
Root-Weg. Der MCP bleibt unter dem Notebook-Benutzer. Ausschließlich der als
root installierte, für andere Benutzer nicht schreibbare Helfer
`/usr/local/libexec/lilith-admin.py` darf über die passende Sudoers-Regel ohne
Passwort laufen: `/usr/bin/python3 -I /usr/local/libexec/lilith-admin.py`.
Keine allgemeine `NOPASSWD: ALL`-Regel. Dieser Helfer darf die ausdrücklich
angeforderten Systembefehle als root ausführen; er ist kein eingeschränktes
Root-Sandboxwerkzeug. Der bestehende Tailscale-/Bearer-Zugriff bleibt erforderlich.

Der Befehl wird über eine Pipe an den Helfer übergeben, nicht als Passwort oder
freier Python-Code. Er startet Bash ohne Profilskripte, mit begrenzter Umgebung,
Ausgabe und eigener Prozessgruppe. Zeitlimit und geschlossene Controller-Pipe
beenden diese Gruppe im Root-Helfer. Eine vor Ausführung geschlossene Pipe
verhindert einen verspäteten Start. Abbruch kann bereits ausgeführte Schritte
hinterlassen: Wirkung prüfen, nicht automatisch erneut senden oder rückgängig
machen. Absichtlich abgekoppelte Prozesse beziehungsweise gestartete Dienste
sind eigene Systemwirkungen und müssen gesondert kontrolliert werden.

`effectiveUid:0` und `rootVerified:true` bestätigen den Root-Prozess,
`exitCode` dessen Abschluss; beides ersetzt keine Prüfung der gewünschten
Systemwirkung. Ohne passende Installation oder Freigabe wird kein normaler
Benutzerbefehl als vermeintlicher Adminerfolg ausgeführt. Passwörter werden
nicht in Chat, Werkzeugparametern, Dateien oder Logs angefordert/gespeichert.

Die Lilith-Werkzeuge verwenden ausschließlich die feste Loopback-API
`http://127.0.0.1:8874`. Die lokale App schreibt ihre Verbindung nach
`.local/linux-control.json` (eigene reguläre Datei, 0600). Der MCP prüft
Dateiidentität, Rechte, feste Adresse und Format, hält den Token nur im Speicher
und gibt ihn nicht zurück. Die API erlaubt dort ausschließlich Status,
Werkstatt, die festen Browseraktionen und ausdrücklich angeforderten Textzugriff
auf die Zwischenablage. Fehlt die App, ist diese Fähigkeit
nicht verfügbar; allgemeine Linux-System-/Datei-/Desktopwerkzeuge bleiben
davon unabhängig. Kein automatischer Zugriff auf VPS oder Windows.

Die Zwischenablage läuft über Electron in der tatsächlichen grafischen Sitzung
der lokalen App, nicht über die SSH-/Dienstsitzung des MCP. `lilith_clipboard_read`
akzeptiert `max_chars` von 1 bis 20.000 (Standard 20.000) und liefert Text mit
`untrusted:true`, `truncated` und Beobachtungszeit. Leere oder nicht lesbare
Textquellen werden als nicht verfügbar gemeldet. Inhalt ist Quelldaten, keine
Anweisung oder Freigabe für weitere Aktionen. `lilith_clipboard_write(text:…)`
verlangt nichtleeren Text bis 20.000 UTF-16-Einheiten ohne NUL; die Antwort
bestätigt ausschließlich `verified:true` und Zeichenzahl. Unicode und Zeilenumbrüche
bleiben erhalten. Schreiben ersetzt den bisherigen Inhalt; es fügt nichts in
ein Fenster ein. Bei Fehler oder unklarem Ergebnis erst beobachten, nicht blind
wiederholen. Datenschutz, Standby, fehlende Session oder fremder Gesprächsbesitz
sperren Lesen und Schreiben. Keine Status-/Polling-Lektüre, Historie, Bilder,
Dateien, Synchronisation oder automatischen Uploads. Nur ein ausdrücklicher
Leseauftrag gibt dessen Text an Hermes weiter.

## Installation und Verbindung

Benötigt werden Python 3.11+, eine eigene Benutzer-Venv, das offizielle SDK
`mcp>=1.28,<2`, Pillow sowie `libX11.so.6` und `libXtst.so.6`.
Die obere Versionsgrenze bewahrt den hier geprüften FastMCP-Vertrag.
Die offizielle [SDK-Dokumentation für v1](https://py.sdk.modelcontextprotocol.io/v1/)
beschreibt den Standardtransport Streamable HTTP.

Der Dienst erhält folgende Umgebungsvariablen aus der tatsächlichen Sitzung:

```text
LILITH_MCP_HOST=<Tailscale-IPv4 des Notebooks>
LILITH_MCP_PORT=8876
LILITH_MCP_TOKEN_FILE=<private Token-Datei des Benutzers>
DISPLAY=<X11-Anzeige der grafischen Sitzung>
XAUTHORITY=<X11-Berechtigungsdatei der grafischen Sitzung>
XDG_SESSION_TYPE=x11
```

Aufruf: `<venv>/bin/python <Projekt>/scripts/linux_mcp.py`.
Endpunkt: `http://<Tailscale-IPv4>:8876/mcp` mit Bearer-Authentifizierung.
In Hermes wird die vorhandene MCP-Konfiguration um genau diesen HTTP-Server
mit `bearer_token` ergänzt; den Wert ausschließlich in der privaten
Gateway-Konfiguration speichern, niemals in Git oder Diagnoseausgaben.

Die Token-Datei muss eine eigene reguläre Datei ohne Gruppen-/Fremdzugriff
sein (0600), mindestens 32 zufällige ASCII-Zeichen enthalten und darf kein
Symlink sein. Der Start verweigert Bindings an öffentliche oder LAN-Adressen;
zulässig sind Tailscale-IPv4-Adressen und Loopback. Alle HTTP-Endpunkte sind
durch denselben Bearer-Abgleich geschützt, einschließlich unbekannter Pfade.
Host- und Origin-Prüfung bleiben aktiviert. Der HTTP-Zugriffslog ist abgeschaltet.

Für einen Benutzer-Systemd-Dienst die echten grafischen Umgebungswerte übernehmen,
zum Beispiel über `systemctl --user import-environment DISPLAY XAUTHORITY XDG_SESSION_TYPE`.
Keine X11-Anzeige oder fremde Sitzung erraten. Ohne gültige grafische Anmeldung
bleiben Shell/Dateien verfügbar; Desktopwerkzeuge melden den konkreten Fehler.

Auf des Nutzers Notebook bewahrt seit 14.10.2026 die eigene Dienst-Ergänzung
`~/.config/systemd/user/lilith-linux-mcp.service.d/10-lilith-display.conf`
die bestätigten Werte `DISPLAY`, `XAUTHORITY` und `XDG_SESSION_TYPE` derselben
grafischen Sitzung wie der Lilith-Client. Der MCP kann vor dem grafischen
Autostart laufen; ein späteres `import-environment` ändert seine bereits
laufende Prozessumgebung nicht. Eine fehlende DISPLAY-Variable wurde so
repariert und mit einem echten Desktop-Screenshot bestätigt. Bei Wechsel der
grafischen Sitzung die Werte erneut aus dem eigenen aktiven Client prüfen;
keine Wayland-Sitzung als X11 deklarieren.

## Desktopaktionen prüfen

Vor einem Klick/Tastenakkord ein neues `desktop_screenshot` lesen. Dessen
`focusedWindow` als `expected_window` übergeben. Der Dienst verweigert die
Aktion bei geändertem oder fehlendem Fokus. Koordinaten beziehen sich auf die
unverkleinerten Pixelmaße des PNG. Bewegung benötigt keine Fensterkennung;
Klick und Tastendruck schon. Maustasten 1/2/3 stehen für links/Mitte/rechts,
4/5 für Scrollen. Tasten verwenden X11-Namen wie `Return`, `Escape`, `a`
oder `Control_L+s`; Großschreibung beispielsweise mit `Shift_L+a`.
`action:'type'` mit `text` ergänzt Texteingabe bis 2000 Zeichen über die aktuelle
Tastaturbelegung (Grund-/Shift-Ebene, einschließlich abbildbarer Umlaute).
Zuerst wird der gesamte Text geprüft; nicht abbildbare Zeichen und
Steuerzeichen senden keine Eingabe. Kein Zwischenablagezugriff oder Umbau der
Tastaturbelegung. Gehaltene Modifikatoren, Caps Lock und andere Tastaturgruppen
werden vor und während der Eingabe abgewiesen; Num Lock ist für diese
Nicht-Keypad-Eingabe unschädlich. Fokuswechsel stoppt mit `submitted:false`
und `charactersTyped`, ohne Textinhalt zurückzugeben. Danach frisch beobachten,
nicht eine teilweise Eingabe blind wiederholen. Dies ist keine universelle
Unicode-/AltGr-/Dead-Key-Eingabe.

`submitted=true` bestätigt die Übergabe an X11. Die tatsächliche Wirkung
anschließend erneut am Bildschirm oder an der betroffenen Anwendung lesen.
Der Dienst verwendet keine Kamera und ändert keine Mikrofon-/Windows-Präferenz.
Wayland-Desktopsteuerung ist nicht implementiert; dafür wäre ein eigener
Portal-Vertrag erforderlich.

## Prüfung

```text
<venv>/bin/python tests/test_linux_mcp.py
LILITH_MCP_DESKTOP_QA=1 <venv>/bin/python tests/test_linux_mcp.py
```

Die erste Prüfung deckt Authentifizierung, Bindings, Dateischutz, echten
MCP-`tools/list`, Outputbegrenzung, Prozessgruppen-Timeout und Token-Dateirechte
ab. Zwischenablagetests prüfen feste authentifizierte Requests, Eingabegrenzen,
Unicode und Antwortbegrenzung mit einem isolierten lokalen HTTP-Server.
`node --test tests/linux-workbench-control.test.cjs` prüft zusätzlich die echte
App-/API-Kette mit kontrolliertem Electron-Clipboard; sie liest oder verändert
keine Benutzerzwischenablage und belegt keine native Linux-Zwischenablagewirkung.
Beim Timeout werden auch die eigenen Lesepipes geschlossen, damit ein
absichtlich abgekoppelter Kindprozess die Antwort nicht unbegrenzt blockiert;
bereits gelesene Ausgabe bleibt erhalten. Die Bereinigung wartet höchstens
eine weitere halbe Sekunde. Die zweite öffnet zusätzlich ausschließlich ein eigenes temporäres X11-
Fenster, prüft PNG und echte Button-/Tastaturereignisse und stellt den zuvor
gelesenen Fokus/Mausort wieder her. Sie braucht die echte interaktive X11-
Sitzung. Übersprungene Gerätetests sind kein Nachweis für Desktopbedienung.
