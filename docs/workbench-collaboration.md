# Gemeinsam in der Werkstatt arbeiten

Die vorhandene Missionsleiste hält das Ziel und den beobachteten Schritt sichtbar.
Die Konsole zeigt daneben Ziel, Werkzeugschritte, Ergebnis und Hindernis.
„Agent beendet“ bezeichnet ein Turn-Ende; erst passende Werkzeugbelege bestätigen
eine Wirkung. Bei `outcome-unknown` bleibt das Ergebnis offen und muss zuerst
über „Remote-Status prüfen“ abgeglichen werden. Ein Modelltext ist kein Beleg.

Der kleine Sprachstatus oben führt auf Klick zu den beobachteten Prüfungen im
Systembereich. Er zeigt dieselbe `voiceHealth`-Beobachtung wie die Haupt-App,
einschließlich eines gegebenenfalls vorgesehenen Reparaturgrundes. Die Werkstatt
führt daraus keine eigene Reparatur und keinen freien Befehl aus.

Eine ausdrücklich gelesene Quelle erhält eine knappe Zuordnung: unter dem Zeiger,
Vordergrund oder Zwischenablage. Bei einer Bezugnahme auf eine frühere Quelle
stehen deren ursprüngliche Uhrzeit und „ALTE BEOBACHTUNG“ dabei. Die Zuordnung
enthält keine Quellinhalte. Der vorhandene ausklappbare Quellenbereich hält den
explizit gelesenen Text; im Datenschutzmodus werden beide Quellenanzeigen geleert.

## Aufträge korrigieren

Im Lagebild lässt sich ein eigener wartender, laufender oder delegierter Auftrag
über „Auftrag korrigieren“ mit höchstens 1.200 Zeichen präzisieren. Wartende
Aufträge behalten ihre ID und erhalten eine Revision. Bei laufender Arbeit steht
„Stoppen und korrigieren“: Die Haupt-App muss den genau zuständigen Turn stoppen
und dessen tatsächliches Ende feststellen, bevor sie eine geänderte Fortsetzung
startet. Bereits ausgeführte Schritte werden dabei berücksichtigt. Ein unbekanntes
Ergebnis, eine blockierte Warteschlange oder Datenschutz sperren die Korrektur.
Entwürfe bleiben bei Statusaktualisierungen erhalten; Quelle, Fortschritt und
andere Hinweise werden weiter aktualisiert. Wird der Auftrag unzulässig, entfällt
das Formular; auch eine verspätete Absendung prüft den aktuellen Status erneut.

Der lokale IPC-Vertrag lautet ausschließlich
`workbench.invoke('job-amend', {id, instruction})`. Die ID muss eine UUID eines
aktuell eigenen Auftrags sein; zusätzliche Felder und Steuerzeichen werden
abgelehnt. Die Haupt-App führt die atomare Revision oder bestätigte Fortsetzung
aus. Die Werkstatt akzeptiert weder Shellfelder noch beliebige Ausführung.

## Sichere Momentaufnahme und Darstellung

`safeSnapshot()` ergänzt:

- `voiceHealth: {state, summary, checks: [{key, state, summary}], repair}` oder
  `null`. `repair` ist `null` oder `{kind, reason}` mit `kind` aus `microphone`,
  `audio-output`, `engines`, `gateway`. Gerätedaten und Reparaturbefehle fehlen.
- `attention: {kind, label, observedAt, selection, stale, summary}` oder `null`.
  `kind` ist `window`/`clipboard`, `observedAt` eine ISO-Zeit, `selection` ist
  `pointer`/`foreground`/`clipboard`/`remembered`. Native IDs, Rechtecke und
  Quelltext fehlen; Datenschutz liefert `null`.
- Optional eine nichtnegative ganzzahlige `revision` pro Warteschlangeneintrag.
  Private Korrekturtexte und interne Änderungsdaten werden nicht projiziert.

`present({tab, reason, requestId})` und `release(requestId)` behalten ihren
bestehenden Besitzvertrag. Eine Agentenansicht erhält keinen Fokus. Manuelle
Navigation und Eingaben übernehmen die Ansicht; eine späte Freigabe schließt sie
dann nicht. Die Haupt-App wählt den passenden Bereich für umfangreiche Aufgaben.
Der Renderer wechselt nur auf ausdrücklichen Klick oder eine Hauptprozessmeldung
und erfindet keine Browseradresse.

Die Haupt-App präsentiert umfangreiche explizite Aufträge ohne Fokusübernahme:
bekannte Artcraft-Aufträge dort, Projekt-/Codearbeit bei vorhandenem Index im
Graph, sonst in der Konsole. Ihre auftragsgebundene Ansicht wird zehn Sekunden
nach einem abgeschlossenen/beendeten oder abgebrochenen Auftrag freigegeben.
Unklare Ergebnisse und Fehler bleiben zur Prüfung sichtbar. Eine inzwischen
manuell übernommene Ansicht oder neue Präsentations-ID wird nicht geschlossen.
Ausdrücklich gelesene Quellen bleiben zum Nachlesen sichtbar; deren eigene
Lesekarte wird bewusst ausgeblendet beziehungsweise vom Agenten mit seiner
Präsentations-ID freigegeben, ohne einen kurzen automatischen Lese-Countdown.

Prüfung: `node --test tests/workbench*.test.cjs`, `node --check workbench.cjs`,
`node --check ui/workbench.js`, `git diff --check`. Der isolierte native Renderer
`tests/workbench-ui.electron.cjs` prüft zusätzliche Darstellung, Entwurfsfokus,
Korrekturpayload und Quellenbereinigung ohne echte Session oder Sensoren.
Echte Fensterbesitz-/DPI- und Audioeffekte brauchen die interaktive Windows-Prüfung.
