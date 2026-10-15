# Lokale Workbench-Gesten

Zusätzlich gibt es seit 14.10.2026 einen ausdrücklich separat aktivierten
[Desktopmodus](desktop-gestures.md) für Webseiten, Projekte und andere normale
Windows-Programme. Die folgenden Einschränkungen und Gesten beschreiben den
Werkstattmodus. Im Desktopmodus sind dessen Navigationsaktionen pausiert;
Zeigen/Pinch steuern stattdessen den echten Mauszeiger, zwei Finger scrollen
und zwei bewusst greifende Hände zoomen. Bei jedem App-Start ist Desktopsteuerung aus.

Die Gestensteuerung ist standardmäßig aus und wird ausdrücklich eingeschaltet. Zuerst muss die Kamera bereits aktiv sein. Die Gestenerkennung verwendet genau das Video und den Stream der ausgewählten Kamera (`cameraControls.controller.video`). Sie fordert keinen zweiten Kamerazugriff an, startet die Kamera nicht und beendet keine Kameratracks.

Die Erkennung läuft lokal in einem Web Worker. Bilder werden kurzzeitig als `ImageBitmap` an diesen Worker übergeben und nach der Auswertung freigegeben. Die Gestenfunktion lädt keine Kamerabilder hoch und speichert keine Bilder. Die sonstigen Kamerafunktionen behalten ihre eigenen Einstellungen.

## Unterstützte Gesten

| Geste | Aktion |
| --- | --- |
| Offene Hand etwa 550 ms ruhig halten | Workbench einblenden |
| Faust etwa 550 ms ruhig halten | Workbench ausblenden |
| Offene Hand deutlich nach links wischen | Nächster Workbench-Bereich |
| Offene Hand deutlich nach rechts wischen | Vorheriger Workbench-Bereich |
| Zeigefinger gestreckt, übrige Finger gefaltet, kurz ruhig halten | Sichtbaren Graphknoten hervorheben |
| Daumen und Zeigefinger zusammenführen; übrige Finger dürfen entspannt sein | Projekt-Orb horizontal drehen und mit vertikaler Bewegung zoomen |

Die horizontale Gestenerkennung ist für den eigenen Frontkamera gespiegelt: Handpunkt, Wischrichtung und räumliches Zeigen/Greifen folgen seiner Links-/Rechtsbewegung. Die vertikale Richtung bleibt unverändert. Eine Wischbewegung muss mindestens 22 % der Bildbreite erreichen, mindestens 200 ms dauern und innerhalb von 850 ms erfolgen. Kleine Bewegungen, diagonales Wischen und Wischen mit einer Faust werden nicht als Navigation gewertet.

Eine Haltepose löst höchstens eine Öffnen-/Schließen-Aktion aus. Wischen wird jetzt mit derselben offenen Hand erneut freigegeben: nach dem Wisch die Hand in die Kameramitte zurückführen (35–65 % der Bildbreite) und dort 150 ms ruhig halten. Zwischen Aktionen liegen mindestens 1 Sekunde; ruhiges Halten darf schon während dieser Pause beginnen. Rückführbewegungen lösen keinen Gegen-Wisch aus. Nach der Freigabe wird ein neuer seitlicher Wisch erkannt, ohne erneut die Werkstatt zu öffnen. Eine Faust muss für eine erneute Schließen-Aktion weiterhin gelöst werden. Unsichere Erkennung, fehlende Hand oder unterbrochene Bildfolge setzt die Haltezeit zurück.

Genau eine Hand mit 21 endlichen Landmarken und hinreichend sicherer Händigkeit wird ausgewertet. Erkennungs-, Handpräsenz- und Tracking-Schwellen liegen im Handmodell bei 0,7; räumliche Gesten verlangen beim Einstieg mindestens 0,85 Händigkeitssicherheit und bei fortgesetztem Zeigen/Greifen mindestens 0,8. Diese Werte beschreiben die Händigkeit, nicht eine vom Modell ausgegebene allgemeine Erkennungsqualität. Fingerwinkel und Abstände entscheiden über offene Hand und Faust; dort bleibt die Daumenstellung unerheblich. Zeigen verlangt einen gestreckten Zeigefinger und drei gefaltete Finger. Pinch verwendet den Abstand zwischen Daumen- und Zeigefingerspitze relativ zur Handbreite: Eintritt bis 0,24, Loslassen oberhalb 0,4. Eine räumliche Pose muss zunächst 150 ms anhalten; ein neues Greifen braucht zusätzlich mindestens 100 ms. Diese Hysterese verhindert raschen Wechsel an einer einzigen Abstandsschwelle.

