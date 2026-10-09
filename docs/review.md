# Prüfung der ersten Windows-Version

9. Oktober 2026. Unabhängige Codeprüfung mit zwei anschließenden Korrekturrunden.

Bestätigte und behobene Fehler:

- Session-Wechsel während einer offenen Resume-Anfrage konnte einen Auftrag an
  die falsche Session schicken. Synchroner Auswahl-Lock und Aufnahmesession-ID.
- Späte Mikrofonfreigabe nach Mikrofon-aus konnte die Aufnahme wieder starten.
  Gemeinsame Acquisition-Promise und Generation für Release/Live-Aufträge.
- Zwischenbericht konnte eine nicht gestreamte Schlussantwort verbergen.
  Antwortsegmente werden getrennt akkumuliert; Schlussantwort bleibt sichtbar.
- Systemhinweise konnten sich mit einer noch transkribierten Benutzeraufnahme
  überschneiden. Transkription gehört zum Aufnahme-/Idle-Zustand.
- Späte Unterbrechungsbestätigung konnte neue Aufnahmedaten verwerfen.
  Resume wartet auf beendete Aufnahme, Transkription und Audiowiedergabe.
- Gesprochener Systemhinweis wurde durch seinen eigenen Prompt gestoppt; die
  Sprachpräferenz konnte gleichzeitig umgangen werden. Proaktive Turns tragen
  ihre Sprachpräferenz durch alle Antwortsegmente.
- Verbindungswiederherstellung hing fälschlich an eingeschalteter Überwachung.
  Sie läuft unabhängig; Initialisierungsfehler setzen den Verbindungsstatus zurück.
- Späte Aktivierungswort-Erkennung konnte nach Mikrofon-aus oder Sessionwechsel
  eine neue Aufnahme/einen alten Auftrag starten. Generation, Session und
  aktueller Aktivierungszustand werden nach beiden Netzwerk-Awaits geprüft.

Die abschließende fokussierte Prüfung meldete keine weiteren wesentlichen
Fehler in diesen Korrekturen. 25 JavaScript-Tests bestanden. Beide reproduzierten
Cancellation-Szenarien ergaben anschließend null späte Aktivierungen bzw.
abgebrochene Aufträge, die trotzdem gesendet worden wären.

Zusätzlich bestanden fünf Python-Tests für Sprachadapter, PCM-Resampling,
Ausdrucksparameter und Aktivierungsfilter. Lokale Synthese, PCM-Streaming und
deutsche Transkription wurden mit echten Modellen geprüft; die App wurde als
Electron-Fenster gerendert und per Screenshot kontrolliert.

Noch nicht nachgewiesen: authentifizierte Fortsetzung der realen Telegram-Session,
echte Mikrofonbedienung, Windows-MCP-Aufträge und deren Freigaben. Die Anmeldung
am Gateway ist dafür erforderlich. Es wurden keine Spotify-Aufträge, Löschungen,
Neustarts oder Nachrichten an andere Personen als Test ausgeführt.
