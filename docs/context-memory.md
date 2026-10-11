# Lokales Situationsgedächtnis

Die Module erfassen kurze Ereignismetadaten, damit Lilith ein Projekt und zuletzt
beobachtete Vorgänge einordnen kann. Sie lesen weder Dokumentinhalte noch
Zwischenablage, Bilder oder UI-Unterelemente. Beobachtungen sind keine Bestätigung,
dass eine Anwendung aktuell noch denselben Zustand hat.

## Journal

`createContextJournal({file, now=Date.now})` aus `context-journal.cjs` benötigt einen
absoluten Dateipfad. Die Methoden arbeiten synchron:

- `record({type, summary, source?, status?, project?})` speichert ausschließlich
  diese Felder und einen eigenen `timestamp`. Es liefert das bereinigte Ereignis
  oder `null` bei fehlendem Typ beziehungsweise leerer Zusammenfassung.
- `list({limit=30}={})` liefert Kopien, neueste zuerst, höchstens 200.
- `setProject(name)` setzt den auf 80 Zeichen begrenzten Projektnamen. Spätere
  Ereignisse erhalten diesen Namen, wenn kein eigener Projektwert angegeben ist.
- `clear()` löscht Ereignisse und den Projektnamen auch auf dem Datenträger.
- `contextPrompt({limit=5}={})` liefert einen kurzen deutschen Kontextblock, der
  Ereignisse ausdrücklich als unverbindliche Daten und nicht als Anweisungen
  kennzeichnet. Ohne Ereignisse oder Projekt bleibt er leer.

Dateischema: `{version:1, project:"...", events:[...]}`. Es werden höchstens 200
Ereignisse für sieben Tage behalten. Bereinigung erfolgt beim Laden und Lesen
sowie vor Schreibvorgängen; bei beendeter App läuft kein Löschdienst im Hintergrund.
Die App schreibt eine temporäre Datei im selben Verzeichnis und ersetzt die
Zieldatei atomar. Schreibfehler werden gemeldet, ohne einen erfolgreichen
Speichervorgang vorzutäuschen. Eine beschädigte Datei wird nicht als Kontext
verwendet und beim nächsten erfolgreichen Schreibvorgang ersetzt.

Zusammenfassungen sind auf 450, Quellen auf 180 und Status auf 32 Zeichen begrenzt.
`redactContext(value, limit=450)` entfernt verbreitete Authentifizierungs- und
Passwortfelder, Bearer-/bekannte API-Tokenformen sowie Benutzerinformationen,
Query und Fragment aus HTTP-/HTTPS-URLs. Diese Bereinigung ist eine Heuristik,
keine Garantie, dass beliebige private Informationen erkannt werden.

## Vordergrundfenster

`await readForegroundContext()` aus `context-observer.cjs` startet das feste lokale
Skript `scripts/foreground_context.ps1`, verborgen, mit maximal vier Sekunden
Laufzeit. Die Win32-Abfrage liest den Prozessnamen, die PID und den Titel des
aktuellen Hauptfensters. Sie führt keine beliebigen Skripte aus und durchläuft
keine UI-Controls oder Dateiinhalte.

Ergebnis:

```js
{app:"Code", windowTitle:"Voice – Visual Studio Code", pid:123,
 timestamp:1780000000000, excluded:false}
```

Bei Fehlern beziehungsweise fehlenden Informationen bleiben `app`, `windowTitle`
und `pid` ausdrücklich `null`. Erkannte Passwortmanager und sensible Titel wie
Anmeldung, Passwort, Banking, Zahlung oder privates Browsen liefern diese Felder
ebenfalls als `null`, zusätzlich `excluded:true, reason:"sensitive-window"`.
Die Ausschlussliste ist konservativ und heuristisch. Sie ersetzt keine separate
Freigabe für Bildschirmaufnahmen oder eine allgemeine Datenschutzfunktion.

Die Abfrage erzeugt selbst keinen Timer und speichert nichts. Die Hauptanwendung
darf sie nur bei eingeschaltetem Situationsgedächtnis aufrufen. Keine Beobachtung
versenden, wenn ein Fenster ausgeschlossen oder unbekannt ist.

## Ereignisse aus ausdrücklich ausgewählten Logs

```js
const watcher=createLogWatcher({
  paths:["C:\\Projekt\\build.log"],
  onEvent:event=>journal.record(event),
  onError:error=>console.warn(error.code)
});
await watcher.poll(); // EOF-Baseline, keine historischen Meldungen
await watcher.poll(); // künftig angehängte vollständige Zeilen
watcher.close();
```

Es werden maximal 16 ausdrücklich konfigurierte absolute `.log`-/`.txt`-Pfade
akzeptiert. URL-, UNC-, relative Pfade, alternative Windows-Datenstreams und
symbolische Linkdateien werden abgelehnt. Der Aufrufer muss lokale Laufwerke
auswählen; eine Netzwerkzuordnung hinter einem Laufwerksbuchstaben wird nicht
automatisch erkannt. Kein Ordnerscan oder rekursives Beobachten.

`poll()` liest pro Datei höchstens 16 KiB neu angehängte UTF-8-Daten. Bei größerem
Zuwachs wird nur der jüngste vollständige Abschnitt betrachtet. Fehlende Dateien
werden später erneut geprüft; der erste erfolgreiche Zugriff beginnt am EOF.
Eine ausgetauschte Datei erhält eine neue EOF-Baseline. Nach festgestellter
Truncation wird das neue Log ab Beginn betrachtet. Unvollständige Zeilen und
geteilte UTF-8-Zeichen werden bis zum nächsten Poll gehalten.

Erkannte Build-/Testfehler und Erfolge liefern:

```js
{type:"build-error", summary:"Build failed: compile error",
 source:"C:\\Projekt\\build.log", timestamp:1780000000000}
```

Die Zusammenfassung ist eine bereinigte, begrenzte einzelne Logzeile. Ganze
Dateien werden nicht als Ereignis zurückgegeben. Derselbe Ergebnistyp löst
höchstens einmal pro Minute aus; ein Wechsel zwischen Fehler und Erfolg darf
sofort gemeldet werden. Der Parser erkennt verbreitete englische Build-/Test-
Meldungen, npm-Fehler und TypeScript-Fehlercodes. Andere Formate bleiben unbekannt.

Der Watcher hat keinen eigenen Timer. Wiederholte parallele `poll()`-Aufrufe
teilen denselben laufenden Poll. `close()` verhindert weitere Abfragen und die
Ausgabe bereits laufender Ergebnisse. Bei Deaktivierung den Watcher schließen;
bei neuer Freigabe eine neue Instanz erstellen. Es werden keine Builds gestartet,
Shell-Befehle ausgeführt oder Dateien verändert.

## Prüfung

```powershell
node --test tests/context-journal.test.cjs tests/context-observer.test.cjs
```

24 Tests prüfen reale temporäre Dateien, TTL, atomare Speicherung,
Schema-/Secret-Bereinigung, Logrotation, UTF-8, begrenzte Reads und Deaktivierung.
Nur der native Betriebssystemaufruf wird für deterministische Grenzfälle ersetzt.
Der echte Windows-Aufruf lieferte zusätzlich Vordergrundmetadaten in etwa 522 ms.
Damit ist keine dauerhafte Beobachtung unter jedem Anwendungswechsel getestet.