Die Koordinaten werden auf einen kalibrierbaren Kamerabereich begrenzt; standardmäßig entsprechen die mittleren 80 % des Bildes dem Bereich 0 bis 1. Der Konstruktorparameter `spatialBounds: {left, right, top, bottom}` erlaubt einen anderen normalisierten Bereich mit mindestens 10 % Breite und Höhe. Es bleibt eine geometrische Heuristik: gutes Licht, eine vollständig sichtbare Hand und deutliche Gesten verbessern die Zuverlässigkeit. Die Erkennung ist mit synthetischen Händen geprüft, nicht für sämtliche realen Haltungen empirisch kalibriert.

Gesten steuern ausschließlich die Workbench und darin die sichtbare Graphansicht. Sie senden keine Agentenprompts und führen keine globalen Klicks, Löschaktionen oder Kameraaktivierungen aus. Kameraabschaltung, Kameraverlust, Datenschutz und Kamerawechsel beenden die Erkennung und geben den Detektor frei. Fehlende/unsichere Hände, Bildlücken über 350 ms, ein hängender Worker und verspätete Modellantworten beenden räumliches Greifen. Die Oberfläche zeigt deutsche Zustände wie „Gesten aus“, „Gestenmodell wird lokal geladen …“ und „Gesten nicht verfügbar“.

## Renderer-Vertrag

`ui/gesture-controller.js` stellt `window.GestureController` und für Node-Tests den CommonJS-Export `{ GestureController }` bereit.

```js
const gestures = new GestureController({
  loadDetector: loadGestureDetector,
  onAction: action => applyWorkbenchAction(action),
  onSpatial: value => sendVisibleGraphGesture(value),
  onState: state => renderGestureState(state)
});
await gestures.enable(cameraControls.controller.video);
// Beim Abschalten der Gesten oder der Kamera und vor Kamerawechsel:
gestures.disable();
```

Der Konstruktor akzeptiert außerdem `now`, standardmäßig `performance.now`, für eine monotone Uhr. `active` ist erst nach erfolgreichem Laden wahr. `enable(video)` liefert `Promise<boolean>` und verwendet bei erneutem Aufruf für dieselbe Kamera den vorhandenen oder gerade ladenden Detektor. `disable()` beendet Timer und Detektor sofort; ein verspätet fertig geladenes Modell wird ebenfalls geschlossen.

`loadDetector()` liefert einen Detektor mit `detectForVideo(video, timestamp)` und `close()`. `detectForVideo` darf ein `HandLandmarkerResult` oder ein Promise darauf liefern. Die produktive Implementierung in `ui/gesture-loader.js` lädt `ui/gesture-worker.js` und liefert das Ergebnis asynchron; der Worker führt die synchrone MediaPipe-Auswertung außerhalb des UI-Threads aus. `close()` beendet den Worker und verwirft offene Anfragen.

Der Controller prüft alle 25 ms auf ein neues Bild und fragt etwa alle 50 ms eine Auswertung an (2 ms Toleranz für Timer-Jitter): Ziel sind 20 Auswertungen pro Sekunde, identische Videozeitpunkte werden übersprungen, und höchstens eine Auswertung ist gleichzeitig offen. `tick(video = this.video)` ist asynchron; nach Abschaltung oder Neustart eintreffende Ergebnisse und Fehler werden verworfen. Für Tests kann `process(result, timestamp)` synthetische Ergebnisse direkt auswerten. Beide Methoden lösen bei ausgeschaltetem Controller keine Aktionen aus.

`onAction` erhält weiterhin einen dieser Strings: `workbench-show`, `workbench-hide`, `workbench-next`, `workbench-previous`. `onSpatial` erhält `{kind: 'pointer', x, y, pinching, generation, sequence, at}` oder `{kind: 'cancel', generation, sequence, at}`. `x`/`y` sind begrenzte normalisierte Bildkoordinaten, `at` ist die lokale Unixzeit in Millisekunden; Generation und steigende Sequenz verhindern Wiedergabe alter Ergebnisse. `onState` erhält `{active, loading, status}` mit optionalem `pose` (`palm`, `fist`, `point`, `pinch`), `action`, `progress` (0 bis 1) und `error`. Haltegesten zeigen ihren Fortschritt in 10-%-Schritten. Unveränderte Statuspakete werden unterdrückt.

