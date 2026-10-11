# Standby und Aufwachen

„Gehe in den Standby“ schaltet Live und die Kameratracks aus. Lilith bestätigt kurz und wartet auf Hey Hermes / Hey Lilith / Lilith. Die konfigurierte Kamera wird gemerkt, einschließlich der weiterhin ausgewählten Geräte-ID; Erkennung, Begrüßung und Gesteneinstellung werden nicht neu gesetzt. Eine Kamera, die vor Standby ausgeschaltet war, bleibt beim Aufwachen ausgeschaltet.

Aufwachen erfolgt über den vorhandenen Wakeword-Weg. Erst wird der vorgemerkte Kamerazustand hergestellt und bestätigt, dann Live eingeschaltet, danach die Begrüßung gesprochen oder der angehängte Befehl weitergegeben. Gesten laufen mit der wiederhergestellten Kamera erneut. Wiederholte Standby-Aufrufe überschreiben den Vorgängerzustand nicht. Ein erneuter Standby während einer ausstehenden Kamerafreigabe verwirft den alten Wiederanlauf und stoppt spät eintreffende Tracks.

Die Zustandsfelder `standbyActive` und `standbyCameraEnabled` werden in `.local/settings.json` gespeichert. Bei einem Neustart im Standby startet die Kamera aus. Mikrofon und Wakewords werden wie zuvor lokal bereitgestellt. Ein explizites Kamera-Aus im Standby ändert die Erinnerung auf aus. Bewusstes Kamera-An überschreibt den Standby. Datenschutz und Not-Aus löschen die Erinnerung; Entsperren startet keine Sensoren automatisch.

Standby ist kein Mikrofon-Aus und kein Datenschutzmodus: das Mikrofon bleibt für das Wakeword erforderlich. Systemüberwachung und Hermes-Verbindung laufen weiter. Bei fehlender Kamerafreigabe oder geänderter Session wird kein erfolgreicher Wiederanlauf behauptet; die App bleibt lokal angehalten und meldet den Grund.

`control.ps1 -Action status` zeigt zusätzlich `standby.active` und `standby.cameraWillResume`. Letzteres ist die Erinnerung, nicht der aktuelle physische Kamerazustand. Physisch gelten `camera.active` und `live.active`.

Verifikation: 384 Node-Tests, darunter beide Kamerazustände, echte Renderer-Trackbeendigung, Wiederholung, verweigerte Freigabe, veraltete Session, neuer Standby während ausstehender Freigabe und Widerruf durch Datenschutz. Native Produktionsprüfung über die vorhandene Session: echte angeschlossene Kamera zweimal geöffnet; Standby beendet den vorhandenen Videotrack; ausgelöstes Wakeword-Ereignis durchläuft die wirkliche Renderer-/IPC-Kette und stellt dieselbe Kamera plus Live wieder her. Bei vorher Kamera-Aus erzeugt das Wakeword keinen Kamera-Aufruf. Erinnerung als Standby lokal zurückgelesen. Keine Kameraaufnahmen für diese Tests gespeichert. Ergebnis `.local/standby-activated.json`.
