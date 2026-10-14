# Gespräch nach Übergabe offen halten

Autorisiert: Nach bestätigter Übergabe und „Ich bin jetzt hier, Boss.“ am Ziel
direkt weiter zuhören, ohne erneutes Wakeword oder Klick. Laufender Besitz-/Auth-
Vertrag unverändert. Mikrofon bleibt sichtbar und lokal pausierbar. Kein
Sessionreset oder Gatewayneustart; Notebook ist aktuell Besitzer.

## Windows

- `main.cjs`: bestätigtes onReceived sendet `handoff-listen` mit Runtime-Session
  und Begrüßungs-Turn-ID, nachdem die lokale Ansage eingereiht ist.
- `ui/app.js`: Absicht an genau diese Session und lokalen Sicherheitszustand
  binden; warten bis Ansage-TTS und reale Wiedergabe aus sind. Danach vorhandenes
  `toggleMic(true)` und den bestehenden Live-/VAD-Ablauf verwenden. Stopp,
  Datenschutz, Standby, Auswahl, Verbindung und fremder Besitzer verwerfen die
  Absicht. Kein Wiederöffnen nach manueller Pause, kein Replay bei Neustart.
- Regressionen Hauptprozess/Renderer: eigener bestätigter Besitz, echtes
  Wiedergabeende statt nur Streamende, VAD-Bereitschaft, verspätete Events und
  Benutzerpause. Vor Änderung rot, dann grün.

## Linux (unabhängig vom Windows-Pfad)

- `linux-main.cjs`: onReceived kündigt `handoff-listen` mit Session/Generation
  an, bevor `speak` beginnt, damit Renderer Playbackbeginn/-ende beobachten kann.
- `ui/linux.js`: sitzungsgebundener Live-Modus nach Ende der Begrüßung. Vorhandene
  lokale Mikrofon-/PCM-/STT-/TTS-Wege benutzen; keine Browser-Cloud-Sprache.
  Aufnahme pausiert für Wiedergabe und Modellarbeit, danach wieder zuhören.
  Satzenden lokal erkennen, nur echte Sprachsegmente automatisch senden;
  Leerlauf darf keine Phantomaufträge oder dauernde Besitz-Busy-Sperre erzeugen.
  Stopp/Pause/Privacy/Session/Gerätewechsel widerrufen automatisch gestarteten
  Live-Modus. Mikrofonwahl und Persistenz unverändert.
- Kleinste gemeinsame testbare PCM-Segmentierung, reale Rendererlogik an
  Audio-/Mikrofon-Grenzen testen. Mikrofonfehler sichtbar und ohne Retryloop.

## Abschluss

- Fokussierte Regressionen, Syntax, vollständiges `npm.cmd test`, diff-check.
- Eigenen freien Clients aktualisieren, Auth und Einstellungen bewahren.
- Echte Übergabe PC->Notebook mit freiem Kanal nach hörbarer Ansage und
  Satzende/Rückgabe prüfen; private Statusfelder statt Aufnahmen/logs ausgeben.
- Notebook am Ende wieder für den Nutzer aktiv lassen. Bedienverträge und beide
  Hermes-Skills mit Backup/Vergleich/Readback aktualisieren. Kein Commit/Push.

## Ergebnis

Implementiert und aktiviert am 13.10.2026. Fokussierte Tests mit rot/grün
bestätigten Wiedergabeende und Abbruchgrenzen. Review fand zwei Windows-
Mikrofonwarte-Rennen (Session/Verbindung/Sicherheit und VAD); beide mit
Regressionen behoben. Gesamtprüfung: 994 bestanden, fünf optionale übersprungen,
keine Fehler; Syntax/diff-check und isolierter nativer Linux-Renderer bestanden.

Die eigenen freien Clients wurden mit erhaltenen Einstellungen, Anmeldung und
Session aktualisiert; kein Gatewayneustart. Beide aktiven Hermes-Skills wurden
mit Backup/Vergleich/vollständigem Readback aktualisiert. Reale Übernahme PC
Revision 17: Live aktiv. Notebook Revision 18: Gespräch offen, lokales Live-
Mikrofon und echter PulseAudio-Aufnahmestream, Leerlauf blockiert keine Übergabe.
PC danach passiv mit geschlossenem Mikrofon. Notebook bleibt aktiv für den Nutzer.
Kein Audio für die Diagnose gespeichert. Prüfung zweier gesprochener Folgesätze
beim Nutzer angefragt; noch keine Antwort, daher nicht als Hardwarebeweis behauptet.