Der Hauptprozess nimmt räumliche Objekte wie die bisherigen Navigationsstrings über `gesture-action` an, prüft Datenschutz, aktivierte Kamera und Gesten und leitet `gesture-update` nur an eine sichtbare Graphansicht weiter. `ProjectGraphView.mount(...).gesture(value)` prüft Sichtbarkeit, Reihenfolge, Generation, Koordinaten und Frische selbst erneut. Ereignisse über 500 ms alt oder über 50 ms in der Zukunft werden verworfen. Pointing verändert nur die Hervorhebung; Pinch verändert nur Orb-Rotation und Zoom zwischen 0,5 und 4. Die Graphansicht akzeptiert zusätzlich einen lokalen typisierten `{kind:'zoom', delta, generation, sequence, at}`-Aufruf mit `delta` zwischen −1 und 1; der Kameracontroller emittiert ausschließlich Pointer oder Abbruch. Keine Ereignisse rufen `graph-source` oder Betriebssystemeingaben auf. Nach 500 ms ohne frisches Ereignis, beim Verstecken und bei `cancel` beendet die Ansicht das Greifen. `cancelGesture()` erlaubt der Workbench, bei Datenschutz, Tabwechsel und verstecktem Fenster sofort lokal abzubrechen, ohne ein Sensorereignis zu erzeugen. Beim Abschalten der Kamera oder beim Wechsel ruft der Renderer ausdrücklich `disable()` auf.

## Lokale Laufzeitdateien

- Paket: `@mediapipe/tasks-vision` Version `1.1.0`, insbesondere `vision_bundle.mjs`.
- WASM-Verzeichnis: `node_modules/@mediapipe/tasks-vision/wasm`, mit allen zusammengehörigen `vision_wasm_internal`, `vision_wasm_module_internal` und `vision_wasm_nosimd_internal` Dateien (`.js` und `.wasm`).
- Handmodell: `runtime/gestures/hand_landmarker.task`.

Das Modell wird mit `runningMode: 'VIDEO'`, `numHands: 2`, GPU-Ausführung mit OffscreenCanvas und CPU-Rückfall und den drei Sicherheitsschwellen `0.7` erstellt. Ein leeres internes Canvas wärmt den GPU-Rechenpfad vor der Bereitmeldung auf; Fehler dabei führen ebenfalls auf CPU zurück. Paket, WASM und Modell werden lokal geladen. Eine zweite erkannte Hand pausiert die Steuerung, damit nicht unbemerkt zwischen Händen gewechselt wird. Die [offizielle MediaPipe-Dokumentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) beschreibt Modellinitialisierung, Videoauswertung und Landmarken; sie weist darauf hin, dass die synchrone Erkennung den aufrufenden Thread blockiert.

Automatisierte Prüfung ohne Kamera: `node --test tests/gestures.test.cjs tests/gesture-worker.test.cjs tests/gesture-loader.test.cjs tests/project-orb.test.cjs`. Die Tests verwenden synthetische Landmarken und Detektoren, prüfen Zeigen/Pinch, kalibrierte Grenzen, Hysterese, Greif-Abbruch, lokale Graphveränderung sowie Haltegesten, Wischbewegungen, Sperrzeit, Kameraverlust und asynchrone Ergebnisse. Eine echte Kamera wird durch diese Tests nicht gestartet; die Erkennung bei realen Händen ist damit nicht empirisch geprüft.

`node --test tests/project-graph-view.test.cjs` prüft zusätzlich tatsächliche DOM-Darstellung und lokale Interaktion in einem separaten versteckten Electron-Fenster mit temporärem Profil. Berechtigungen und Netzwerkzugriffe sind dort gesperrt. Die Prüfung belegt getrennte Aktivitätsfarbe/Suchauswahl, Zeigehervorhebung, Pinch-Zoom, keinen Quellzugriff durch Gesten, Abbruch/Neustart der Renderer-Generation sowie versteckte und geschlossene Ansichten. Die vorhandene Nutzer-App wird dabei nicht neu gestartet.


