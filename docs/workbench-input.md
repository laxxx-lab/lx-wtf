# Werkbank: lokale Eingabe, Warteschlange und Lehre

Der Fensterstream startet weiterhin automatisch für das ausgewählte laufende Artcraft-Fenster. Eingaben starten separat durch **Eingabe aktivieren** im Artcraft-Bereich. Das echte Quellfenster muss geöffnet und unminimiert bleiben. **Not-Aus**, Datenschutz, Ausblenden, Tab- oder App-Wechsel sperren die Eingabe.

Eingebettete Eingabe ist ausschließlich für **LightCraft 0.5.0** implementiert: einzelne linke Klicks, Scrollen, begrenzter Text und einzelne Navigationstasten. Die übrigen elf Editoren zeigen eine Ansicht; sie werden nicht als interaktiv bezeichnet. Ziehen, Malstriche, Tastenkombinationen und native Dateidialoge sind nicht freigegeben. Das Aktivieren verwendet die live laufende App und nimmt keinen Desktop-Fokus weg.

## Nachgewiesene Schnittstelle

Die installierten Dateien `I:\tools\artcraft\apps\LightCraft\README.md` und `lightcraft-cli.exe --help` beschreiben die GUI-Verbindung über `--control`. Die versionsgleichen offiziellen Quellen bestätigen `ui.click`, `ui.move`, `ui.key`, `ui.text` und `ui.scroll`: [Protokoll für v0.5.0](https://github.com/storytold/lightcraft/blob/v0.5.0/docs/control-protocol.md), [Handler für v0.5.0](https://github.com/storytold/lightcraft/blob/v0.5.0/crates/ui-egui/src/control.rs). Diese Methoden injizieren egui-Ereignisse in die laufende Anwendung. `ui.pointer` arbeitet dagegen in Bildkoordinaten und wird für die ganze Fenstervorschau nicht verwendet.

Vor einer Eingabe werden der bekannte EXE-Pfad, PID, HWND und der diesem PID zugehörige Loopback-Listener frisch geprüft. `window_input.ps1` liest ausschließlich native Fensterdaten: DWM-Rahmen, Client-Bereich, Sichtbarkeit, Minimierung, DPI und aktive native Popups. Die Desktopposition und Systemeingabe bleiben unverändert. Kein `SendInput`, kein generierter Shell-Befehl, kein Treiber, kein virtueller Desktop und keine zusätzliche Headless-Instanz.

Das Video muss im Seitenverhältnis zu genau dem Client-Bereich oder dem sichtbaren DWM-Rahmen passen. Mehrdeutige oder abweichende Geometrie wird abgewiesen. Der Renderer rechnet schwarze Ränder durch `object-fit: contain` aus; der Backend rechnet normierte Bildpunkte über den physischen Client-Bereich in aktuelle egui-Punkte. Klicks auf den nativen Fensterrahmen werden abgewiesen. Negative Monitorpositionen und DPI-Skalierung sind berücksichtigt.

## Begrenzter IPC-Vertrag

`craft-input` nimmt genau eine der folgenden Formen an; zusätzliche Felder werden abgewiesen:

```js
{appId:'light', kind:'arm', frameWidth:1500, frameHeight:1000}
{appId:'light', kind:'click', frameId:'<32 hex>', x:0.5, y:0.5}
{appId:'light', kind:'scroll', frameId:'<32 hex>', x:0.5, y:0.5, delta:120}
{appId:'light', kind:'key', frameId:'<32 hex>', key:'Enter'}
{appId:'light', kind:'text', frameId:'<32 hex>', text:'Hallo'}
```

Frame-Maße: positive ganze Zahlen bis 8192. Punkte: 0 bis 1 innerhalb des aufgezeichneten Frames. Scrollbetrag: maximal ±2000, ohne Null. Text: 1–256 UTF-16-Einheiten, ohne Steuerzeichen. Tasten: Enter, Escape, Tab, Backspace, Delete, Pfeile, Home, End, PageUp, PageDown und Space. Keine frei wählbaren Methoden, Ports, Zugangsdaten oder Dateipfade.

Ein `arm` liefert `{ok:true,appId,kind,frameId,viewport:{width,height}}`. Das Token gilt höchstens 60 Sekunden und ist an Besitzer, Geometrie, aktuelle GUI-Skalierung und Dialogzustand gebunden. Änderungen verlangen erneutes Aktivieren. Während einer laufenden Eingabe wird kein weiterer Auftrag eingereiht. Erfolgreiche Eingaben liefern begrenzte Belege; Textbelege enthalten nur die Zeichenanzahl. Eingabetext erscheint nicht im normalen UI-Ereignisprotokoll. Datenschutz und Not-Aus brechen wartende lokale Prüfungen und TCP-Verbindungen ab; eine bereits von LightCraft verarbeitete Eingabe lässt sich dadurch nicht rückgängig machen.

Der Main-Prozess übergibt intern zusätzlich den tatsächlichen Capture-Besitzer und seine Generation an `input(payload,{captureTarget,captureGeneration,getCaptureGeneration})`. Diese Werte sind keine Renderer-Argumente. Die Generation wird vor und nach jeder asynchronen Prüfung verglichen; ein neues Capture verlangt auch beim selben HWND ein neues Eingabetoken.

## Sichtbare Folgeaktionen

Im **Lagebild** erscheinen die persistierte Warteschlange und lokale Hinweise. Bei unbekanntem Auftragsergebnis bietet die UI zuerst **Remote-Status prüfen** an. Wiederholen und Fortsetzen starten erst durch einen Klick. Projektzuordnung und Hinweise zeigen die verfügbare Quelle; Hinweise führen keine Aktion selbstständig aus.

**Lehre starten** zeichnet ausschließlich erfolgreiche lokale LightCraft-Eingaben während der sichtbaren Lehre auf. Der Benutzer beschreibt jeden Schritt und bestätigt seinen sichtbaren Erfolg. Erst nach Bestätigung aller Schritte lässt sich ein Ablauf mit einem Gesamterfolgskriterium speichern. Die UI zeigt keinen aufgezeichneten Textinhalt. Gespeicherte Abläufe sollen frische UI-Ziele ermitteln und verwenden keine alten Klickkoordinaten.

## Validierung und Grenzen

Automatisierte Tests prüfen falschen Besitzer, verlorenen Listener, native Dialoge, Minimierung, DPI und negative Koordinaten, Video-Ränder, veränderte Größe und Dialoge, Privacy/Not-Aus und verspätete Auswahl/Anfragen sowie striktes IPC und UI-Aktionen. Der native Helfer ist lesend; die Implementierung wurde ohne Neustart des laufenden Lilith-Prozesses und ohne Eingaben in Benutzerfenster erstellt.

Native Prüfung am 11.10.2026: Eine eigene LightCraft-Instanz mit `--memory --no-demo`, getrennten Einstellungen und leerem Katalog wurde über einen echten Fensterstream geprüft. Escape, Klick auf das frisch gelesene Such-Widget und Texteingabe wurden übertragen; `ui.inspect.ui.search` bestätigte den eingegebenen Testtext. Dasselbe gelang nach Verschieben auf den zweiten Monitor bei 144 DPI / 150 % Skalierung, auch mit auf 1702 × 1280 skaliertem Stream. Der Benutzerkatalog und Benutzerfotos wurden nicht verwendet. Beleg: `.local/friday-light-native/result.json`. Eine vergrößerte Thumbnail-Aufnahme mit abweichendem Seitenverhältnis wurde zuvor korrekt abgewiesen. Allgemeine Geometrieabweichungen scheitern geschlossen und lassen den Stream als Ansicht verfügbar.

Die Lehre verlangt für Klick und Scrollen eine konkrete Ziel-/Aktionsbeschreibung. Ein doppelter Ablaufname oder fehlgeschlagene Speicherung lässt die erfassten Schritte erhalten. Nur die erfolgreich gespeicherte Lehre wird geschlossen.
