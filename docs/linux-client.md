# Lilith auf dem Zorin-Notebook

## Dauerhafter Start auf Patriks Notebook

Seit 14.10.2026 startet `~/.config/autostart/lilith.desktop` den eigenen
Benutzerdienst `lilith-client.service` bei der grafischen Zorin-Anmeldung.
`~/.local/share/applications/lilith.desktop` ist in der Taskleiste angeheftet.
Der Starter `~/.local/bin/lilith-start` übernimmt die tatsächliche grafische
Sitzungsumgebung; der Dienst verwendet den bestehenden Lilith-Launcher samt
privater Geräte-/Gateway-Konfiguration. Wiederholter Start erzeugt keine zweite
Dienstinstanz. Die gespeicherte Hermes-Anmeldung und Session werden wiederverwendet;
eine abgelaufene Anmeldung bleibt ausdrücklich sichtbar. Tailscale-SSH-Prüfungen
für Wartungszugriff sind davon unabhängig. Es wird weder eine Netzfreigabe noch
ein Passwort in den Starter geschrieben.

Der Linux-Einstieg `linux-main.cjs` verwendet denselben VPS-Hermes und die
bestehenden Module `gateway.cjs`, `conversation.cjs`, `reply.cjs`,
`voice-client.cjs`, `transcription.cjs`, `project-library.cjs` und `workbench.cjs`.
Es wird kein Ersatzagent installiert. Windows-Einstellungen werden nicht
übernommen. Eine Gesprächsübergabe übernimmt ausschließlich die ausdrücklich
gewählte Hermes-Session; die Oberfläche gehört zur lokalen Notebook-Sitzung.

## Einrichtung und Start

Node.js 20 oder neuer, npm, Electron und die bestehenden npm-Abhängigkeiten
müssen auf dem Notebook installiert sein. Den Linux-Quellbaum und ausdrücklich
benötigte private Sprachmodelle/Referenzstimme lokal bereitstellen. Native
Modellpfade und Buildvertrag stehen in [Linux-Sprachruntime](linux-runtime.md).
`./scripts/setup-linux-runtime.sh --check` prüft den vorhandenen Aufbau; das
Script installiert keine kostenpflichtigen Dienste.

In der angemeldeten grafischen Benutzersitzung `bash ./launch-linux.sh` starten.
`bash ./launch-linux.sh --login` öffnet bei fehlender Anmeldung direkt das
eigene Gateway-Anmeldefenster; bei bereits laufender Lilith erreicht der
Parameter deren vorhandene Instanz. Ladefehler zeigen den echten Chromium-
Fehlercode und schließen das erfolglose Anmeldefenster samt Poller.
Der Launcher verlangt DISPLAY oder WAYLAND_DISPLAY. Eine SSH-Verbindung allein
ist keine Audio-/GUI-Prüfung. Die Gateway-Adresse kann beim Start über
`LILITH_GATEWAY_URL` oder in **Verbindung & Audio** eingetragen werden. Über
**Anmelden** öffnet sich das echte bestehende Hermes-Gateway. Dessen Anmeldung
bleibt im eigenen persistenten Linux-Electron-Profil. Cookies werden weder aus
Windows kopiert noch als CLI-Argument ausgegeben.

Falls der vorhandene Gateway-Hostname auf Linux noch nicht auflösbar ist,
`LILITH_GATEWAY_HOST_MAP=hostname=IP` beim Start verwenden (alternativ
`LILITH_GATEWAY_IP` für exakt den konfigurierten Host). Das validiert einen
einzigen Host und eine echte IP und gilt sowohl für Electron-HTTPS als auch
Node-WebSocket. URL, Host-Routing, TLS-Prüfung und Cookies behalten den
ursprünglichen Gateway-Host. Es wird keine systemweite hosts-Datei geändert.

## Notebook-Werkzeuge direkt verbinden

