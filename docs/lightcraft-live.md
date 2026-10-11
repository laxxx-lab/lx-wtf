# LightCraft-Aufträge in der Werkbank

Am 10. Oktober 2026 war LightCraft unter PID 169192 ohne Control-Kanal geöffnet. Die Werkbank konnte sein Fenster streamen, aber Hermes hatte keinen registrierten LightCraft-MCP. Der Fotoauftrag führte deshalb zu 51 Such-/Terminal-/Cua-Aufrufen und endete mit einer Rückfrage, die nur in der Konsole sichtbar war.

Die bestehende Bibliothek wurde gesichert und LightCraft normal geschlossen, ohne erzwungenes Beenden. Der Katalog mit 230 Fotos wurde über `app.openLibrary` erneut geöffnet und der bestätigte Foto-Umfang wiederhergestellt. Die GUI besitzt jetzt den lokalen Control-Port 7980; die Werkbank hat die passende lokale Registrierung. „App öffnen“ verwendet diese Registrierung bei folgenden Starts. Für normale direkte Starts aus dem Explorer muss die GUI ebenfalls mit Control-Kanal geöffnet werden.

Hermes-Default-Profil: **lightcraft-live**, stdio-MCP über den vorhandenen Windows-SSH-Zugang. Auf dem PC läuft `lightcraft-cli.exe mcp --connect 127.0.0.1:7980 --compact`. Der Test vom VPS lieferte 27 Werkzeuge; `reload.mcp` bestätigte die neue Konfiguration. Keine Headless-Ersatzbibliothek, kein anderer Benutzeraccount und kein öffentlicher TCP-Port.

Die Gateway-Ereignisse des installierten Hermes heißen `tool.start` und `tool.complete` und nutzen `tool_id`. Der Voice-Client erwartete bisher `tool.end` und andere ID-Felder. `gateway.cjs` normalisiert jetzt die tatsächlichen Ereignisse, wodurch Werkzeugabschlüsse, HUD und Aktivitätsanzeigen korrekt nachgeführt werden. App-Aufträge tragen eine App-ID und einen lesbaren Titel. Ihre Rückmeldung und der tatsächliche Schrittzähler stehen direkt im Artcraft-Inspektor.

## Nachweis

Der Nutzer bestätigte ausdrücklich nur `_99A7746.CR3`, Foto-ID 94. Lilith bearbeitete dieses Bild über die tatsächlich geladenen LightCraft-MCP-Werkzeuge in etwa 19 Sekunden; 11 echte Werkzeugstarts und 11 Abschlüsse wurden erfasst. Vorherige Einstellungen und RAW-Prüfwert wurden gesichert. Unabhängig geprüft: Auswahl `[94]`, 230 Katalogfotos, Entwicklung ausschließlich für Foto 94 verändert, RAW-SHA256 unverändert. Belichtung +0,7, Tiefen +50, Lichter −45, behutsame Farbe/Detailanpassung. Kein Export. Änderungen sind über LightCrafts normale Entwicklungshistorie rückgängig zu machen.

363 Node-Tests und 25 Python-Tests bestanden. Lokale private Artefakte: `.local/lightcraft-independent-verification.json`, `.local/lightcraft-agent-result.json`, `.local/lightcraft-edit94-backup.json`, `.local/lightcraft-library-backup-*`. Der aktivierte Skill `hermes-voice-control` enthält die konkrete Live-Anbindung und weist auf explizite Foto-IDs sowie die Verwendung der vorhandenen MCP-Werkzeuge hin.
