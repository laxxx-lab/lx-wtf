# Kurze Rückmeldung beim Aufgabenbeginn

Lilith bestätigt beginnende Sprachaufträge lokal und passend zur Art der Arbeit:

- Einfache App-/Musik-/Windows-Aktion: „Okay.“
- Prüfen, Kamera, Bildschirm oder angefragter Text: „Alles klar, ich schaue es mir an.“
- Recherche, Analyse oder Bearbeitung: „Alles klar. Dazu brauche ich einen Moment.“

Die Einordnung verwendet die tatsächlich angesprochene Operation und ist keine
Zeitvorhersage. Eine Ansage bestätigt den Beginn, keine erfolgreiche Ausführung.
Aufträge in der Warteschlange werden erst beim tatsächlichen Start bestätigt.
Reine Gespräche sowie direkte Stopps, Standby und sofortige Statusberichte
bekommen keine zusätzliche Ansage vor ihrer vorhandenen Antwort. Stille
Textaufträge bleiben still.

Der Client spricht pro Sprachrunde höchstens eine Startansage. Inhaltsanalyse
und spätere Hermes-Ausführung teilen dieselbe Runde; Übergabe und Werkzeugstart
brechen die Ansage nicht ab. Der Auftrag wartet nicht auf die Ansage. Datenschutz,
Abbruch, Sessionwechsel und ein neuer Auftrag widerrufen veraltete Sprachausgabe.
Ein aktiver Startclip darf nur seinen eigenen vorgemerkten Auftrag parallel
starten; eine andere Sprachrunde übernimmt diesen Vorrang nicht.

Die Ansagen verwenden die aktuell ausgewählte feste Stimme und Sprechweise.
Fertige PCM-Clips liegen ausschließlich unter `.local/start-announcements/`.
Der Cache-Schlüssel enthält Text, Stimme, Sprechweise und Sprecherreferenz.
Eine geänderte Referenz oder andere Stimme verwendet einen anderen Clip. Bei
fehlendem Clip erzeugt die vorhandene lokale TTS-Engine ihn beim ersten Gebrauch;
unvollständige oder abgebrochene Synthesen werden nicht gespeichert. Die Clips
und privaten Stimmreferenzen werden nicht auf GitHub veröffentlicht.

Console und Gespräch zeigen die Ansage getrennt von der tatsächlichen Antwort
und Werkzeugbelegen. Die Voice-Prompt-Vorgabe überlässt diese Rückmeldung dem
Client und verhindert doppelte Planankündigungen durch Hermes; sie gilt weiterhin
nur für den Sprachauftrag. Telegram wird dadurch nicht umgestellt.

Startaudio hat eigene `ack-*`-Messpunkte. Die bisherige Zeit bis zur eigentlichen
Antwort bleibt getrennt und wird nicht durch ein früh gesprochenes „Okay“
verkürzt. Das Ende eines Startclips beendet weder Auftrag noch Gespräch.

Verhaltensprüfung: `npm test`, insbesondere Sprachklassifikation,
Hauptprozess/Warteschlange, Cache-Identität und -Abbruch, Renderer-/Wiedergabefluss
und getrennte Zeitmessung. Native Aktivierung prüft die drei Clips mit der
eingerichteten lokalen Stimme und einen harmlosen Hermes-Rechenauftrag, ohne
Kamera, Bildschirm, Dateien oder Apps zu verändern.

## Native Prüfung am 11. Oktober 2026

Alle drei vorbereiteten Clips wurden von der lokalen deutschen Transkription
inhaltlich korrekt wiedererkannt. Ihre Audiolängen sind 0,96, 2,08 und 2,48 Sekunden.
Im echten Hermes-Test kam genau eine Startansage, danach „323 ist richtig“;
beide wurden anhand der laufenden Wiedergabezeit im Client beobachtet. Die
erste PCM-Ausgabe aus dem Cache erfolgte nach 44 ms; der parallele Hermes-Auftrag
wurde nach 8 ms übergeben. Diese Werte beschreiben den geprüften warmen Client-
Durchlauf, keine zugesicherte Gesamtlatenz ab Mikrofoneingang. Sensoren, Standby,
Stimme und Session blieben erhalten. Die normale App wurde anschließend neu gestartet.