Sind der lokale Linux-MCP-Dienst und seine private Token-Datei eingerichtet,
setzt der Launcher `LILITH_MCP_URL` (Tailscale-IPv4, Port 8876, `/mcp`) und
`LILITH_MCP_TOKEN_FILE` (absoluter lokaler Pfad, eigener Besitzer, 0600).
Nach der lokalen Hermes-Anmeldung **Notebook-Werkzeuge verbinden** wählen.
Bei eingerichteten Launcher-Variablen prüft die App diese Verbindung auch
automatisch nach ihrer Anmeldung; ein passender bestehender Eintrag wird nur
getestet. Bei einem Fehler bleiben Status und manuelle Prüfung sichtbar.
Alternativ `bash ./launch-linux.sh --enroll-mcp` verwenden. Bei laufender App
erreicht der Parameter dieselbe Instanz; beim ersten Start wartet er auf die
lokale Gateway-Anmeldung. Er ruft exakt dieselbe lokale Registrierungsaktion
auf und gibt keine Tokenwerte aus. Der bestätigte Status steht in
`.local/linux-status.json` unter `notebookTools`.
Der authentifizierte Notebook-Client liest das Token selbst und übermittelt
es direkt an den bestehenden Gateway. Der Wert gelangt nicht in Renderer,
Windows-Einstellungen, Toolausgaben, Logs oder Git.

Der feste Name `lilith-zorin` wird nur hinzugefügt, wenn kein Eintrag dieses
Namens existiert. Ein anderer Zielserver wird nicht überschrieben. Ein
passender Eintrag wird lediglich geprüft; dessen gespeichertes Token wird
nicht ersetzt. Erst `mcp.servers.test` mit bestätigtem `ok` und Werkzeugliste
zeigt „verbunden“. Gatewaywechsel oder Datenschutz während der Anmeldung
stoppen die nächsten Requests; der Auftrags-/Sessionzustand wird nicht für
die Registrierung gewechselt.

Jeder Notebook-Auftrag bindet sein physisches Ziel und den tatsächlich
beobachteten MCP-Status in den Prompt. Das allgemeine Hermes-`terminal` läuft
auf dem VPS und ist kein Notebook-Werkzeug. Hardware und Linux-Fähigkeiten
müssen über ein frisches `system_status` des Servers `lilith-zorin` bestätigt
werden. Ohne bestätigte Notebook-Werkzeuge wird deren Zugriff als nicht
verfügbar beschrieben; VPS-/Windows-Fallbacks dürfen kein Notebook-Ergebnis
vortäuschen.

Eine eigene Notebook-Session wählen. Der Client nimmt beim Start keine laufende
Windows-Session automatisch wieder auf. Ohne den bereitgestellten
Übergabekoordinator dürfen gleichzeitige Clients nicht unkoordiniert dieselbe
Session verwenden. `Conversation.select` übernimmt den
vom Gateway gemeldeten Running-Zustand; der Client stellt Unterbrechung als
angefordert dar, bis ein Terminalereignis bestätigt wird.

Eine ausdrücklich im Notebook gewählte Session wird privat in
`.local/linux-session.json` gespeichert (`id`, `profile`, `title`,
`gatewayUrl`). Beim Neustart wird nur diese Auswahl wieder geöffnet, nachdem
Gateway und aktuelle Sessionliste ID und Profil bestätigen. Ohne diese lokale
Auswahl wird keine Default-Session angenommen. Windows-Einstellungen werden
weiterhin nicht gelesen. Bei einem anderen Gateway oder einer nicht mehr
angebotenen ID bleibt die App verbunden und zeigt die Sessionauswahl.

## Gespräch ausdrücklich übergeben

**Gespräch an PC übergeben** und „Ich wechsle zurück an den PC“ verwenden
denselben lokalen Ablauf. Am PC ist die Gegenrichtung „Ich wechsel aufs
Notebook“. Fragen, Verneinungen und hypothetische Formulierungen lösen keine
Übergabe aus. Es wird kein Modellauftrag aus dem Übergabebefehl erzeugt.

Voraussetzung ist der authentifizierte Koordinator unter
`POST /api/lilith/handoff` am bereits verwendeten Hermes-Gateway. Die lokale
Anmeldung stellt dafür ihre vorhandenen Cookies bereit; die Geräte kopieren
keine Tokens. Beide Clients registrieren ihre Bereitschaft und fragen den
Übergabestatus alle zwei Sekunden ab. Am 13.10.2026 wurden die Serverroute und
beide eigenen Clients aktualisiert. Drei echte Übergaben PC → Notebook → PC
mit Anmeldung, derselben Session/Profil und sichtbarem Verlauf sind bestätigt.
Bei Übernahme bleibt der kompakte Orb erhalten; der Verlauf wird bereitgestellt,
ohne das Gesprächsfenster automatisch aufzuklappen.
Nach bestätigtem Besitzwechsel meldet sich das Ziel einmal mit der lokalen
Lilith-Stimme: „Ich bin jetzt hier, Boss.“ Es gibt dafür keinen Modellauftrag
und keine Wiederholung bei Polls, Wiederverbindung oder gewöhnlichem Neustart.
Bei einem Server ohne Route zeigt HTTP 404 weiterhin
„Gesprächsübergabe am Gateway noch nicht verfügbar“ und deaktiviert den Knopf.
Diese Anzeige ist keine bestätigte Übernahme.

