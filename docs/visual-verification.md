# Prüfung des visuellen Ausbaus · 10. Oktober 2026

Aktiviert: lokale Graphify-Codekarte, öffentliche OSIRIS-Lagekarte, geführtes Fensterlicht mit simuliertem Zeiger, zugeordneter Werkzeugglow und die entsprechenden Werkstatt-/Kontrollbefehle.

- `node --test tests/*.test.cjs`: 311 bestanden, keine Fehler oder übersprungenen Tests.
- Python-Unittest-Discovery unter `runtime/voice/venv`: 25 bestanden.
- Echte installierte Graphify-Extraktion: 108 Dateien, 1004 Knoten, 2003 Beziehungen. Nach regulärem App-Neustart aus dem Cache geladen, `ready=true`, `stale=false` zum Prüfzeitpunkt.
- Graphify-Isolation mit tatsächlicher Python-Laufzeit geprüft: Eine Projektdatei namens `graphify.py` und ein konfigurierter Git-Fsmonitor werden beim Indexieren nicht ausgeführt. Interpreter-Neustart und automatische Skill-/Plugin-Aktualisierung sind gesperrt.
- Native Electron-Prüfung: markierte Graphsuchtreffer, Quellenvorschau, Erdbebeneinträge, echte DeepState-Kartengeometrie, Ortsklärung ohne geratenen Ort, durchklickbarer Hinweis und unveränderter OS-Mauszeiger. Datenschutz entfernt den Guide. Keine Rendererfehler. Prüfung auf dem aktuell verwendeten Monitor; beliebige weitere DPI-/Monitoranordnungen sind damit nicht vollständig geprüft.
- Live-Datenprüfung: öffentliche London-Webcams, API-Status und Weltraumwetter erreichbar. Verfügbarkeit kann sich ändern.
- Echter Hermes-Test in separater Testsession: Agent lud den aktualisierten Skill und führte über seine vorhandene Windows-Verbindung Graphsuche nach `intelIntent` und die öffentliche Kameraabfrage für `UnknownIntegrationTown` aus. Die lokale App bestätigte die markierten IDs und `clarificationNeeded=true`. Testsession danach geschlossen; tägliche ausgewählte Session blieb erhalten.
- Skill auf dem VPS vor Änderung gesichert, auf zwischenzeitliche Änderung geprüft, gespeichert und identisch zurückgelesen; Skill aktiviert. Normaler Launcher abschließend verwendet. Hermes verbunden, Windows-Anbindung online, Wakeword bereit, Kamera aus. Autostart war aktiviert.

Die native Guide-Prüfung verwendet ein eigenes Testfenster. Eine vollständige automatische Bedienungsanleitung sämtlicher Browser-/Windows-Anwendungen ist damit nicht bewiesen: Präzise Guides benötigen jeweils echte frische UIA-/DOM-Zielkoordinaten und HWND/PID. Fenstergeometrie erkennt externe DOM-Änderungen nicht selbst. Der Projektgraph bleibt statisch; OSIRIS zeigt Quellenangaben und deren begrenzte Abdeckung.

Bedienung und Grenzen: [Projektgraph](project-graph.md), [Lagekarte](osiris.md), [Guides](guided-explanations.md), [API](control-api.md).

## Orb-Korrektur

Das flache Gruppenlayout ist durch eine perspektivische Kugel mit gebogenen realen Verbindungen ersetzt. Vier neue Geometrietests prüfen Tiefe, stabile Knotenpositionen beim Suchen, Perspektive und begrenzte tatsächliche Beziehungen. Gesamte JavaScript-Suite: 315 bestanden, keine Fehler oder ausgelassenen Tests.

Native Electron-Prüfung mit und ohne reduzierte Bewegung bestanden: langsame Rotation, Pause bei Mauszeiger, Tastaturfokus und manueller Schaltfläche, Quellenöffnung per Enter, angehaltene versteckte Ansicht und kein horizontaler Überlauf. Beide Läufe ohne Rendererfehler. Neuer Codeindex: 109 Dateien, 1019 Knoten und 2040 Beziehungen. Sprach-/Kamera-Code wurde dabei nicht geändert.

## Lagekarte: Standortwechsel

Der alte Klick änderte intern den Datensatz, zeigte aber weder eine markierte Zeile noch zuverlässig sichtbare Details. Der feste nördliche Blick konnte südliche Standorte verdecken. Der native Regressionstest bestätigte vor der Korrektur: kein Auswahlzustand, kein mittiger Marker, nicht begrenzter/scrollbarer Bereich und außerhalb der Ansicht liegender Ortsname.

Nach der Korrektur bestanden: Nord-/Südwechsel mit zentriertem sichtbarem Marker, markierter Zeile und aktualisierten Koordinaten, Erhalt derselben ID bei erneuten Daten, erreichbare Details, ehrliche fehlende Koordinaten sowie sichtbare aktive Markierung bei deckungsgleichen Ereignissen. Keine Rendererfehler. Gesamte JavaScript-Suite: 317 bestanden. Neuer Codeindex: 110 Dateien, 1023 Knoten und 2048 Beziehungen.

