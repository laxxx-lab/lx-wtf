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

## Korrekturen nach dem Nutzertest am 9. Oktober

Das geladene Anmeldefenster blieb durch den versteckten Windows-Start unsichtbar.
Ein echter Electron-Fenstertest reproduzierte dies; explizites `showInactive()`
und anschließendes Fokussieren machen das Fenster sichtbar. Authentifizierte
Session-Fortsetzung und Gespräch wurden anschließend vom Nutzer erprobt.

Live-TTS verwendete zuvor neue VoiceDesign-Synthesen pro Satz. Der Live-Pfad
verwendet jetzt Base mit festen registrierten Sprecher-Einbettungen. Ausdrucks-
Referenzen werden einmal vorbereitet. Sehr kurze Texte verwenden dieselbe
Sprecher-Einbettung ohne langen ICL-Textkontext, da ICL sonst früh EOS ausgeben
konnte. Leere Synthesen werden mit derselben Identität erneut versucht.

Whisper erkannte Nullsignal als „Vielen Dank“ mit hoher Konfidenz. Silero VAD,
ein lokales Signalminimum und Segmentprüfung verhindern dies ohne Wort-Blacklist.
Der echte Produktionspfad verwirft Stille und Rauschen, erlaubt echtes „Vielen
Dank“ und erkennt weiterhin alle fünf Aktivierungsvarianten in den WAV-Proben.

Die Wakeword-Rückmeldung verwendet 27 geprüfte lokale PCM-Ansagen. Aufnahme
wartet auf deren Wiedergabe und 400 ms Nachhallabstand. 31 JavaScript- und fünf
Python-Tests bestehen. Sprecher-Konsistenz wurde mit vier getrennten Synthesen
geprüft; der Nutzer muss den Höreindruck und das Verhalten im Mikrofonraum noch
erneut prüfen. Reale Windows-MCP-Aktionen bleiben außerhalb dieser Prüfungen.