Die Quelle wartet auf vorhandene Aufträge, Aufnahme, Transkription und echte
Wiedergabe. Neue Einsendungen für dieses Gespräch sind währenddessen gesperrt.
Die laufenden lokalen Aufträge bleiben auf ihrem ursprünglichen Gerät. Das
Ziel prüft Verbindung, Profil, Datenschutz und Leerlauf, öffnet genau die
gespeicherte Session-ID und liest anschließend `session.history` mit ihrer
bestätigten Runtime-ID. Der Renderer zeigt ausschließlich sichtbare Texte von
Nutzer und Assistent; alte Nachrichten werden nicht erneut eingesendet.
Mikrofonwahl und Datenschutz werden durch die Übernahme nicht verändert.
Nach der bestätigten Begrüßung öffnet das Ziel den Sprachdialog automatisch;
die Übergabe ist die ausdrückliche Freigabe für diesen lokalen Gesprächskanal.

Der bereits geöffnete Live-Kanal hört auch während Hermes denkt oder Lilith
spricht. Ein erkanntes „mhm“, „aha“ oder „verstehe“ senkt die Stimme kurz ab
und lässt den Auftrag weiterlaufen. Eine neue Frage stoppt die alte Ausgabe
und fordert die Unterbrechung des aktuellen Gesprächszugs an. Erst ein echtes
Abschlussereignis und `busy:false` erlauben den nächsten Auftrag. Bei unklarem
Stopp pausiert Live sichtbar; den Satz erst nach Prüfung wiederholen.
Bereits ausgeführte Schritte werden nicht rückgängig gemacht oder automatisch
nochmals gestartet. Session, Mikrofonwahl und Datenschutz bleiben erhalten.

Linux verwendet dafür die vorhandene PCM-Pausenerkennung mit stärkerer
Lautstärkeschwelle während einer Antwort, mindestens 240 ms Sprachsignal und
lokaler Transkription. Echo-Unterdrückung wird beim Mikrofon angefordert;
der RMS-Kandidat allein unterbricht keinen Auftrag. Das ist keine zusätzliche
neuronale Live-VAD und keine zugesicherte Erkennung menschlichen Dazwischenredens
bei Lautsprecher-Echo. Renderer- und Hauptprozesstests prüfen Ablauf und
Stoppbestätigung; Mikrofon, Raum-Echo und hörbare Notebook-Ausgabe brauchen
zusätzlich einen echten Test in der grafischen Sitzung.

Erst eine dauerhafte `committed`-Bestätigung schaltet die Quelle für dieses
Gespräch passiv. Der andere Client kann weiterhin eigene Gespräche wählen.
Auf einem passiven Gespräch stoppt **Stopp** nur die lokale Ausgabe und
unterbricht keinen Auftrag des anderen Besitzers. Bei verlorener Antwort
bleibt die Auswahl gesperrt, bis dieselbe Request-ID abgeglichen ist. Ein
fehlgeschlagener Zielwechsel stellt die vorige Auswahl nach bestätigtem
Leerlauf wieder her; bei unklarer oder gesperrter Auswahl bleibt die Sperre
sichtbar. Nach einer definitiv fehlgeschlagenen Übergabe kann eine eigene
andere Session ausdrücklich gewählt werden.

`.local/linux-handoff.json` bewahrt private Client-ID, offene Request-ID und
Besitzrevisionen über Neustarts. Sie enthält keine Cookies oder Gesprächstexte.
Eine fremde, beschädigte oder unter Linux öffentlich lesbare Metadatendatei
wird nicht still überschrieben. Vor der ersten Besitzabfrage bleibt eine
verbundene gewählte Session kurz gegen Einsendungen gesperrt. Eine fehlende
Serverfunktion hebt diese anfängliche Sperre auf; bereits bestätigte fremde
Besitzstände oder unklare Übergaben werden dadurch nicht vergessen.
Bei einem unterstützten Koordinator braucht jede gewählte Session dagegen
einen frisch bestätigten lokalen Besitzer. Eine fehlende Besitzzeile oder
fehlgeschlagene Registrierung sperrt neue Eingänge bis zum sicheren Abgleich.

