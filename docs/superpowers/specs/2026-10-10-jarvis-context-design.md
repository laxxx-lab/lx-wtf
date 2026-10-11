# Lilith: zuverlässige Aufgaben und lokales Situationsgedächtnis

Der Nutzer hat die im Projektabgleich vorgeschlagene Ausbaurichtung freigegeben.
Die bestehende Electron-App, lokale Stimme/Bildanalyse und VPS-Hermes bleiben die Grundlage.

## Verhalten

- Ein Aufgabenbuch zeigt reale gestartete Werkzeuge und unterscheidet laufend,
  Agent beendet, nachgewiesenes Ergebnis, Fehler, Unterbrechung und Verbindungsausfall.
  Ein erfolgreicher HTTP-Aufruf oder eine Aussage des Agenten beweist kein Ergebnis.
- Ein lokales, begrenztes Ereignisgedächtnis speichert nur kurze bereinigte Metadaten.
  Das aktive Projekt wird bewusst gesetzt. Fensterkontext und ausgewählte Logdateien
  sind ausdrücklich einschaltbar; keine dauerhafte Aufnahme, Zwischenablage oder Dateiindexierung.
- Ein Kontextbereich in der Werkstatt zeigt Aufgaben, Ereignisse und Projekt und lässt
  das Gedächtnis löschen. Höchstens fünf aktuelle Beobachtungen werden als untrusted
  Fakten in einen Auftrag gegeben, wenn die Kontextfunktion eingeschaltet ist.
- Abläufe bestehen aus einem Namen, Nutzeranweisungen und einem erforderlichen
  Erfolgskriterium. Sie werden gespeichert und bewusst gestartet. Keine automatischen
  Klickaufzeichnungen oder Versprechen eines fertigen Teach Mode.
- Ausgewählte .log/.txt-Dateien liefern neue Build-/Testfehler und Erholungen; erste
  Abfrage liest nur bis EOF als Ausgangspunkt. Hinweise werden dedupliziert und
  unterbrechen keine Unterhaltung; keine selbstständige Reparatur ohne Auftrag.
- Datenschutz sperrt Mikrofon/Wakeword, Kamera, Bildschirmblick, Kontextbeobachtung
  und Loghinweise. Die Sperre wirkt vor asynchronen Änderungen und bleibt über Neustart.
  Entsperren erfolgt lokal und aktiviert keine Kamera oder Bildschirmquelle automatisch.
- Not-Aus stoppt lokale Ausgabe/Erfassung sofort und fordert ein Abbrechen des
  Hermes-Auftrags mit begrenzter Wartezeit an. Bereits gestartete entfernte Prozesse
  gelten nicht automatisch als beendet. Die unabhängige Cua-Verbindung wird nicht
  fälschlich als durch diese App gesperrt dargestellt.
- Wakeword im Standby funktioniert lokal auch ohne Gateway; bei Ausfall meldet Lilith
  die Verbindungslücke statt Sprachaufträge still zu verwerfen.

## Grenzen und Prüfung

Keine neuen kostenpflichtigen Dienste, keine Frameworkmigration, kein neuer Dienst
mit Administratorrechten. Bestehende authentifizierte Loopback-API wird eng erweitert;
Datenschutz darf darüber aktiviert, aber nicht aufgehoben werden. Keine frei ausführbaren
Shell-/Dateioperationen über neue Endpunkte. Sensible Fenstertitel werden ausgeschlossen.
Automatisierte Tests prüfen Persistenz, Grenzen, Race Conditions, Freigaben,
Ereigniszustände und echte temporäre Logdateien. Native Prüfung erfolgt in Electron
mit sicheren eigenen Testfenstern/Logdateien und anschließender normaler Verbindung.
