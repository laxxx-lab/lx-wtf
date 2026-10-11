# Mit aktuellem Inhalt arbeiten

Hermes Voice kann auf ausdrückliche Anfrage einen aktuellen lokalen Text lesen und ihn als Daten an die bestehende Gesprächswarteschlange geben. Beispiele: „Fasse das Kopierte zusammen“, „Was steht in der Zwischenablage?“, „Erklär mir dieses Fenster“ oder „Erkläre mir diese Anwendung“. Indirekte Erwähnungen und allgemeine Fragen wie „Was ist eine Zwischenablage?“ lösen keinen Zugriff aus. Die Workbench zeigt Quelle und Zeitpunkt der Momentaufnahme.

Die Quellen werden einzeln ausgewählt:

- **Zwischenablage:** ausschließlich das aktuelle Windows-Format `CF_UNICODETEXT`, höchstens 20.000 UTF-16-Zeichen ohne getrennte Surrogatpaare. Keine Bilder, Dateiliste oder Kopierhistorie. `OpenClipboard`/`GetClipboardData` lesen; `CloseClipboard` gibt die Sperre frei. Es gibt weder Kopiertastenkürzel noch `EmptyClipboard`/`SetClipboardData`, Listener oder Polling. Eine geänderte Sequenznummer verwirft das Ergebnis.
- **Fenster:** ausschließlich das gerade ausgewählte Vordergrundfenster, als frische Identität aus HWND, PID, Prozessname, Fenstertitel und Prozessstartzeit. Die Auswahl gilt höchstens 15 Sekunden. UI Automation liest die als sichtbar gemeldeten Textbereiche und Beschriftungen innerhalb dieser Fensterwurzel. Keine Screenshots, Mausaktionen, Tasten, Fokusänderung, `ValuePattern` oder Änderungen an der Anwendung. Mehr als 600 UIA-Knoten, ein Quellenwechsel oder ein nicht beantwortender Provider brechen den Zugriff ab.

Passwortmanager, erkennbare Anmelde-, Zahlungs- und private Browserfenster werden ausgeschlossen. UIA-Passwortfelder, erkennbar sensible Eingabefelder und Anmeldeschaltflächen sperren das Fenster vor und nach dem Lesen. Allgemeiner Dokumenttext über Passwörter oder Tokens ist lesbar; bekannte Zugangsdaten, Bearer-Token, Schlüssel und URL-Parameter werden über die bestehende lokale Redaktion entfernt. Gewöhnliche Codex- und ChatGPT-Fenster sind zulässige Quellen. Unsere eigenen Hermes-Voice-/Lilith-Fenster werden durch `ownPids` und ihre Fenstertitel ausgeschlossen.

Der Helfer läuft nur in der aktiven Windows-Konsolensitzung auf dem normalen Eingabedesktop. Ein gesperrter Desktop, eine andere Sitzung, eine unlesbare Quelle oder ein Fehler liefert eine feste Fehlermeldung statt vermuteter Inhalte. Rohfehler und ausgeschlossene Inhalte werden nicht in Fehlermeldungen übernommen.

UIA ist eine Textschnittstelle der jeweiligen Anwendung. Sie kann unvollständige Beschriftungen statt eines Dokumentes liefern; dieses Ergebnis nennt diese Einschränkung ausdrücklich. Text innerhalb eines verdeckten oder vom Provider falsch beschriebenen Elementes lässt sich mit UIA nicht unabhängig visuell bestätigen. Es wird keine vollständige Ansicht behauptet.

## Integration

`current-content.cjs` exportiert vier Funktionen:

```js
const {
  currentContentIntent,
  captureCurrentContentTarget,
  readCurrentContent,
  currentContentPrompt,
} = require('./current-content.cjs');

const intent = currentContentIntent(question); // null oder { kind, question }
// Die vorhandene Datenschutz-/Pause-Schranke wird vor diesem Schritt geprüft.
const ownPids = [process.pid];
const target = intent.kind === 'window'
  ? await captureCurrentContentTarget({ ownPids }, { signal })
  : undefined;
const observation = await readCurrentContent({
  kind: intent.kind, target, ownPids,
}, { signal });
// Erst danach die Workbench präsentieren, damit die ursprüngliche Quelle bestehen bleibt.
const prompt = currentContentPrompt(intent.question, observation);
// prompt in die bestehende Gesprächswarteschlange geben.
```

`captureCurrentContentTarget` liest nur Fenstermetadaten. `readCurrentContent` kann ohne `target` das gegenwärtige Vordergrundfenster in einem Aufruf auswählen und lesen. Mit `target` muss dieselbe Identität vor und nach dem Lesen bestehen. Ein zwischenzeitlich geöffnetes eigenes Hostfenster ist nur mit ausdrücklich übergebenem Host-PID als Vordergrund zulässig; ein anderes Vordergrundfenster verwirft die Auswahl.

Die Beobachtung hat die Form `{ kind, source, observedAt, text, truncated, limitations, untrusted: true }`. `observedAt` und `selectedAt` sind ISO-Zeitpunkte. `source` enthält `kind` und `label`; Fensterquellen enthalten zusätzlich `app`, `windowTitle`, `pid`, `hwnd` und `processStartedAt`. Die Workbench stellt alle Werte als Text dar. Inhalt, HTML, Rollenbezeichnungen und eingebettete Aufforderungen bleiben unvertrauenswürdige Daten. `currentContentPrompt` benennt diese Grenze für dieselbe bestehende Hermes-Sitzung; es erzeugt keine weitere LLM-Verbindung.

Fehler besitzen feste Codes: `CURRENT_CONTENT_EMPTY`, `SENSITIVE_WINDOW`, `OWN_WINDOW`, `WINDOW_CHANGED`, `CLIPBOARD_CHANGED`, `DESKTOP_UNAVAILABLE` oder `UNAVAILABLE`. Abbruchsignale erhalten `AbortError`. Ungültige Aufrufparameter ergeben `TypeError` ohne nativen Zugriff.

Die Datenschutz-Schranke und Gesprächsfortsetzungen gehören dem aufrufenden Host. Dieser Helfer besitzt weder Hintergrundbeobachtung noch Speicherdatei. Eine Fortsetzung zu einer vorher gelesenen Quelle muss den damaligen Zeitpunkt kenntlich machen; eine neue aktuelle Ansicht braucht eine neue ausdrückliche Quellenanfrage.

## Prüfung

```powershell
node --test tests/current-content.test.cjs tests/current-content-native.test.cjs
# Zusätzlich ausschließlich das separate native Testfenster lesen:
$env:CURRENT_CONTENT_NATIVE_TEST='1'
node --test tests/current-content-native.test.cjs
```

Die normalen Tests prüfen explizite Sprachabsichten, redaktionelle Grenzen, Unicode-Limits, leere/fehlerhafte Quellen, Abbruch, frische Auswahl und Änderungen von HWND/PID/Titel/Prozessstart. Der native Standardtest kompiliert die tatsächlich verwendete C#-Implementierung und prüft deren Regeln ohne Desktop- oder Zwischenablageninhalt zu lesen. Der zusätzliche UIA-Test erstellt und schließt nur sein eigenes kurzlebiges Fenster, liest sichtbaren und versteckten Testtext sowie ein Passwortfeld und verändert weder Benutzerzwischenablage noch Fokus oder Eingaben. Der tatsächliche Inhalt einer Benutzerzwischenablage wird für diese Prüfungen nicht gelesen oder überschrieben.

Windows-API-Grundlagen: [Zwischenablage verwenden](https://learn.microsoft.com/en-us/windows/win32/dataxchg/using-the-clipboard), [sichtbare UIA-Textbereiche](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getvisibleranges?view=windowsdesktop-9.0).
