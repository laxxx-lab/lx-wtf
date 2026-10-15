# Friday-Ausbaustufe · 11.10.2026

Die fünf beauftragten Pakete sind im bestehenden Client integriert. Hermes und
seine Session bleiben die Agenteninstanz; es wurden keine kostenpflichtigen
Dienste oder neuen Frameworks hinzugefügt.

- **Aufträge:** `.local/jobs.json` speichert bis zu 50 Aufträge atomar. Die
  ausgewählte gespeicherte Session/Profile ist der Besitzer. Hermes-Nachrichten
  enthalten eine private Auftragsmarkierung. Ein Abschluss wird erst nach
  Prüfung des laufenden Remote-Zustands und der neuesten Nutzernachricht
  zugeordnet. Agentenabschluss gilt allein nicht als bestätigter Aufgabenerfolg.
- **Sprachfluss:** Gesprächsantworten dürfen früher ganze Sätze sprechen;
  PC-Aktionen warten mit ihrer Bestätigung bis zum Ende. VAD bestätigt
  Dazwischenreden, erhält den Satzanfang und wartet vor dem nächsten Auftrag auf
  einen tatsächlichen Remote-Abschluss. Zeitmessung zeigt Stichproben/p50/p95
  im System-Reiter; fehlende Messungen bleiben leer.
- **Artcraft:** LightCraft lässt sich nach „Eingabe aktivieren“ im Fensterstream
  anklicken, beschreiben, per Taste bedienen und scrollen. Freigabe gilt maximal
  60 Sekunden für genau Capture/PID/HWND/Geometrie. Andere Editoren bleiben
  sichtbar gestreamt und über Hermes/MCP bedienbar; direkte Stream-Eingaben sind
  derzeit ausschließlich für LightCraft freigegeben.
- **Projekt:** Frische Buildfehler, wartende Aufträge und veraltete Indizes
  erzeugen Hinweise im Lagebild. Der gewählte Projektbaum wird begrenzt
  beobachtet, ohne automatische Neuindexierung. Explizite Tool-Dateipfade
  pulsieren im Graph getrennt von Suchtreffern.
- **Lehre/Gesten:** Bewusst gestartete Lehre übernimmt erfolgreiche
  LightCraft-Eingaben, konkrete Beschreibungen und vom Benutzer geprüfte
  Erfolgskriterien. Gespeicherte Abläufe suchen später frische UI-Ziele. Zeigen
  markiert Graphknoten; Pinch dreht/zoomt den Projekt-Orb. Kamerafreigabe und
  sichtbarer Graph sind nötig; Gesten lösen keine globalen Windows-Klicks aus.

## Prüfung

Unabhängige Prüfung fand Sessionwechsel während Remote-Abgleich, verspätete
Prompt-Bestätigung, verlorene Lehre bei Namenskollision, einen falschen
Unterbrechungsabschluss bei Disconnect und ablaufende Eingabegrants während
asynchroner Fensterprüfung. Korrekturen haben Regressionstests.

Zwei echte Hermes-Testaufträge antworteten seriell mit QUEUE-ALPHA und QUEUE-BETA.
Der zweite begann nach geprüftem Abschluss des ersten. Beide wurden als
„Agent beendet“, nicht als ungeprüft „bestätigt“, gespeichert.
Beleg: `.local/friday-activation.json`.

Ein leeres natives LightCraft-Testfenster bestätigte gemappte Klick/Text-Eingaben
auf beiden Monitoren, einschließlich 150 % Skalierung. Ein isolierter echter
TTS-/Renderer-Test mit stummem Ausgang bestätigte PCM-Wiedergabe und das
Verwerfen verspäteter Generationen. Verdeckte Electron-Rendererprüfungen
bestätigten Layout ohne horizontalen Überlauf sowie Graphaktivität/Pinch und
Generation-Reset. Die gesamte Mikrofon–Hermes–Lautsprecher-Kette und die Gesten
mit des Nutzers eigener Hand sind noch kein abgeschlossener Alltagstest.

Bei der anfänglichen Entwicklung war Datenschutz aktiv. Vor der Aktivierung
meldete der vorhandene Client bereits `locked:false`; die Tests haben ihn
nicht entsperrt. Die jeweils vorhandenen Sensor-/Wakeword-Einstellungen wurden
beim Aktivieren beibehalten.

## Benutzung

Werkstatt: **Ctrl+Alt+W**. **Lagebild** zeigt Aufträge und Hinweise. Ein weiterer
Auftrag lässt sich während laufender Arbeit über **Vormerken** einreihen.
Bei unbekanntem Ergebnis zuerst **Remote-Status prüfen**, den tatsächlichen
Zustand ansehen und erst bei Bedarf bewusst wiederholen. **System** zeigt die
Sprachzeitmessung. **Artcraft → LightCraft** enthält Eingabe und Lehre.

Normaler Start: `Start-Hermes-Voice.cmd` oder `launch.ps1` im Projektordner.