## Alltag und lokale Geräte

Lilith startet als transparenter Orb unten rechts im Arbeitsbereich des
Bildschirms. Die drei Punkte oben dienen zum Verschieben. Ein Klick auf den Orb
beginnt die Aufnahme; der nächste Klick sendet sie. Fehlen Verbindung, gewählte
Session oder Spracherkennung, öffnet der Klick stattdessen das Gespräch mit dem
tatsächlichen Status. Bei Datenschutz wird kein Mikrofon geöffnet.

Unter dem Orb öffnen **Gespräch & Audio** und **Werkstatt** die passende Ansicht;
**Stopp** bleibt direkt erreichbar. Gespräch und Orb verwenden denselben
Renderer und Audio-Besitzer. Auf-/Zuklappen unterbricht weder Aufnahme noch
Auftrag und wechselt keine Session. Das Gespräch lässt sich über **×** oder
den normalen Fensterschließbefehl zum Orb verkleinern. **Lilith beenden** im
Rechtsklickmenü beendet die App ausdrücklich. Rückfragen/Freigaben öffnen das
Gespräch automatisch. Die Werkstatt besitzt weiterhin ihr eigenes Fenster.

**Strg+Alt+Leertaste** schaltet die Sprechtaste um, **Strg+Alt+W** öffnet die
Werkstatt, **Strg+Alt+Esc** stoppt. Registrierte globale Tastenkürzel hängen von
der Desktop-Sitzung ab; die sichtbaren Knöpfe bleiben verfügbar. Der kleine Orb
bleibt über anderen normalen Fenstern, das aufgeklappte Gespräch verhält sich
wie ein normales Arbeitsfenster. Bei Monitorwechsel bleiben beide innerhalb
des vorhandenen Arbeitsbereichs. `--panel` startet direkt mit dem Gespräch.

Die Mitte verwendet die Partikelkugel der Vorlage **Particle Core** mit 1.700
Punkten: Standby dreht langsam, Denken und Arbeiten führen einen hellen Scan
über die Kugel, Zuhören und Sprechen verformen sie anhand der echten lokalen
Audiopegel. Die gemeinsame Windows-/Linux-Darstellung bewahrt Zustandsfarben,
reduzierte Bewegung und transparente Fensterecken. Die HTML-Demosteuerung und
deren simulierte Sprachpegel werden nicht übernommen; es gibt keinen zweiten
Mikrofonzugriff oder zusätzlichen Animationsloop.

**Sprechen** öffnet das gewählte Notebook-Mikrofon. Nochmals klicken beendet
die Aufnahme und sendet den erkannten deutschen Text. Der Renderer verwendet
echtes `getUserMedia`, Mono-PCM16 mit 16 kHz und das vorhandene lokale
Whisper-`/inference`. Die Ausgabe läuft über den vorhandenen VoiceClient und
Qwen-TTS als PCM16/24 kHz an den lokalen AudioContext. Es gibt keine Web-Speech-
oder Browserstimmen-Ausweichlösung. Aufnahme ist auf 120 Sekunden begrenzt.
Nach einer Übergabe steht **Gespräch offen**: Lilith hört ohne Wakeword zu,
erkennt Sprachabschnitte anhand des lokalen PCM und sendet nach ungefähr
0,75 Sekunden Sprechpause. Vorlauf, Mindestsprachdauer und eine maximale
Abschnittslänge von 120 Sekunden begrenzen die Aufnahme. Stille erzeugt keine
STT-Aufträge. Während Modellarbeit und tatsächlicher TTS-Wiedergabe pausiert
das Mikrofon und öffnet anschließend wieder. **Gespräch pausieren** oder
Orb-Klick beendet diesen Live-Modus; **Sprechen** bleibt als manuelle Aufnahme
verfügbar. Die Energieerkennung ist keine semantische Satzendprüfung;
Hintergrundgeräusche können die Erkennung beeinflussen.
Auf dem echten Notebook wurde nach Übernahme Revision 18 **Gespräch offen**
angezeigt. Der eigene PulseAudio-Aufnahmestream und die lokalen Zustände
`live:true, microphoneOpen:true, capturing:false, localBusy:false` wurden
im Leerlauf gemeinsam bestätigt. Für die Diagnose wurde kein Audio gespeichert.
Gespeicherte, fehlende Mikrofone werden nicht still durch einen anderen Eingang
ersetzt. **Mikrofone prüfen** öffnet einen Eingang kurz zur Gerätefreigabe und
schließt ihn anschließend wieder.

