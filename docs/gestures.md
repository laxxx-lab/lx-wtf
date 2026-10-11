# Lokale Workbench-Gesten

Die Gestensteuerung ist standardmäßig aus und wird ausdrücklich eingeschaltet. Zuerst muss die Kamera bereits aktiv sein. Die Gestenerkennung verwendet genau das Video und den Stream der ausgewählten Kamera (`cameraControls.controller.video`). Sie fordert keinen zweiten Kamerazugriff an, startet die Kamera nicht und beendet keine Kameratracks.

Die Erkennung läuft lokal in einem Web Worker. Bilder werden kurzzeitig als `ImageBitmap` an diesen Worker übergeben und nach der Auswertung freigegeben. Die Gestenfunktion lädt keine Kamerabilder hoch und speichert keine Bilder. Die sonstigen Kamerafunktionen behalten ihre eigenen Einstellungen.

## Unterstützte Gesten

| Geste | Aktion |
| --- | --- |
| Offene Hand etwa 700 ms ruhig halten | Workbench einblenden |
| Faust etwa 700 ms ruhig halten | Workbench ausblenden |
| Offene Hand deutlich nach links wischen | Nächster Workbench-Bereich |
| Offene Hand deutlich nach rechts wischen | Vorheriger Workbench-Bereich |
| Zeigefinger gestreckt, übrige Finger gefaltet, kurz ruhig halten | Sichtbaren Graphknoten hervorheben |
| Daumen und Zeigefinger zusammenführen, übrige Finger gefaltet | Projekt-Orb horizontal drehen und mit vertikaler Bewegung zoomen |

Links und rechts beziehen sich auf die ungespiegelten Bildkoordinaten der Kameravorschau. Eine Wischbewegung muss mindestens 22 % der Bildbreite erreichen, mindestens 200 ms dauern und innerhalb von 850 ms erfolgen. Kleine Bewegungen, diagonales Wischen und Wischen mit einer Faust werden nicht als Navigation gewertet.

Eine zusammenhängende Pose löst höchstens eine Aktion aus. Vor einer weiteren Aktion muss die Pose verlassen oder die Hand aus dem Bild genommen werden; zwischen Aktionen liegen mindestens 1,5 Sekunden. Auch eine während dieser Pause vollständig ausgeführte Geste muss anschließend erneut begonnen werden. Unsichere Erkennung, fehlende Hand oder unterbrochene Bildfolge setzt die Haltezeit zurück.

Genau eine Hand mit 21 endlichen Landmarken und hinreichend sicherer Händigkeit wird ausgewertet. Erkennungs-, Handpräsenz- und Tracking-Schwellen liegen im Handmodell bei 0,7; räumliche Gesten verlangen zusätzlich mindestens 0,85 Händigkeitssicherheit. Fingerwinkel und Abstände entscheiden über offene Hand und Faust; dort bleibt die Daumenstellung unerheblich. Zeigen verlangt einen gestreckten Zeigefinger und drei gefaltete Finger. Pinch verwendet den Abstand zwischen Daumen- und Zeigefingerspitze relativ zur Handbreite: Eintritt bis 0,24, Loslassen oberhalb 0,4. Eine räumliche Pose muss zunächst 200 ms anhalten; ein neues Greifen braucht zusätzlich mindestens 100 ms. Diese Hysterese verhindert raschen Wechsel an einer einzigen Abstandsschwelle.

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

Der Controller besitzt einen Timer mit 125 ms Intervall: höchstens acht neue Bilder pro Sekunde werden angefragt, identische Videozeitpunkte werden übersprungen, und höchstens eine Auswertung ist gleichzeitig offen. `tick(video = this.video)` ist asynchron; nach Abschaltung oder Neustart eintreffende Ergebnisse und Fehler werden verworfen. Für Tests kann `process(result, timestamp)` synthetische Ergebnisse direkt auswerten. Beide Methoden lösen bei ausgeschaltetem Controller keine Aktionen aus.

`onAction` erhält weiterhin einen dieser Strings: `workbench-show`, `workbench-hide`, `workbench-next`, `workbench-previous`. `onSpatial` erhält `{kind: 'pointer', x, y, pinching, generation, sequence, at}` oder `{kind: 'cancel', generation, sequence, at}`. `x`/`y` sind begrenzte normalisierte Bildkoordinaten, `at` ist die lokale Unixzeit in Millisekunden; Generation und steigende Sequenz verhindern Wiedergabe alter Ergebnisse. `onState` erhält `{active, loading, status}` mit optionalem `pose` (`palm`, `fist`, `point`, `pinch`), `action` und `error`.