## Artcraft · 10. Oktober 2026

351 Node-Tests und 25 Python-Tests im vorhandenen Voice-Venv bestanden. Native Electron-Prüfung: zwölf App-Karten, echte authentifizierte PhotoCraft-GUI-Vorschau 1440×900, PNG-Anzeige, Auswahl löscht fremdes Bild, Auftragseingabe mit App-ID, Datenschutz sperrt Vorschau und Aufträge. Auf VPS ergänzt, gesichert und zurückgelesen: aktiver Skill hermes-voice-control, SHA256 `aada6214859eb82a02e79a3816940250ce5cc36bef9e6cf234d11376ecfd3785`. Verbundene bisherige Session bei Produktionstest; anschließend normaler launch.ps1 wieder gestartet. Keine Änderung an Liliths MCP-Konfiguration. Weitere App-Adapter kontrolliert getestet, ihre realen Hermes-MCP-Verbindungen noch nicht einzeln bestätigt. Native Artefakte: `.local/artcraft-connected.png`, `.local/artcraft-native-result.json`, `.local/artcraft-activated.json`.

## Echter Fensterstream · 10. Oktober 2026

360 Node-Tests und 25 Python-Tests bestanden. Native Electron 40.10.2: echte bekannte PhotoCraft-PID/ HWND via getDisplayMedia als window-MediaStream, 1440×900, lebender Videotrack und nicht schwarze Pixel (99,9875 %). Separate animierte native Testansicht: 67 neue Videoframes in 2,2 Sekunden. Statisches PhotoCraft erzeugt adaptiv nur neue Frames bei Veränderungen; dessen FPS nicht aus der Testanimation ableiten. Ausschalten beendet Video-Tracks; Reiterwechsel, Datenschutz und Ausblenden stoppen die Erfassung. Medienberechtigung nur für eine vorbereitete lokale Werkbank-Display-Anfrage; Browser, Mikrofon und Webcam-Anfragen geprüft abgewiesen. Kein Audio, Desktop-Fallback, Upload oder Aufzeichnungsdienst. Verbundener Produktionstest mit derselben Hermes-Session bestanden; Skill gesichert, ergänzt und zurückgelesen, SHA256 `5f1ee4607da643b9407428b974c6db5c9f638f24da4a001b8c1f9bafaa9d73a0`. Anschließend normaler launch.ps1 gestartet. Artefakte: `.local/artcraft-video-result.json`, `.local/artcraft-window-video.png`, `.local/window-stream-activated.json`, `.local/window-stream-connected.png`.

## Werkstatt-Fensterlage · 10. Oktober 2026

367 Node-Tests bestanden. Native Electron-Prüfung auf dem zweiten Bildschirm (ID 4024851967, links liegend, gemischte Skalierung): maximiertes Ausblenden/Öffnen sowie Rekonstruktion einer maximierten und normalen Fensterinstanz bestanden. Aktuelle Nutzerlage vor dem Update rein lesend übernommen und im verbundenen Client bestätigt. Normale Startversion mit derselben Hermes-Session anschließend wieder gestartet; zweite native Geometrieabfrage bestätigt maximierte Werkstatt. Zustand lokal unter `.local/workbench-window.json`, Smoke-Datei getrennt. Prüfartefakte `.local/workbench-placement-native.json`, `.local/workbench-placement-activated.json`.

## Automatischer Fensterstream und Circle of Interest · 10. Oktober 2026

373 Node-Tests bestanden. Native Fensterprüfung: automatische Erfassung ohne Checkbox; 63 neue Frames in 2,1 Sekunden bei einer isolierten Testanimation. Ausblenden/Anzeigen, Reiterwechsel, Schließen und Wiederöffnen der Quelle sowie Datenschutz/Entsperren geprüft. Echte Mausereignisse zeichnen im Auswahlfenster einen Kreis; der richtige Monitorausschnitt wird zugeschnitten und der Analyse-Callback erhält die Frage und denselben Sessionbezug. Produktionsprüfung: laufende LightCraft-GUI, Video 1602×1032, keine Streamwarnung, Escape beendet Circle. Ein isolierter Testausschnitt wurde tatsächlich lokal analysiert; die bestehende Lilith-Session antwortete korrekt „LILITH TEST 42“. Kein Fotoauftrag oder Nutzerdokument verändert. Voice-Control-Skill gesichert, aktualisiert und exakt zurückgelesen. Die normale App wurde anschließend über launch.ps1 gestartet; LightCraft-Auswahl wird nun ebenfalls gespeichert. Minimierte Quellfenster liefern unter Windows keinen verlässlichen Stream: echtes minimiertes LightCraft verweigerte die Erfassung, nach „App zeigen“ funktionierte sie. Artefakte: `.local/auto-circle-native.json`, `.local/auto-circle-activated.json`, `.local/auto-circle-normal-client.json`, `.local/circle-interest-preview.png`.

