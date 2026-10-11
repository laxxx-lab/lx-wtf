# Alltag und Agentenwerkstatt · Prüfung am 11. Oktober 2026

Die beauftragten Erweiterungen verwenden die vorhandene Hermes-Session und
Windows-Anbindung. Apps, Ordner und Webseiten lassen sich in Einsatzmodi speichern;
ausdrückliche Anfragen lesen kopierten Text oder das ausgewählte Fenster.
„Stopp“ hält aktuelle Arbeit an, ohne Live, Wakewords oder Kamera abzuschalten.
Die Quelle und tatsächliche Werkzeugschritte erscheinen in der modernisierten
Werkstatt. Nach einer neuen Anfrage geht die Unterhaltung in derselben Session
weiter; unbekannte externe Wirkungen müssen zuerst geprüft werden.

## Durchgeführte Prüfung

- Gesamte Node-Suite: 607 Tests, davon 603 bestanden, keine Fehler, vier bewusst
  ausgelassene native Opt-in-Prüfungen. Der neue UIA-Opt-in-Test wurde zusätzlich
  mit einem isolierten eigenen Windows-Testfenster ausgeführt und bestanden.
- Inhaltsquelle: 13/13 Prüfungen einschließlich nativer UIA-Quelle. Keine echte
  Zwischenablage ausgelesen oder verändert. sensible Felder, Quellenwechsel,
  Prompt-Injektion als Daten, Zeichenbegrenzung und Abbruch geprüft.
- Unsichtbare Electron-Rendererprüfung: alle sieben Bereiche, Quellenkarte,
  Aktivitätsanzeige, Browsergeometrie und drei Fenstergrößen bestanden; keine
  Rendererfehler. Synthetische Testdaten und Aufnahmen bleiben unter `.local/`.
- Eigener nativer Electron-Test: Acrylic auf Windows 11, volle Textdeckkraft,
  Öffnen ohne Fokuswechsel, manuelle Übernahme, Datenschutz und Maximierung auf
  dem zweiten Bildschirm bestanden. Windows-Maximierung wird während einer
  Agentenpräsentation vor Aktivierung geschützt.
- Tatsächlicher Hermes-Werkzeugweg: der Agent hat über die vorhandene Windows-
  Shell `control.ps1` aufgerufen, seine Console präsentiert, den Status gelesen
  und genau die erhaltene ID freigegeben. Sichtbar → Agenteneigentum → unsichtbar
  wurde vom Client beobachtet; kein Kamera-/Bildschirmzugriff. Der Gateway-Skill
  wurde gesichert aktualisiert und vollständig zurückgelesen.
- Autostart: exakter HKCU-Run-Eintrag für Electron mit diesem Projektordner.
  Electron meldet `openAtLogin`, `registered`, `enabled` und
  `executableWillLaunchAtLogin` jeweils `true`. Ein Neustart von Windows wurde
  nicht ausgelöst; registriert ist der Start bei Benutzeranmeldung.
- Die normale App wurde nach der Prüfung wieder gestartet. Session, Standby,
  Wakewords und zuvor ausgeschaltete Sensoren wurden erhalten.

Der reale Agententest deckte außerdem auf, dass acht neueste History-Einträge nach
mehreren Werkzeugaufrufen keine Nutzernachricht mehr enthalten können. Die
Auftragsprüfung erweitert eine gültige Seite dann einmal auf höchstens 128
Nachrichten und verlangt weiterhin die exakte Markierung im neuesten
Nutzerauftrag. Ein Wechsel der Hermes-Laufzeit-ID wird der Sprachoberfläche
mitgeteilt, bevor die nächste Aufnahme an die alte ID gesendet werden kann.

## Bedienung

- „Fasse das Kopierte zusammen“ oder „Erklär mir dieses Fenster“.
- „Arbeitsplatz starten“, „Ich möchte spielen“, „Feierabend“: zuerst gewünschte
  Apps, Ordner und Webseiten in den Einsatzmodi eintragen.
- „Stopp“: normale Unterbrechung. „Geh in den Standby“: Live/Kamera aus und
  Wakeword-Bereitschaft mit gemerktem Kamerastatus.
- Lilith präsentiert ihre Arbeitsfläche ohne Fokusübernahme. Eigene Bedienung
  übernimmt die Ansicht; ein verspätetes Agenten-Schließen wird abgewiesen.
- Startmenü/Desktop **Hermes Voice**, alternativ `launch.ps1`; Autostart ist auf
  diesem eingerichteten PC aktiviert.

Das Repository enthält Quellcode und Einrichtungshinweise. Modelle, private
Referenzstimmen, Fotos, Cookies, Tokens und lokale Daten bleiben ausgeschlossen.
Öffnungsannahmen ersetzen keine Prüfung der tatsächlichen App-Wirkung; die
Sprachqualität und Bedienung im echten Alltag bleiben Nutzertests.