**Stopp** verwirft lokale Aufnahme/Wiedergabe, bricht laufende STT ab und fordert
beim tatsächlichen Hermes-Session-Besitzer eine Unterbrechung an. **Datenschutz**
schließt das Mikrofon und sperrt weitere Sprache/Projektzugriffe. Eine Aufnahme,
deren Session, Transport oder Datenschutzgeneration inzwischen geändert wurde,
kann keinen Auftrag mehr senden. Kamera/Wakeword werden nicht automatisch
eingeschaltet.

Verspätete Antworten und Rückfragen des gestoppten Turns bleiben bis zu dessen
Terminalereignis unterdrückt, auch nach Aufheben des Datenschutzes. Rückfragen
sind an Request-ID, Gateway-Verbindung, Session und Generation gebunden. Ein
Wiederverbinden einer unterbrochenen Verbindung fragt denselben Session-
Laufstatus ab und sendet keinen alten Auftrag erneut. „Nicht mehr laufend“
belegt dabei nicht den Erfolg einer externen Aktion; deren Ergebnis bleibt
gesondert zu prüfen.

Die **Werkstatt** öffnet dieselbe lokale Projektbibliothek und Dateivorschau.
Ordner gelten ausschließlich auf dem Notebook. Projekte und Dateiquellen werden
vor Dispatch in den Auftrag gebunden. Quellen bleiben untrusted und werden über
die bestehenden Pfad-/Geheimnisfilter gelesen. Entfernen löscht nur den Eintrag,
keine Dateien. Browser und Zusammenarbeit verwenden den vorhandenen
Werkstattvertrag; Windows-spezifische Artcraft-/Guide-/Gerätefunktionen werden
auf diesem Client als noch nicht eingerichtet gemeldet.

Ausdrücklich gewünschter Zwischenablagetext ist über den verbundenen Linux-MCP
mit `lilith_clipboard_read` und `lilith_clipboard_write` erreichbar. Die lokale
Electron-App führt die Aktion in ihrer grafischen Sitzung aus; Datenschutzzustand,
Standby und Gesprächsbesitz bleiben maßgeblich. Schreiben prüft den lokalen Text
ohne ihn zurückzugeben und fügt ihn nicht in ein Fenster ein. Lesen meldet eine
Begrenzung auf höchstens 20.000 UTF-16-Einheiten. Kein Hintergrundlesen, keine
Historie und keine Gerätesynchronisation. Vertrag und Prüfgrenzen:
[Linux-MCP](linux-mcp.md).

`.local/linux-settings.json`, `linux-projects.json`, `linux-workbench.json`,
`linux-status.json`, `linux-handoff.json` und `linux-app.pid` bleiben lokal. Loopback-Sprachdienste
stehen auf 127.0.0.1:8870/8871. Der Client startet nur fehlende eigene native
Modellprozesse und beendet beim Schließen nur die von ihm gestarteten Kinder.
Einen bereits gesunden fremden Sprachdienst beendet er nicht.

## Ruhezeit und kompakte Übergabe · 13.10.2026

Unter **Verbindung & Audio → Standby nach Inaktivität (Minuten)** gilt
standardmäßig 15 Minuten. Ganze Werte von 1 bis 1440 ändern die Ruhezeit,
`0` schaltet sie aus. `idleStandbyMinutes` bleibt in den eigenen
`.local/linux-settings.json` gespeichert, einschließlich einer ausdrücklichen
Null. Status meldet `standby.active` und `standby.idleMinutes`.

Während eines Auftrags, Sessionwechsels, tatsächlicher Aufnahme, Transkription
oder laufender Sprachausgabe beginnt keine automatische Pause. Danach gilt
wieder die volle Ruhezeit. Ein stiller offener Live-Kanal zählt als Leerlauf;
Healthchecks, Statusabfragen und stille Eingangs-Heartbeats setzen die Uhr
nicht zurück. Angenommene Nutzereingaben und lokale Bedienung tun das.

