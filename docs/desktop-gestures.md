# Den Windows-Desktop mit Handgesten bedienen

Unter **Einstellungen → Sicht / Lokal → Gesamten Desktop per Hand steuern**
lässt sich die globale Handsteuerung bewusst ein- und ausschalten.
**Strg+Alt+G** schaltet denselben Modus um. Die ausgewählte Kamera muss bereits
eingeschaltet sein. Die Funktion öffnet keine zweite Kamera. Bei jedem App-Start
ist die globale Steuerung aus, auch wenn die bisherige Werkstatt-Gestenerkennung
eingeschaltet war. Andere Sensor-, Audio- und Session-Einstellungen bleiben erhalten.

Die Oberfläche trennt „startet“, „bereit“, „aus“ und einen Helferfehler.
Bereit bedeutet geladene Handerkennung und einen bestätigten lokalen Eingabehelfer;
es ist kein Nachweis für eine erfolgreiche Webseiten- oder Projektaktion.

| Handbewegung | Wirkung auf dem Desktop |
| --- | --- |
| Zeigefinger zeigen, kurz halten | Den echten Mauszeiger bewegen |
| Daumen und Zeigefinger zusammenführen und wieder lösen | Ein linker Klick am zuvor gezeigten Punkt |
| Pinch halten und die Hand bewegen | Mit linker Maustaste ziehen; Loslassen beendet das Ziehen |
| Zeige- und Mittelfinger strecken, übrige Finger falten; auf/ab bewegen | Am Mauspunkt scrollen |
| Beide Hände mit Daumen und Zeigefinger greifen; auseinander/zusammen bewegen | Vergrößern/verkleinern über Strg+Mausrad |

Zuerst zeigen, dann greifen: Eine bereits geschlossen ins Bild kommende Hand
kann keinen Klick auslösen. Der Übergang zwischen Zeigefingerspitze und
Pinch-Mittelpunkt versetzt das Klickziel nicht. Ein Pinch ohne Bewegung klickt
erst beim bestätigten Loslassen. Ab mehr als 1,6 % Bewegung beginnt Ziehen.
Zweihand-Zoom verlangt beide sicher erkannten Händigkeiten und 200 ms bewusstes
Greifen. Zwei andere Hände oder unsichere Posen lösen keine Desktopaktion aus.
Im Desktopmodus sind die alten Werkstatt-Öffnen-/Schließen-/Wischaktionen pausiert.
Außerhalb dieses Modus gilt weiterhin [Werkstatt-Gesten](gestures.md).

Der mittlere 80-%-Bereich der Kamera wird gespiegelt auf den virtuellen
Windows-Desktop einschließlich weiterer Monitore abgebildet. Die vorhandene
Glättung dämpft kleine Bewegungen. Erkennung, Licht und Handhaltung bestimmen
die tatsächliche Genauigkeit; synthetische Tests sind keine reale Trefferquote.
Programme verwenden ihre normalen Mausaktionen. Zoom funktioniert dort, wo
Strg+Mausrad unterstützt wird. UAC, Sperrbildschirm und erhöhte Anwendungen
werden nicht umgangen; blockierte Windows-Eingaben werden als Fehler gemeldet.

Kameraabschaltung, Bildverlust, Datenschutz, Standby und fremder Gesprächsbesitz
sperren Eingaben. Nach 350 ms ohne frische Handdaten verwirft die App begonnene
Gesten. Der native Helfer besitzt zusätzlich einen eigenen 350-ms-Wächter und
beendet ein begonnenes Ziehen mit Escape und Maustaste-loslassen. Ein verlorener
Pinch ohne Ziehen führt keinen Klick aus. Abschalten und App-Ende schließen den
Helfer; er setzt keine dauerhaften Windows-Maus- oder Tastatureinstellungen.

`desktop-gestures.cjs` verarbeitet typisierte frische `pointer`, `zoom` und
`cancel`-Ereignisse. `scripts/desktop_gestures.py` läuft einmal pro Aktivierung
im vorhandenen lokalen Python und setzt Eingaben über Win32 `SendInput` um.
Es werden keine Kamera-/Bildschirmbilder gelesen, gespeichert oder übertragen.
Die laufende Handerkennung verwendet weiterhin den bestehenden Video-Worker.
Es gibt keine neuen Cloud-Dienste oder kostenpflichtigen Abhängigkeiten.

`control.ps1 -Action status` enthält `gestures.desktopEnabled`, `ready`, `error`
und inhaltsfreie Metadaten der zuletzt angenommenen Eingabe. Eine angenommene
Mauseingabe bestätigt keine Wirkung innerhalb der Anwendung. Aktivierung erfolgt
lokal per Schalter oder Tastenkürzel, nicht durch einen neuen freien Eingabe-API-Endpunkt.

Prüfung: `node --test tests/desktop-gestures.test.cjs tests/gestures.test.cjs
tests/main-friday.test.cjs tests/renderer-control.test.cjs`, anschließend
`npm.cmd test` und `git diff --check`. Die Tests prüfen Klickabschluss, Ziehen,
Abbruch, Scrollen, Zweihand-Zoom, Reihenfolge/Frische und Aktivierungssperren.
Der native Probeaufruf `runtime/voice/venv/Scripts/python.exe
scripts/desktop_gestures.py --probe` prüft nur Windows-Sitzung und Eingabestruktur;
er bewegt den Mauszeiger nicht. Für reale Genauigkeit ist ein Handtest am
tatsächlichen Arbeitsplatz erforderlich.

Native Prüfung am 14.10.2026: In einem separaten, temporären Electron-Testfenster
wurden durch den echten Windows-Eingabehelfer ein Klick, zwei Ziehbewegungen,
ein Scrollereignis und ein Strg-Mausrad-Ereignis bestätigt. Anschließend wurde
die vorherige Mausposition wiederhergestellt. Keine zweite Kamera, keine
Nutzersession, keine Nutzerdatei und keine externe Webseite wurden für diesen
Test geöffnet. Dies prüft die Wirkung kontrollierter Gestenereignisse, keine
reale Handerkennungsquote. Test: `tests/desktop-gestures-native.electron.cjs`;
lokaler Ergebnisbeleg: `.local/desktop-gestures-native.json`.