Zusätzliche native Prüfung: Das Modell und WASM wurden in einem klassischen Electron-Worker wirklich geladen. Ein leeres Canvas lieferte keine Hand; das öffentliche MediaPipe-Bild right_hands.jpg lieferte eine Hand und löste bei stabiler Pose workbench-show aus. Es wurde keine Nutzerkamera für diesen Test geöffnet. Kamera, Licht und Handhaltung am tatsächlichen Arbeitsplatz bleiben für einen Praxistest offen.

Seit 12.10.2026: Video-ImageBitmaps werden vor dem Worker-Transfer auf höchstens 960 × 720 Pixel verkleinert, mit erhaltenem Seitenverhältnis; kleine Kamerabilder werden nicht vergrößert. Zeigekoordinaten werden zeitabhängig geglättet (80 ms für kleine Bewegungen, 25 ms für deutliche Bewegung). Große Sprünge und Wechsel zwischen Zeigen/Greifen werden unmittelbar übernommen. Greifen verwendet den Mittelpunkt zwischen Daumen und Zeigefinger; Handverlust und unsichere Erkennung beenden weiterhin sofort das Greifen. Haltezeit 550 ms, Sperrzeit 1 Sekunde, Zeigen 150 ms.

Messung auf dem eigenen PC am 12.10.2026: Reale GPU/Worker-Pipeline mit synthetischem Video und einer zugeschnittenen öffentlichen Referenzhand: 19,7 Auswertungen/s, durchschnittlich 31,5 ms, eine erkannte Hand in 78/78 ausgewerteten Frames, genau eine Öffnen-Geste. Das ist ein Referenztest, keine Trefferquote für den eigenen reale Hände. Im vorhandenen HD-Webcam-C525-Stream: etwa 15,1 Auswertungen/s und 12,0 ms im Mittel, derselbe Kameratrack blieb aktiv; in dieser Messrunde war keine Hand vor der Kamera. Die tatsächliche Rate hängt von Kamera, Licht und Rechnerlast ab. Vollständiger Kameraverlauf bleibt lokal; für die Messung wurden keine Kamerabilder gespeichert oder übertragen. Ergebnisse: `.local/gesture-perf-single-hand-final.json`, `.local/gesture-activation-proof.json`.

Zusätzliche Zwei-Hand-Prüfung mit demselben öffentlichen Referenzbild: In 65/65 Frames wurden beide Hände erkannt, keine Werkstattaktion wurde ausgelöst. Gegenprobe mit einer ausgeschnittenen Hand lieferte genau eine Öffnen-Aktion. Das prüft die Ambiguitätssperre im echten Modellpfad. Ergebnis: `.local/gesture-perf-two-hands-final.json`.

Seit 12.10.2026: Die Werkstatt enthält eine ein-/ausblendbare Gestenhilfe. Bei aktivierten Gesten wird sie im neuen Fenster zunächst angezeigt. Der Handpunkt entspricht den horizontal gespiegelten Kamerakoordinaten. Links neben der Leiste steht der tatsächliche nächste Reiter; rechts der vorherige. Grün markiert den Rückkehrbereich. „Hand zur Mitte zurückführen“, „Kurz warten“, „Ruhig halten“ und „Bereit“ erklären die Wiederfreigabe. Der Browserbereich reserviert die 140-Pixel-Hilfe, sodass das eingebettete Browserfenster sie nicht verdeckt. Escape schließt zunächst die offene Hilfe; erst danach die Werkstatt.

Die Spiegelung ist im `GestureController` standardmäßig aktiv (`mirror:true`). Für Tests oder eine anders ausgerichtete Kamera kann der Konstruktor `mirror:false` erhalten. Bildanalyse und Kamerabilder werden dadurch nicht verändert. Die Gestenhilfe läuft über die lokale, ausdrücklich zugelassene `gesture-help`-Preload-Methode; der Browserbereich verschiebt sich um dieselben 140 Pixel.

Native Prüfung der Wiederfreigabe: Vier aufeinanderfolgende synthetische Wisch-/Rückführsequenzen wurden im echten Voice-Renderer in Konsole → Browser → Lagebild → Projektgraph umgesetzt. Die echte Preload-Brücke reservierte die 140-Pixel-Hilfe über dem Browser; Handpunkt, Bereitschaft, Inhaltshöhe und Hilfe-Toggle wurden geprüft. Das ist ein Test der vollständigen App-Kette mit kontrollierten Landmarken, keine Messung der Erkennungsquote einer echten Hand. Ergebnis: `.local/swipe-activation-proof.json`.