Nach dem tatsächlichen STT-Abschnitt zeigt der Orb bereits beim Einsenden
**Ich denke nach** und bleibt während Antwortformulierung in diesem Zustand.
**Ich kümmere mich** kennzeichnet beobachtete laufende Werkzeuge. Endet ein
Werkzeug, bleiben gleichzeitig laufende Werkzeuge maßgeblich; erst nach dem
letzten Ende geht die Anzeige wieder zum Denken über.

Standby pausiert ausschließlich Liliths lokalen Gesprächskanal und beendet
die Renderer-Mikrofontracks. Das Notebook wird nicht in den Betriebssystem-
Ruhezustand versetzt. Gateway, Session, Mikrofonwahl und Datenschutzpräferenz
bleiben erhalten. Ein ausdrücklicher Klick auf den Orb oder **Aufwachen**
öffnet denselben lokalen Live-Kanal wieder, ohne das Gesprächsfenster
aufzuklappen. Eine bestätigte Gesprächsübernahme kann den Standby ebenfalls
beenden und beginnt nach der einmaligen Begrüßung den bisherigen Live-Ablauf.
Ein aktiver Datenschutzmodus bleibt dabei gesperrt.

**Standby** ist auch als eigener Knopf im Gespräch verfügbar. „Lilith, geh
bitte in den Standby“ verwendet die gemeinsame lokale Erkennung für diesen
Befehl und erzeugt keinen Modellauftrag. Eine ausdrücklich gewünschte Pause
verwirft lokale Aufnahme und Ausgabe; laufende Hermes-Aufträge, Sessionwechsel
und Transkription müssen zuerst enden. Aufwecken bleibt ein ausdrücklicher
Orb-Klick. Eine Anrede wie „Lilith“ oder „Hermes“ vor einem Übergabewunsch ist
erlaubt. Standby und Übergabe werden nach STT vor der normalen Unterbrechung
erkannt: eine Übergabe wartet auf laufende Arbeit, statt den Modellauftrag
als neue Frage zu unterbrechen.

Die Linux-Kamera-Wiedererkennung und automatische Kamerabegrüßung sind noch
nicht eingerichtet. Der vorhandene Linux-Sprachruntime-Build stellt keine
Kamera-Erkennungspipeline bereit; auch das Windows-Wakeword läuft hier nicht.
Die Notebook-Pause wacht deshalb durch lokale Bedienung oder bestätigte
Übernahme auf. Keine Kamerabegrüßung oder Wakeword-Parität behaupten.

`tests/linux-idle-standby.test.cjs` und
`tests/linux-dialogue-renderer.test.cjs` prüfen gespeicherte Null, Ruhegrenzen,
Busy-Sperren, stille Eingänge, erhaltene Übergabebereitschaft, kompaktes
Aufwachen und verworfene verspätete Mikrofonfreigaben. Die Tests verwenden
kontrollierte Uhren und Gerätehelfer; sie belegen keine reale Notebook-
Audioaufnahme, hörbare Ausgabe oder Kameraerkennung.

## Prüfgrenzen

Unit-Regressionen prüfen reale WAV-/PCM-Verträge, gebundene/redigierte
Projektquellen, Loopback-/Mikrofonvalidierung und veraltete Aufnahmegenerationen.
Diese Tests beweisen keine echte Notebook-Aufnahme, GPU-Inferenz, Lautsprecher-
ausgabe oder Desktopaktion. Dafür am Notebook den realen Renderer,
**Mikrofone prüfen**, **Stimme anhören** und einen gesprochenen Auftrag prüfen.
Der Renderer-Test `tests/linux-ui.electron.cjs` prüft zusätzlich den
Übergabeknopf, den Verfügbarkeitsstatus, Eingangsperren und sichere
Verlaufsdarstellung in einem isolierten echten Chromium-Fenster. Er öffnet
kein Mikrofon und verwendet kein Modell. Die serverseitige Bereitstellung,
reale PC-/Notebook-Übergabe, automatische Geräteerkennung, Kamera, Wakeword
und Pixel-App bleiben gesonderte Prüfungen beziehungsweise offene Schritte.
