# Power-Timer und lokale Erinnerungen

Die lokale Steuerung kann einen einmaligen Windows-Neustart oder das
Herunterfahren mit 30 bis 86400 ganzen Sekunden Vorlauf planen. Der Timer läuft
in Lilith, nicht in Windows: Die App muss bis zum Zeitpunkt laufen. Beim
App-Neustart wird ein früherer Timer als `unknown` angezeigt und niemals
automatisch erneut ausgeführt. Ein neuer Auftrag benötigt eine neue ausdrückliche
Anforderung. Ein zweiter aktiver Timer ersetzt den ersten nicht.

`power-control.cjs` exportiert
`createPowerControl({file?, execFile?, platform?, now?})`:

- `read()` liefert den lokalen Zustand mit `status`, `cancellable`, gegebenenfalls
  `action`, `requestedAt`, `dueAt` und `actualPowerEvent: 'unknown'`.
- `execute({action: 'shutdown' | 'restart', delaySeconds})` plant den lokalen
  Timer; `execute({action: 'cancel'})` bricht ausschließlich den eigenen noch
  nicht ausgelösten Timer ab. Beide Methoden sind asynchron und liefern `ok`.
- `tick()` prüft den Zeitpunkt und beansprucht den Auftrag dauerhaft vor dem
  einzigen nativen Aufruf. Der Hauptprozess muss diese Methode regelmäßig
  aufrufen. Danach wird ein Ergebnis ohne Bestätigung nicht wiederholt.

Erst beim fälligen Timer ruft der Helfer ohne Shell die feste Windows-Datei
`System32\shutdown.exe` mit `/s /t 0` beziehungsweise `/r /t 0` auf. `/f` wird
nicht gesetzt. Ein positiver Windows-Timeout würde laut
[Microsofts shutdown-Vertrag](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/shutdown/)
das erzwungene Schließen von Anwendungen implizit einschalten; deshalb bleibt
der Vorlauf im Client. Windows darf das Herunterfahren wegen offener Anwendungen
blockieren. Ein angenommenes natives Kommando (`nativeCommandAccepted: true`,
`status: requested`) bestätigt nur die Anfrage, niemals den tatsächlichen
Neustart oder das Ausschalten. Ein fremder Windows-Timer wird weder gelesen noch
über `/a` abgebrochen. Nach Auslösung ist dieser lokale Timer nicht mehr
abbrechbar. Auch ein Speicherfehler verhindert den Abbruch eines eigenen
ausstehenden Timers nicht.

## Erinnerungen und Wecker

`reminders.cjs` exportiert `createReminders({file?, now?, onDue?})`. Die Liste
umfasst höchstens 50 Einträge. Beim Anlegen ersetzt ein neuer Eintrag bei voller
Liste ausschließlich ältere abgeschlossene Einträge. Bei 50 aktiven Einträgen
wird ein neuer Auftrag abgelehnt.

- `execute({action: 'create', kind: 'reminder' | 'alarm', text, at})` ist synchron.
  `text` ist ein nicht leerer Text bis 500 Zeichen ohne Steuerzeichen. `at` ist
  ein zukünftiger ISO-Zeitpunkt mit ausdrücklicher Zeitzone, etwa
  `2026-10-12T10:15:00+02:00`. Gespeichert wird der entsprechende UTC-Zeitpunkt.
  Ein lokaler Zeitpunkt ohne Offset wird abgelehnt. Der Aufrufer löst Angaben
  wie „morgen um zehn“ vorab anhand der Zeitzone `Europe/Berlin` auf.
- `execute({action: 'cancel', id})` bricht einen ausstehenden Eintrag über seine
  UUID ab. Das Ergebnis enthält `ok`, `status` und gegebenenfalls `reminder` oder
  `error`.
- `list()` liefert eine Kopie aller Einträge mit `pending`, `cancelled` oder
  `fired`. `read()` liefert `{items, error}` einschließlich eines möglichen
  Fehlers beim Laden der privaten Datei.
- `tick()` ist asynchron. Es beansprucht fällige Einträge vor dem Aufruf von
  `onDue(reminder)` dauerhaft als `fired`. Eine zweite gleichzeitige Prüfung
  oder ein App-Neustart kann diese Ausgabe nicht wiederholen. Der Aufrufer muss
  bei abgelehnter Ausgabe im Callback einen Fehler werfen.

`delivery: delivered` bedeutet, dass der Ausgabe-Callback erfolgreich
zurückgekehrt ist; es ist kein Nachweis hörbarer Lautsprecherwiedergabe.
Ein Callback-Fehler erscheint getrennt als `delivery: failed` und
`status: delivery-failed`. Ein Absturz nach Beanspruchung oder eine fehlgeschlagene
Ergebnisspeicherung bleibt `delivery: unknown`. Es wird keine automatische
Wiederholung ausgelöst. Noch ausstehende Erinnerungen überleben einen App-Neustart
und werden bei der nächsten erlaubten Prüfung auch nach dem Zeitpunkt ausgelöst.

Die Ausgabe erfolgt nur während laufender App. Die Integration hält Prüfungen
im Datenschutzmodus zurück und darf ausdrücklich angelegte Erinnerungen im
Standby anzeigen. Es gibt keine wiederkehrenden Termine, keinen Windows-Dienst,
keine Hintergrundagenten und keine automatische Aufgabe beim Modell.

Beide Module speichern ausschließlich lokal unter `.local/`, standardmäßig in
`power-control.json` und `reminders.json`. Bei unlesbarer oder ungültiger Datei
wird sie erhalten; neue Mutationen und Ausgaben sind gesperrt. Neue Einträge und
fällige Wirkungen benötigen eine erfolgreich gespeicherte Beanspruchung.
Mit dem ausdrücklich übergebenen `file: null` arbeiten beide Module ausschließlich
im Speicher, beispielsweise für den Test-Hauptprozess ohne gestartetes Electron.
Diese Einträge überleben keinen Prozess-Neustart. Power-Aufträge benötigen auch
in diesem Modus `platform: 'win32'` und einen ausdrücklich angelegten eigenen
fälligen Timer. Tests ersetzen zusätzlich die native `execFile`-Grenze.

## Prüfung

`node --test tests/power-control.test.cjs tests/reminders.test.cjs` prüft
Zeiten, feste native Argumente, Abbruch, Wiederanlauf, konkurrierende Prüfungen,
Speicherfehler und Fehler beim Ausgabe-Callback. Native Power-Aufrufe sind dabei
ersetzt: Die Tests schalten den PC nicht aus und starten ihn nicht neu.
Die Tests belegen keine echte Audioausgabe. Ein harmloser Laufzeittest darf einen
ausreichend langen eigenen Timer planen und vor Fälligkeit abbrechen; ein echter
Neustart-/Shutdown-Test benötigt einen ausdrücklich passenden Nutzerauftrag.

Nativer Integrationstest: eigener 600-Sekunden-Power-Timer geplant und sofort
abgebrochen, native Abschaltung nicht ausgelöst. Eine einmalige Test-Erinnerung
wurde persistiert, als fällig beansprucht, angezeigt und an die tatsächliche
lokale Sprachausgabe übergeben. Countdown und Helper-Parameter ebenfalls
geprüft. Diese Beobachtungen garantieren keine Ausgabe bei beendeter App.