## Zuschnittprüfung für Circle of Interest · 10. Oktober 2026

376 Node-Tests bestanden. Im gemeldeten Lauf beschrieb bereits die lokale Vision eine andere Hinweisbox; Lilith gab diese Beobachtung wieder. Die ursprünglichen Bildbytes wurden nicht gespeichert, daher ist die Ursache dieses einzelnen Laufes rückwirkend nicht eindeutig belegbar. Native Diagnose fand separat ein gestauchtes Auswahlfenster: `resizable:false` begrenzte es selbst im Vollbild auf 1392 DIP, auch auf dem Hochkantmonitor. `resizable:true` plus Vollbild liefert korrekt 5120×1440 bzw. 1440×2560 DIP. Der Zuschnitt wird jetzt im Hauptprozess einmal vorbereitet und vorab angezeigt; nur exakt dieselben JPEG-Bytes dürfen mit gültiger Auswahl-ID gesendet werden. Originaltext wird zusätzlich lokal transkribiert. Native Prüfung mit zwei unterschiedlichen Textboxen, Mausauswahl und lokaler Qwen-VL-Analyse auf beiden echten Monitoren: ausschließlich Ziel „CHATGPT NACHRICHT 73“, Datei config.json erkannt, Hinweisbox außerhalb des Zuschnitts nicht erwähnt. Artefakte: `.local/circle-crop-native.json`, `.local/circle-crop-preview-4024851967.png`, `.local/circle-fullscreen-diagnosis.json`. Keine Nutzerbildspeicherung für diese Diagnose.

Produktionsprüfung derselben bestehenden Hermes-Session: exakt die Vorschau-Bytes übergeben; Lilith erklärt korrekt, dass config.json fehlt. Voice-Control-Skill mit Sicherung aktualisiert und zurückgelesen. Anschließend normaler launch.ps1 gestartet. Nachweis: .local/circle-crop-activated.json.

## Standby mit gemerktem Kamerazustand · 10. Oktober 2026

384 Node-Tests bestanden. Native Prüfung mit tatsächlicher angeschlossener Kamera und bestehender Hermes-Session: vorher Kamera-Aus → Standby → Wakeword-Ereignis startet Live ohne Kamera-Aufruf; vorher Kamera-An → Standby beendet Videotrack und Live, belässt Wakeword-Mikrofon; wiederholter Standby behält Kamera-An-Erinnerung; Wakeword-Ereignis durch die tatsächliche Renderer-/IPC-Kette stellt dieselbe Geräte-ID und Live wieder her. Zustand in settings.json während Standby zurückgelesen. Datenschutz/Not-Aus verwerfen die Erinnerung; Abbruch bei Sessionwechsel, verweigerter Kamerafreigabe und verspäteter Freigabe nach neuem Standby mit Tests geprüft. Skill auf VPS gesichert, geändert und zurückgelesen. Kamera und Live am Ende ausgeschaltet wie vor dem Test, Wakeword-Bereitschaft aktiv, normaler launch.ps1 gestartet. Keine Test-Kameraaufnahmen gespeichert. Nachweise: `.local/standby-activated.json`, `.local/standby-normal-client.json`.


## Friday-Ausbaustufe · 11.10.2026

478 Node-Tests ohne Fehler oder übersprungene Tests. Echte Hermes-Queue: zwei Textaufträge seriell zugeordnet (.local/friday-activation.json). Native LightCraft-Klicks/Text mit leerem Testkatalog und getrennten Einstellungen auf 96/144-DPI-Monitoren bestätigt (.local/friday-light-native/result.json). Echter lokaler TTS-PCM-Stream im unveränderten Renderer mit stummem Ausgang; verspätete Generation verworfen (.local/friday-voice-native/result.json). Hidden Electron Layout-/Graphprüfungen bestanden. Alltags-Mikrofon/Sprecher-Echo und Gesten mit Benutzerhand bleiben als solche ungemessen; Einzel-TTS-Wert ist kein allgemeines Latenzversprechen.


## Direkte Sprachbedienung · 11.10.2026

531 reguläre Tests ohne Fehler; drei opt-in-native Windows-Prüfungen separat bestanden. Actual Core-Audio/SMTC reads + eigener nativer Test-App-Start mit genauer Fensteridentität. Hook-Kanten in produktivem C# kompiliert/ohne Tasteneingabe geprüft. Echter lokaler Tonbefehl + danach Hermes-Testauftrag seriell, bestehender Pegel/Mute/Sensorzustand erhalten (.local/direct-speech-activation.json). Editor/Save/PTT im echten isolierten Electron-Renderer mit Testaudio geprüft. Native Hardware-PTT und Musiktitelwechsel im Benutzerbetrieb noch nicht als Alltagstest gemessen. Normaler Launcher anschließend wieder gestartet.
