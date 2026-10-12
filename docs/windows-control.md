# Windows-Fenster auflisten und wechseln

`windows-control.cjs` verwendet ausschließlich den festen nativen Helfer
`scripts/windows_control.ps1`. Der Aufruf erfolgt mit `execFile`, `shell:false`,
verborgenem PowerShell-Fenster, Zeitlimit und optionalem `AbortSignal`.
Es gibt keine freien Shellbefehle, Tastensimulation oder Texteingabe.

## Modulvertrag

```js
const { createWindowsControl } = require('./windows-control.cjs');
const windowsControl = createWindowsControl();
const { windows, observedAt } = await windowsControl.read({ signal });
// Nach eindeutiger Auswahl aus der frischen Liste:
const { id, pid, processStartedAt } = windows[0];
const result = await windowsControl.focus({ id, pid, processStartedAt }, { signal });
```

`read()` liefert `{windows, observedAt}` mit UTC-Zeit als ISO-Zeichenfolge.
Jeder Eintrag enthält `id` (dezimaler HWND als Zeichenfolge), `pid`, `title`,
`app` (Prozessname ohne Pfad) und `processStartedAt` (UTC-ISO-Zeit mit voller
Windows-Präzision). Die Zeit darf für den Fokusaufruf nicht gekürzt oder mit
JavaScript `Date` neu formatiert werden. Leere, nicht verfügbare und veraltete
Beobachtungen unterscheiden: Ein nicht verfügbarer Desktop wirft einen Fehler;
eine gültige leere Liste enthält `windows:[]`.

`focus()` erwartet genau `{id,pid,processStartedAt}` und liefert
`{verified,status,message,evidence}`. Vor jeder Wirkung überprüft der Helfer
Fensterbesitzer, Prozessstart und Desktop erneut. Minimierte Fenster werden
mit `ShowWindowAsync(SW_RESTORE)` wiederhergestellt. Danach folgt ausschließlich
`SetForegroundWindow`; falls nötig folgt einmal `AutomationElement.FromHandle(...).SetFocus()` am erneut geprüften Ziel. Es werden keine Steuerelemente traversiert oder Tastendrücke erzeugt; Windows darf den Wechsel ablehnen.

`completed` und `verified:true` erfordern eine frische native Beobachtung:
genau derselbe HWND, Besitzer und Prozessstart im Vordergrund, gültiger Desktop,
Fenster nicht mehr minimiert. `failed` bedeutet abgelehnte oder veraltete Auswahl
vor einer möglichen Wirkung. `unverified` bedeutet fehlenden Ergebnisnachweis,
Zeitlimit oder Transportfehler nach möglichem Beginn. Eine unbekannte Wirkung
darf nicht automatisch erneut ausgeführt werden; zuerst die Fenster frisch lesen.
Die Belege enthalten ausschließlich Identität, Vordergrund-IDs, Sitzung und Zeit.

## Datenschutz und Grenzen

Die aufrufende lokale Steuerungs-API muss die bestehende
Datenschutzfreigabe vor dem Lesen oder Wechseln prüfen. Eine ausdrücklich
angeforderte Bedienung ist auch im Standby möglich. Fenstertitel sind
private Metadaten und gehören nicht in dauerhafte Aufträge oder Diagnose-Logs.
Der Helfer liest nur Fenstertitel und Prozessnamen, keine Dokumenttexte,
Browserinhalte, UI-Automation oder Eingaben. Native Fehlerdetails werden durch
feste Meldungen ersetzt.

Erfasst werden normale sichtbare, nicht von DWM ausgeblendete Hauptfenster im
aktuellen angemeldeten lokalen Konsolen-Desktop `Default`, einschließlich
minimierter Fenster. Hilfsfenster und gewöhnliche Dialogfenster mit Besitzer
ohne `WS_EX_APPWINDOW` werden nicht angeboten. Fenster anderer Sitzungen,
gesperrte/geschützte Desktops sowie SSH-, Dienst- und RDP-Sitzungen werden
abgelehnt. Es wird keine Sitzung, Anwendung oder Gateway gestartet oder beendet.
Ein Ergebnisnachweis beschreibt den beobachteten Zeitpunkt; der Benutzer oder
eine Anwendung kann danach erneut den Vordergrund wechseln.

## Prüfung

`node --test tests/windows-control.test.cjs` prüft feste native Argumente,
ungültige Kennungen, Prozesswechsel, veraltete Beobachtungen, verweigerte
Wiederherstellung/Fokuswirkung und bereinigte Transportfehler mit Ersatztransport.
Eine echte Auflistung wurde im aktiven Windows-Desktop zusätzlich geprüft.
Die echte Liste enthielt die native Testfenster-Identität. Der tatsächliche
Fokusversuch wurde vom interaktiven Windows-Desktop abgewiesen; die API meldete
`unverified` mit dem weiterhin fremden Vordergrundfenster. Kein Erfolg wurde
behauptet. Hermes darf bei Bedarf seinen vorhandenen Windows-MCP-Bedienweg
verwenden; keine unbegrenzten oder blinden Fokus-Wiederholungen.
