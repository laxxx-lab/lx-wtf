# Sprechtaste

In **Einstellungen → Sprache / Direkt** die Sprechtaste aktivieren, **F8**, **F9** oder **Ctrl + Leertaste** auswählen und speichern. Standardmäßig ist sie ausgeschaltet; die vorbereitete Belegung ist F8.

Die gewählte Taste gedrückt halten, sprechen und loslassen. Loslassen beendet die Aufnahme sofort und startet die lokale Spracherkennung. Ein Aktivierungswort und die automatische Satzenderkennung sind dafür nicht erforderlich. Der erkannte Auftrag verwendet dieselbe ausgewählte Hermes-Session und denselben Befehlsweg wie die übrige Sprachbedienung, einschließlich Erkennungswörterbuch und direkten Standardbefehlen.

Die Taste funktioniert global unter Windows, auch bei verkleinertem Orb oder während eine andere Anwendung im Vordergrund ist. Während ihrer Verwendung ist die gewählte Belegung für Lilith reserviert. Andere Belegungen sowie AltGr werden nicht als Sprechtaste behandelt. Das bestehende **Ctrl + Alt + Leertaste** schaltet weiterhin den Live-Modus um.

## Mikrofon, Live und Standby

- Bei ausgeschaltetem Live-Modus und Aktivierungswort öffnet die Taste das Mikrofon nur für die gehaltene Aufnahme. Loslassen schließt es bereits vor der Transkription.
- Ein bereits verwendetes Live- oder Aktivierungswort-Mikrofon wird weiterverwendet. Live bleibt aktiv; die automatische Aufnahme wartet während der gehaltenen Aufnahme und Transkription und setzt danach gemäß dem bisherigen Gesprächsablauf fort.
- Standby bleibt Standby. Die Taste startet kein dauerhaftes Live-Gespräch und stellt keine Kamera wieder her. Die für ein späteres Aufwachen gespeicherte Kamerapräferenz bleibt erhalten.
- Ein Druck während eines laufenden Auftrags, einer Antwort oder einer anderen Sprachtranskription wird mit einem lokalen Hinweis abgewiesen. Die Sprechtaste unterbricht keinen unbekannten laufenden Auftrag. Die bestehende geprüfte Live-Unterbrechung bleibt verfügbar.

Eine Verbindung und eine ausgewählte Session sind erforderlich. Datenschutzsperre, Not-Aus, Verbindungsverlust, Sessionwechsel, Umbelegen oder Deaktivieren brechen eine noch gehaltene Aufnahme ab. Verspätete Freigaben des Mikrofons und verspätete Transkriptions- oder Befehlsprüfergebnisse dürfen danach keinen Auftrag mehr senden. Nach spätestens 30 Sekunden wird eine gehaltene Aufnahme verworfen; sie wird dabei nicht automatisch gesendet. Eine leere Aufnahme erzeugt keinen Auftrag.

## Korrekturen prüfen

Das Erkennungswörterbuch ersetzt ausschließlich die selbst eingetragenen Fehlerformen nach der lokalen Transkription. Es trainiert kein Sprachmodell. Unter dem Gespräch erscheint bei einer tatsächlichen Ersetzung ein aufklappbarer Vergleich von **Erkannt** und **Korrigiert**. Es wird nur der letzte Vergleich mit höchstens 3000 Zeichen pro Text gehalten. Die nächste Aufnahme oder Datenschutzsperre entfernt ihn. Der Vergleich erzeugt keinen zusätzlichen Hermes-Auftrag und wird nicht in die Zeitmessung geschrieben.

## Ereignisvertrag

Der Windows-Helfer liefert getrennte Druck- und Loslasskanten; Electron sendet sie als `ptt-control` an den Renderer:

```js
{ type: 'ptt-control', pressed: true, sequence: 1, at: 1791700000000 }
{ type: 'ptt-control', pressed: false, sequence: 1, at: 1791700001500 }
```

`sequence` ist eine positive sichere Ganzzahl. Druck und Loslassen gehören zu derselben Sequenz; jeder neue Druck verwendet eine höhere Sequenz. Wiederholungen und alte oder ungepaarte Kanten werden ignoriert. Ein Loslassen mit `cancelled: true` verwirft die Aufnahme. `at` ist der UTC-Zeitstempel in Millisekunden. Der Hauptprozess prüft Alter, Format und aktuelle Freigabe; der Renderer bindet Aufnahme und Versand zusätzlich an die aktuelle Session, Live-Generation und Tastenkonfiguration.

Der Helfer verwendet einen Windows-Tastatur-Hook mit verstecktem Prozess und erfasst nur die unterstützte Belegung. Beim Beenden, Verlust des Helfers oder Ablauf der Haltefrist wird eine noch gehaltene Sequenz abgebrochen. Es gibt keine zusätzliche IPC-Methode zum Starten eines Mikrofons; der Renderer nutzt die bestehenden Mikrofon-, Transkriptions- und Versandwege.

## Prüfung ohne echte Sensoren

```powershell
node --test tests/voice-renderer.test.cjs tests/renderer-control.test.cjs tests/push-to-talk-hotkey.test.cjs
```

Die Renderer-Prüfungen speisen künstliche PCM-Frames in den echten Aufnahmeweg ein und prüfen Loslassen genau einmal, Standby-Wiederverwendung, Live-Fortsetzung, verspätete Mikrofonfreigaben, alte Kanten, Datenschutz, Sessionwechsel, Verbindungsverlust und verzögerte Ergebnisse. Dabei werden keine echten Mikrofone oder Kameras aktiviert.
