# Audioausgabe, Wartehinweise und Bildanalyse

## Bedienung

Unter Einstellungen → Audio / Ausgabe werden die aktiven Windows-Ausgaben frisch gelesen. Die Felder „Kopfhörer“ und „Boxen“ speichern jeweils eine eindeutige Render-ID. Auf diesem PC wurde nach Patriks Auswahl Realtek für Boxen und Corsair VOID für Kopfhörer zugeordnet. Nicht verfügbare gespeicherte Geräte führen zu einer konkreten Fehlermeldung; es wird kein Ersatzgerät geraten.

„Wechsle die Audioausgabe auf Boxen“ und „Audio auf Kopfhörer“ laufen lokal über die vorhandene Auftragswarteschlange. Vor Beginn wird die Geräte-ID festgelegt und gespeichert. Der native Aufruf prüft aktive Render-Geräte, stellt nur Console-/Multimedia-Standard um und liest den Zustand erneut. Das Kommunikationsgerät bleibt unverändert. Lilith verbindet ihren bestehenden AudioContext wieder mit dem Windows-Standard, ohne den Mikrofon-/Wakeword-Graphen neu aufzubauen. `completed` verlangt beide Windows-Rollen und die Bestätigung des Renderers. Angenommene, abgebrochene oder nicht belegte Aktionen bleiben unbestätigt und werden nicht automatisch wiederholt.

Der Agent erhält dieselbe Funktion über `control.ps1 -Action audio-output -Target speakers|headphones|<Render-ID>` und den aktualisierten Skill `hermes-voice-control`. `audio-outputs` liefert aktuelle Geräte und Zuordnungen. Beide HTTP-Routen nutzen die bestehende lokale Authentifizierung; Schreibzugriffe bleiben bei Datenschutz gesperrt. Eigene Ausgaben einzelner Apps sowie entfernte Spotify-Connect-Geräte werden damit nicht nachgewiesen verändert. Physische Hörbarkeit kann Windows-Readback allein nicht beweisen.

## Rückmeldungen

Ein Sprachauftrag erhält je nach Aufgabe seine vorhandene kurze Startansage. Nach 20 Sekunden folgt höchstens ein zusätzlicher Hinweis im laufenden Auftrag, sichtbar und mit derselben Stimme:

- Frische echte Nachricht-/Werkzeugaktivität innerhalb der letzten zehn Sekunden: „Einen kleinen Moment noch, ich arbeite noch daran.“
- Nur eine noch offene Anfrage: „Das dauert länger. Ich warte noch auf eine Rückmeldung.“

Eine offene Anfrage beweist weder Fortschritt noch, dass ein Prozess nicht hängt. Bei Abschluss, Unterbrechung, Datenschutz, Besitzer-/Sessionwechsel oder ausstehender Freigabe wird kein verspäteter Fortschritt behauptet. Textaufträge bleiben stumm. Zwischensätze verwenden die vorhandene Voice-Cachefunktion; sie zählen nicht als erste Audioausgabe der endgültigen Antwort.

## Bildanalyse

Die Freigabe von Kamera **oder Bildschirmblick** startet jetzt die Modellvorbereitung ohne Bild und ohne Sensoraufnahme. Kamera, Bildschirm und markierter Bereich verwenden einheitlich 8192 Kontextplätze, damit ein Wechsel nicht unnötig eine andere Modellinstanz laden muss. Modell, Qualität, lokale Verarbeitung und Abschaltung des Denkens bleiben erhalten. Das Modell wird wie bisher zehn Minuten vorgehalten; nach Entladen, Datenschutz oder Neustart kann erneut Ladezeit entstehen. Das Vorladen spart diese Arbeit nicht ein, es zieht sie vor die erste Bildfrage. Auf dem Test-PC belegte das vorbereitete Modell etwa 6,5 GB VRAM, zuvor mit 4096 Kontextplätzen etwa 5,8 GB.

Gemessen am 11.10.2026 mit einem erzeugten 512×512-Testbild, ohne Webcam, Nutzerbild oder Bildschirmaufnahme:

- Vorher: Dienststart 6,5 s; erste Anfrage 22,4 s, davon Modellladen 20,9 s. Wiederholung desselben Bilds 0,54 s.
- Mit Vorbereitung: Dienststart 2,9 s; Modellvorbereitung 20,6 s; erste anschließende Bildfrage 1,60 s, Wiederholung 0,57 s.

Das kleine geometrische Testbild misst Start-/Inferenzkosten, keine Fotoqualität und keine garantierte Geschwindigkeit für größere Bilder oder OCR. Wiederholungen profitieren zusätzlich vom Prompt-Cache. Die lokalen Antwortfelder `load_duration`, `prompt_eval_duration` und `eval_duration` sind in Nanosekunden angegeben: https://docs.ollama.com/api/chat.

## JEV-Einordnung

Das geprüfte hey-jev verwendet einen synchronen Cloud-Aufruf an Typesafe für typisierte Aktionsentscheidungen: https://raw.githubusercontent.com/henryklunaris/hey-jev/main/siri.py. JEV ist laut aktueller Modellseite kostenpflichtig ($0.042 je Million Eingabetokens) und am stärksten auf Englisch: https://docs.typesafe.ai/models. Ein zusätzlicher Entscheidungsschritt könnte variable Aufträge klassifizieren, verkürzt aber das Laden des lokalen Bildmodells nicht. Für diese Änderung werden vorhandene feste Windows-Aktionen direkt ausgeführt; weder neuer kostenpflichtiger Dienst noch Session-Reset noch Modellwechsel wurde eingerichtet.

## Prüfung

Automatisiert geprüft: enge deutsche Befehle, Render-ID-Grenzen, Mehrdeutigkeit, gespeicherte Identität, veraltete Beobachtungen, Abbruch, unveränderte Kommunikationsrolle, unbekannte Wirkung ohne Wiederholung, authentifizierte API und 20-Sekunden-Rückmeldung mit Besitzer-/Abschlussgrenzen.

Nativ auf diesem Windows-PC geprüft: Boxen → Kopfhörer, Windows-Readback, Renderer-Standardroute und unverändertes Kommunikationsgerät; ursprüngliche Standardgeräte danach wiederhergestellt. Je Wechsel etwa 0,85–0,88 s. Der echte lokale Auftragsweg war in etwa 0,85 s abgeschlossen. Skill-Sicherung und Readback im bestehenden Hermes-Gateway waren erfolgreich. Der 20-Sekunden-Hinweis wurde im Electron-Client mit einer kontrolliert offen gehaltenen Testphase ausgelöst; kein fingierter Agentenauftrag wurde an Hermes geschickt. Die ursprünglichen Sensor-, Live-, Wakeword-, Stimm- und Sessioneinstellungen blieben erhalten.