Der Hauptprozess nimmt räumliche Objekte wie die bisherigen Navigationsstrings über `gesture-action` an, prüft Datenschutz, aktivierte Kamera und Gesten und leitet `gesture-update` nur an eine sichtbare Graphansicht weiter. `ProjectGraphView.mount(...).gesture(value)` prüft Sichtbarkeit, Reihenfolge, Generation, Koordinaten und Frische selbst erneut. Ereignisse über 500 ms alt oder über 50 ms in der Zukunft werden verworfen. Pointing verändert nur die Hervorhebung; Pinch verändert nur Orb-Rotation und Zoom zwischen 0,5 und 4. Die Graphansicht akzeptiert zusätzlich einen lokalen typisierten `{kind:'zoom', delta, generation, sequence, at}`-Aufruf mit `delta` zwischen −1 und 1; der Kameracontroller emittiert ausschließlich Pointer oder Abbruch. Keine Ereignisse rufen `graph-source` oder Betriebssystemeingaben auf. Nach 500 ms ohne frisches Ereignis, beim Verstecken und bei `cancel` beendet die Ansicht das Greifen. `cancelGesture()` erlaubt der Workbench, bei Datenschutz, Tabwechsel und verstecktem Fenster sofort lokal abzubrechen, ohne ein Sensorereignis zu erzeugen. Beim Abschalten der Kamera oder beim Wechsel ruft der Renderer ausdrücklich `disable()` auf.

## Lokale Laufzeitdateien

- Paket: `@mediapipe/tasks-vision` Version `1.1.0`, insbesondere `vision_bundle.mjs`.
- WASM-Verzeichnis: `node_modules/@mediapipe/tasks-vision/wasm`, mit allen zusammengehörigen `vision_wasm_internal`, `vision_wasm_module_internal` und `vision_wasm_nosimd_internal` Dateien (`.js` und `.wasm`).
- Handmodell: `runtime/gestures/hand_landmarker.task`.

Das Modell wird mit `runningMode: 'VIDEO'`, `numHands: 1`, CPU-Ausführung und den drei Sicherheitsschwellen `0.7` erstellt. Paket, WASM und Modell werden lokal geladen. Die [offizielle MediaPipe-Dokumentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) beschreibt Modellinitialisierung, Videoauswertung und Landmarken; sie weist darauf hin, dass die synchrone Erkennung den aufrufenden Thread blockiert.

Automatisierte Prüfung ohne Kamera: `node --test tests/gestures.test.cjs tests/project-orb.test.cjs`. Die Tests verwenden synthetische Landmarken und Detektoren, prüfen Zeigen/Pinch, kalibrierte Grenzen, Hysterese, Greif-Abbruch, lokale Graphveränderung sowie Haltegesten, Wischbewegungen, Sperrzeit, Kameraverlust und asynchrone Ergebnisse. Eine echte Kamera wird durch diese Tests nicht gestartet; die Erkennung bei realen Händen ist damit nicht empirisch geprüft.

`node --test tests/project-graph-view.test.cjs` prüft zusätzlich tatsächliche DOM-Darstellung und lokale Interaktion in einem separaten versteckten Electron-Fenster mit temporärem Profil. Berechtigungen und Netzwerkzugriffe sind dort gesperrt. Die Prüfung belegt getrennte Aktivitätsfarbe/Suchauswahl, Zeigehervorhebung, Pinch-Zoom, keinen Quellzugriff durch Gesten, Abbruch/Neustart der Renderer-Generation sowie versteckte und geschlossene Ansichten. Die vorhandene Nutzer-App wird dabei nicht neu gestartet.


Zusätzliche native Prüfung: Das Modell und WASM wurden in einem klassischen Electron-Worker wirklich geladen. Ein leeres Canvas lieferte keine Hand; das öffentliche MediaPipe-Bild right_hands.jpg lieferte eine Hand und löste bei stabiler Pose workbench-show aus. Es wurde keine Nutzerkamera für diesen Test geöffnet. Kamera, Licht und Handhaltung am tatsächlichen Arbeitsplatz bleiben für einen Praxistest offen.
