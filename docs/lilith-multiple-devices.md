# Lilith auf Windows, Zorin und Android

Stand vom 13.10.2026 aus Patriks Erweiterungsauftrag. Windows- und ein erster nativer Zorin-Client sind implementiert; der Zorin-Client ist auf dem Notebook bereitgestellt. Android ist noch nicht implementiert. Persönliche Netzwerkadressen und Zugangsdaten stehen ausschließlich in lokalen Notizen, nicht in diesem Dokument.

## Gewünschte Zusammenarbeit

Ein bestehender VPS-Hermes begleitet Patrik auf drei Geräten. Jedes Gerät hat seinen eigenen Client, seine eigenen freigegebenen Mikrofone/Lautsprecher und seinen eigenen Desktop-Kontext. Ein Remote-Desktop-Fenster ersetzt keinen Linux-Client. Ein Auftrag vom Notebook verwendet zunächst das Notebook als Ziel; „auf dem Windows-PC“ wählt ausdrücklich den PC. Das Handy kann einen konkreten Auftrag auf einem verfügbaren anderen Gerät veranlassen und sein Ergebnis anzeigen.

Geräteübergreifend sollen Gesprächskontext, Projektzuordnung und Auftragszustand zusammenpassen. Ein Projekt besitzt pro Gerät eine ausdrücklich registrierte lokale Wurzel; derselbe Projektname ist keine Freigabe, einen Windows-Pfad unter Linux zu interpretieren. Dateiinhalte synchronisieren sich nicht allein durch MCP. Versionsverwaltung oder eine gesondert gewählte Dateisynchronisierung halten Arbeitskopien konsistent. Zwei Geräte bearbeiten nicht automatisch dieselbe Datei.

## Gemeinsamer Auftragsvertrag

Vor Ausführung benötigt ein Auftrag eine feste Job-ID, das anfragende Gerät, das Zielgerät, die dortige bestätigte Client-Instanz und optional Projekt-/Dateiauswahl. Der Zielcomputer bleibt bis zum Ende gebunden. Eine Unterbrechung erreicht den tatsächlichen Besitzer; Gerätewechsel, Netzwerkwechsel oder neue Oberflächen wählen keinen Ersatzcomputer. Offline/gesperrt bleibt sichtbar und löst keinen heimlichen Fallback aus.

Die Windows-Queue und Desktop-Sperre sind aktuell lokal. Daher zuerst eine gemeinsame serverseitige Auftragszuordnung/Serialisierung entwerfen und am bestehenden Gateway prüfen. Mehrere offene Clients dürfen keine konkurrierenden Turns in derselben Runtime-Session starten. Geräte können zur gleichen persönlichen Hermes-Umgebung gehören, ohne blind einen identischen laufenden Runtime-Turn zu übernehmen.

Für die ausdrücklich gewünschte Übergabe „Ich wechsel aufs Notebook“ ist
inzwischen eine eigene Koordination im Quellbaum implementiert: gespeicherte
Session/Profil, private Client-ID, bestätigte Zielauswahl und atomarer
Besitzwechsel. Zwei echte Client-Controller bestehen die Übergabe in beiden
Richtungen gegen einen lokalen HTTP-/SQLite-Server mit synthetischer
Testidentität. Die Gateway-Erweiterung und beide Clients sind nun aktualisiert;
drei reale Übergaben PC → Notebook → PC mit gleicher Session, Verlauf und
Eingangsumschaltung sind bestätigt. Der bestehende
Basic-Provider verwendet jetzt einen privaten dauerhaften Signaturschlüssel,
damit weitere Dashboardneustarts die Anmeldung erhalten können.
[Bedienung und Status](session-handoff.md),
[Serverbereitstellung](session-handoff-server.md). Das ersetzt noch nicht die
vollständige geräteübergreifende Zuordnung aller lokalen Aufträge.

Ein Client verbindet sich ausgehend mit dem bestehenden authentifizierten HTTPS/WSS-Gateway. Es werden keine Loopback-Steuerungstokens veröffentlicht. PC-/Notebook-Funktionen sind nur verfügbar, wenn das betreffende Gerät und der tatsächlich freigegebene Desktop erreichbar sind. Das Handy braucht für reine VPS-Anfragen keinen laufenden PC.

## Zorin: Shell und Desktop getrennt prüfen

1. **Linux-Dateien und Programme:** bestehendes SSH über Tailscale für Quellarbeit, Git, Builds und CLI-Aufträge. MCP macht diesen tatsächlichen Zugang für Hermes als Werkzeug verfügbar. Ein [SSH-MCP](https://github.com/tufantunc/ssh-mcp) bietet Hostprofile, Shell-Sitzungen und Dateiübertragung; Auswahl und konkrete Hermes-Einbindung müssen erst geprüft werden. Eine vorhandene SSH-Anbindung wird bevorzugt wiederverwendet.
2. **Linux-Oberfläche:** ein Helfer in der angemeldeten grafischen Benutzersitzung beobachtet/bedient freigegebene Fenster. Eine SSH-Shell allein ist kein Nachweis für Desktop-, Mikrofon- oder Lautsprecherzugriff. Vor Auswahl eines Desktop-MCP die tatsächliche Zorin-Version, GNOME/XFCE und Wayland/X11 ermitteln.

Zorin nennt für Core/Pro GNOME und für Lite XFCE. Zorin 18.1 basiert auf Ubuntu 24.04 LTS; 17.3 auf Ubuntu 22.04 LTS. Das beschreibt die veröffentlichten Varianten, nicht die noch ungelesene Installation auf Patriks Notebook. Quelle: [Zorin technische Details](https://zorin.com/os/details/).

Unter Wayland kann der [XDG RemoteDesktop-Portalweg](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html) Bildschirm-/Eingabesitzungen vermitteln. Ein [Wayland Computer Use MCP](https://github.com/ziggy42/wayland-computer-use-mcp) beschreibt Screenshots und Eingabe über diesen Umfeldweg; sein Autor nennt Tests auf Ubuntu 26.04/GNOME, keine bestätigte Zorin-Kompatibilität. Er ist deshalb ein Prüfkandidat, keine zugesicherte Installation. X11 und GNOME-Accessibility haben andere Verträge; nicht pauschal KDE-/COSMIC-spezifische Werkzeuge auf Zorin einsetzen.

## Linux-Client statt Windows-Binärdateien kopieren

Gateway, Gesprächslogik und große Teile der lokalen HTML/CSS-Werkstatt sind Ansatzpunkte zur Wiederverwendung. Der aktuelle Start in `package.json`/`launch.ps1`, Modellprozesse in `engines.cjs`, Python-Venv-Pfade in `main.cjs`, Windows-API-Helfer und Desktop-Hinweise sind plattformspezifisch. Eine ungeprüfte Kopie ist daher keine funktionsfähige Linux-App.

Erster Linux-Lieferumfang: Anmeldung, Projekte/Dateiauswahl, Textaufträge, Auftragsdarstellung und lokale Audioeingabe/-ausgabe. Native Helfer werden gezielt nach Plattform bereitgestellt; fehlende Funktionen bleiben als nicht verfügbar erkennbar. Die Stimme und lokale Modellgröße werden nach Notebook-CPU/GPU und tatsächlicher deutscher Audioprüfung gewählt. Kamera/Wakeword sind zusätzliche ausdrücklich zu prüfende Fähigkeiten.

Electron unterstützt auf Linux unterschiedliche Bildschirm-/Tastenkürzelwege. Unter PipeWire liefert `desktopCapturer.getSources` die gewählte Capture-Quelle statt der Windows-Fensterliste; Wayland-Tastenkürzel hängen vom Desktop-Portal und dessen Identität ab. Quellen: [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer), [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut/). Eigene Desktop-Overlays, Zeigerpositionen und gemischte DPI werden am realen Notebook separat geprüft.

## Zugang zum Notebook

Nach Freigabe am 13.10.2026 wurde die tatsächliche Tailscale-SSH-Anmeldung als `patzi` auf dem erwarteten Notebook bestätigt. Lesende Prüfung: Zorin OS 18.1, x86_64, aktive lokale X11-Sitzung, Ryzen 9 5900HX, 15379 MiB RAM und RTX 3070 Mobile/Max-Q sowie integrierte Radeon-Grafik. Python 3.12.3, Git 2.43.0 und Flatpak 1.14.6 sind installiert; Node.js/npm fehlen. Das bestätigt den Quell-/Shell-Zugang und gelesene Systemmetadaten, keine funktionierende Lilith-GUI, Tonaufnahme oder Desktop-MCP. Es wurden keine Pakete installiert oder Geräte aktiviert.

Weitere lesende Prüfung: GNOME Shell 46, PipeWire 1.0.5, WirePlumber 0.4.17 und XDG Desktop Portal 1.18.4 sind vorhanden. `nvidia-smi` scheitert mit `Driver/library version mismatch` (NVML-Bibliothek 580.178); GPU-Inferenz ist deshalb noch nicht bereit nachgewiesen. Kein Neustart oder Treiberwechsel wurde ausgelöst. Tailscale-Version 1.104.1.

Vor der Freigabe am 13.10.2026 antworteten das bekannte Notebook über Tailscale und TCP-Port 22. Der normale SSH-Dienst beantwortete die Anmeldung, akzeptierte jedoch den angebotenen Zugang für `patzi` nicht. Anschließend hat Patrik den Tailscale-SSH-Zugang freigegeben; die Anmeldung ist nun wie oben beschrieben bestätigt. Routerfreigaben oder Passwortübertragung waren dafür nicht erforderlich.

Als möglicher Einstieg kann Patrik am Notebook `sudo tailscale set --ssh` ausführen. Tailscale muss dort installiert/angemeldet sein und die Tailnet-Regeln müssen den Zugriff erlauben. Das schaltet den Tailscale-SSH-Server für seine Tailscale-Adresse ein; es ist kein Desktop- oder Audiozugang. Nach Freigabe eine lesende Anmeldung prüfen. Quelle: [Tailscale SSH](https://tailscale.com/docs/features/tailscale-ssh). Alternativ bleibt normaler OpenSSH mit ausdrücklich eingerichtetem Schlüssel über Tailscale möglich.

## Beobachteter Windows-RDP-Fall

Patrik benutzt das Notebook derzeit als RDP-Client für Windows und möchte Mikrofone ausdrücklich nicht über RDP weiterreichen. In der untersuchten Lilith-Sitzung wurden kein Capture-Gerät, deaktivierte Wakeword-Schärfung und fehlende PCM-Blöcke gemeldet. Renderer, Modelle und Hermes-Transport meldeten Bereitschaft. Der laufende Lilith-Prozess war der tatsächlich bestätigten RDP-Sitzung zugeordnet. Automatische Mikrofonreparaturen konnten ohne verfügbares Gerät keine Bereitschaft belegen.

Das ist kein Anlass, ein anderes Mikrofon zu wählen, RDP-Einstellungen umzuschalten, Sessions zu transferieren oder Gateway/Modelle neu zu starten. Nach Rückkehr an den lokalen Windows-Desktop den gespeicherten Eingang und neue PCM-Blöcke prüfen. Die Diagnose „Sprache prüfen“ bleibt so lange korrekt, wie der gewünschte Eingang nicht verfügbar ist. Lokale Hardware-Wiederherstellung ist noch nicht bestätigt.

## Tatsächlich bereitgestellt am 13.10.2026

Der NVIDIA-Konflikt war ein noch geladenes Modul 580.173.02 bei bereits installierter Bibliothek und Kernelmodul 580.178.04. Nach Patriks Neustart erkennt `nvidia-smi` die RTX 3070 mit 580.178.04 und 8192 MiB; auch Vulkan listet diese GPU korrekt. Es wurden keine Treiber deinstalliert oder ausgetauscht.

Node.js 24.21.0 (offizielle Prüfsumme geprüft), Electron 40.10.2 und Python-Werkzeuge wurden im Benutzerverzeichnis eingerichtet. Vorhandene Qwen-/Whisper-Quellen, ausdrücklich benötigte private Modelle und das Stimmenverzeichnis wurden direkt zum Notebook übertragen. Beide nativen Server wurden mit Vulkan gebaut und antworten auf Loopback. Die vorhandene Stimme erzeugte den bekannten Probesatz; die lokale STT erkannte ihn korrekt. Ein eigener echter Electron-Gerätetest öffnete den Systemstandard-Mikrofoneingang, erhielt zwölf PCM-Blöcke mit 24576 Samples bei 48 kHz und schloss den Eingang danach. Es wurde kein Mikrofoninhalt gespeichert oder übertragen. Das belegt Modellerzeugung, Erkennung und zugängliche lokale Aufnahme; ein tatsächlich gehörter Lautsprecher und ein gesprochener Auftrag im produktiven Client sind noch separat zu prüfen.

Der [Linux-Client](linux-client.md) startet in der echten X11-Sitzung und besitzt einen Eintrag „Lilith“ im Anwendungsmenü. Er übernimmt die Werkstatt/Projektbibliothek und verbindet sich mit dem bestehenden Hermes. Die Namenszuordnung des vorhandenen Gateways gilt innerhalb der App für Electron und WebSocket; der normale Browser braucht weiterhin eine eigene funktionierende DNS-/hosts-Zuordnung. Die Anmeldung wurde in einem frischen echten Electron-Fenster auf dem Notebook als geladene Passwort-Anmeldeseite bestätigt. Die persönliche Anmeldung selbst muss Patrik dort vornehmen.

Der [Linux-MCP](linux-mcp.md) läuft als Benutzer-Systemd-Dienst an der Tailscale-Adresse, geschützt durch eine private Token-Datei. Zehn Tests wurden auf dem Notebook bestanden, einschließlich echter Screenshot-/Maus-/Tastaturereignisse im eigenen Testfenster, Authentifizierung und Zeitlimit mit abgekoppelten Kindprozessen. Die Hermes-Registrierung wurde mit `--enroll-mcp` direkt aus dem lokal angemeldeten Client vorgenommen; der Token wurde nicht nach Windows kopiert. Der anfängliche Gateway-Timeout fiel mit dem offline gemeldeten VPS-Tailscale-Peer zusammen. Nach Patriks Aktivierung waren beide Geräte online und der native Gateway-Test bestätigte sechs Notebook-Werkzeuge. Der bestehende MCP-Katalog wurde ohne Gateway-Neustart neu geladen; die frische authentifizierte Statusabfrage bestätigt `lilith-zorin` als `connected`. Die App prüft den eingerichteten MCP nach der Anmeldung automatisch und meldet bei fehlender Bestätigung weiterhin ausdrücklich nicht verbunden. VPS-Daten dürfen kein Notebook-Ergebnis vortäuschen.

Die automatische Prüfung hatte trotz Patriks Freigabe eine über den Gateway vermittelte VPS-Shell-Diagnose abgewiesen. Die MCP-Verbindung wurde anschließend über den tatsächlichen nativen Client und Patriks Tailscale-Aktivierung bestätigt. Direkte SSH-Versuche zum VPS akzeptieren den vorhandenen Schlüssel weiterhin nicht, auch mit dem von Patrik genannten Benutzer `root`. Damit sind dessen Hardware und Gateway-Binding noch nicht lesend geprüft. VPS-Dienste wurden weder neu gestartet noch aktualisiert.

Der Linux-Client startet nun als transparenter Orb und klappt sein Gespräch bei Bedarf auf; die Werkstatt bleibt ein eigenes Fenster. Ein echter Electron-Test auf Zorin bestätigt transparente Pixel und die unveränderte Testfläche hinter dem Orb im X11-Compositor, einschließlich GPU-Pfad. Gespräch und Orb behalten denselben Renderer; nach dem Schließen kehrt er an seine vorherige Position zurück. Der eigene Client wurde bei bestätigtem Leerlauf neu gestartet, ohne Session oder Audioeinstellungen zurückzusetzen.

Der letzte Windows-Gesamttest ergab 909 Tests: 904 bestanden, fünf optionale übersprungen, keine Fehler. Ein bestehender Graph-Test wurde an die tatsächliche Reduced-Motion-Umgebung angepasst, ohne Produkt- oder Nutzereinstellungen zu ändern. Die Skills `hermes-linux-control` und `hermes-voice-control` wurden im bestehenden Gateway-Profil aktualisiert, mit Backup/Vergleich und vollständigem normalisierten Readback geprüft sowie als aktiviert bestätigt.

## Privater Zugang und zentrale Sprache

Tailscale ist für die Verbindung von Notebook, PC, Smartphone und Hermes
geeignet, wenn die Geräte online und im freigegebenen Tailnet angemeldet sind.
Der Notebook-MCP verwendet diesen Weg bereits. Das Gateway nutzt derzeit noch
seinen bisherigen Host mit Zuordnung ins Heimnetz. Ein bloßes Tailscale-Login
schließt bestehende öffentliche Webzugänge nicht und macht diese Heimnetz-URL
nicht automatisch mobil erreichbar.

Für einen privaten Gateway-Zugang den tatsächlichen lokalen Hermes-Endpunkt
ermitteln und über [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
mit Tailnet-HTTPS bereitstellen. Zugriffsregeln auf die gewünschten Geräte
begrenzen; bestehende Hermes-Anmeldung beibehalten. Vorhandene öffentliche
Bindings/Proxys erst nach bestätigtem privaten Zugriff gezielt umstellen. Dieser
Gateway-Umbau wurde noch nicht vorgenommen. Der VPS-Zugang ist inzwischen
bestätigt; Gesprächsübergabe und Anmeldestabilität sind darüber bereitgestellt.

Spracherkennung und Sprachausgabe können auf einem zentralen Rechner laufen;
die vorhandenen Whisper-/Qwen-Quellen unterstützen CPU- und GPU-Ausführung.
Dann bleiben am Client Mikrofon, Wiedergabe, Orb, Werkstatt und lokale
Gerätehelfer. Die Modelle benötigen ausreichend Rechenleistung auf dem Server;
eine GPU ist keine absolute Voraussetzung, die Latenz muss mit der gewünschten
Stimme gemessen werden. Der aktuelle Client erlaubt Sprach-Endpunkte nur auf
Loopback. Zentraler Betrieb braucht einen ausdrücklich authentifizierten
Audio-Transport, Abbruch-/Datenschutz-/Gerätezuordnung und einen gemessenen
Serverbetrieb; ein Austausch der URL allein reicht nicht. Bis zu dieser Prüfung
bleibt die bestätigte lokale GPU-Verarbeitung aktiv.

## Noch offen

Privaten Gateway-Zugang einrichten. Der geprüfte VPS hat vier CPU-Kerne, rund
8 GB RAM und keine erkannte GPU; die bestätigten Sprachmodelle bleiben vorerst
lokal. Die Gesprächsübergabe per Knopf ist bestätigt; einen ausdrücklich
gesprochenen Übergabeauftrag mit gehörter Notebook-Ausgabe noch prüfen.
Gemeinsamen Auftragsvertrag
ergänzen. Pixel-Client und optionalen Android-MCP gemäß
[Mobile-Entwurf](lilith-jarvis-and-mobile.md) anschließen. Keine Geräteintegration
wird allein aus einem offenen Netzwerkport als erfolgreich bezeichnet.
