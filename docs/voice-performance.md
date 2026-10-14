# Sprachfluss und lokale Zeitmessung

Der bestehende Mikrofonpfad, Silero-VAD, Whisper und Qwen-TTS bleiben erhalten.
Die Erweiterung fügt keine Cloud-Sprachdienste oder neue Abhängigkeiten hinzu.
Die vorhandenen Freigaben werden für Tests nicht erweitert. Sensorprüfungen
verwenden isolierte Testquellen; lokale Datenschutzänderungen bleiben erhalten.

## Was gemessen wird

Jede Live-Aufnahme erhält eine eigene, inhaltsfreie Turn-ID. Dieselbe ID begleitet
Aufnahme, lokale VAD-Ereignisse, Transkription, Auftrag, Hermes-Ereignisse,
TTS und die Wiedergabe im Renderer. Die Telemetrie enthält ausschließlich ID,
Stufenname und Millisekundenzeit. Text, PCM, Dateipfade und Sessionnamen gehören
nicht zu diesen Zeitdaten. `performance.timeOrigin + performance.now()` liefert
die gemeinsame Zeitbasis zwischen Renderer und Hauptprozess.

`VoiceTiming` hält standardmäßig 80 Turns ausschließlich im Arbeitsspeicher
(höchstens 200 bei expliziter Konfiguration). Ungültige IDs/Stufen, nicht endliche
Zeiten und Zeitwerte mehr als 60 Sekunden vom Empfang entfernt werden verworfen.
Doppelte Stufen behalten den ersten Zeitwert; `playback-end` wird für die letzte
fertig abgespielte PCM-Portion aktualisiert. Fehlende oder rückwärts laufende
Stufen ergeben keine erfundene Dauer. p50 und p95 verwenden den nächsten Rang
der vorhandenen Werte; jede Kennzahl zeigt ihre eigene Stichprobengröße.

| Kennzahl | Beginn | Ende |
|---|---|---|
| Aufnahme | Aufnahmebeginn | Aufnahmeabschluss |
| VAD-Entscheidung | Aufnahmebeginn | bestätigte Sprache |
| Transkription | STT-Aufruf | STT-Ergebnis |
| Hermes erster Text | Auftrag gesendet | erste Textänderung |
| Hermes Laufzeit | Auftrag gesendet | Agentenabschluss |
| TTS-Wartezeit | Satz eingereiht | Synthese begonnen |
| TTS erstes PCM | Synthese begonnen | erste PCM-Portion |
| TTS Laufzeit | Synthese begonnen | Synthese abgeschlossen |
| Wiedergabestart | erstes nutzbares PCM im Renderer | Start im laufenden Ausgabezeitstrahl |
| Erster Antwortton | VAD-Satzende | Start im Ausgabezeitstrahl |
| Gesamtausgabe | Aufnahmeabschluss | letzte vollständig abgespielte Portion |

Die Wiedergabezeit wird erst erfasst, wenn der laufende AudioContext den
geplanten Start erreicht; nach Möglichkeit wird `getOutputTimestamp()` benutzt.
Das Einreihen eines Buffers oder das Empfangen von PCM zählt noch nicht als
Wiedergabe. Diese Messung beschreibt den Renderer-Ausgabezeitstrahl. Eine
akustische Messung am Lautsprecher oder ein Hörtest wird dadurch nicht ersetzt.
Bei mehreren gesprochenen Sätzen sind die TTS-Kennzahlen Werte des ersten
Segments; `playback-end` umfasst die letzte beobachtete Wiedergabe.

## Ausgelieferte Steuerzeiten, keine Latenzzusage

| Einstellung | Derzeitiger Wert | Bedeutung |
|---|---:|---|
| PCM-Vorlauf | 45 ms | geplanter Abstand zum AudioContext-Zeitpunkt |
| Echo-Nachlauf | 400 ms | Wiederaufnahme normaler Live-Aufnahme nach Ausgabe |
| Silero-Sprechpause | 500 ms | bestehende lokale Satzenderkennung |
| Vorlauf für Dazwischenreden | bis etwa 256 ms | sechs Mikrofonblöcke mit 2048 Samples bei 48 kHz |
| Kandidat ohne VAD-Bestätigung | 1200 ms | verwerfen, ohne Unterbrechung oder STT |
| Unterbrechungsabstand | 1500 ms | vorhandener Schutz vor wiederholtem Auslösen |
| Maximale Aufnahme | 30 s | bestehende lokale Begrenzung |

Diese Werte sind Steuerparameter, keine gemessenen p50/p95-Ziele. Die neue
vollständige Kette wurde noch nicht über das echte Mikrofon und den echten
Lautsprecher gemessen. Zwei reine Textaufträge wurden mit der bestehenden
Hermes-Session seriell geprüft. Frühere
isolierte Modellwerte stehen in `docs/voice-runtime.md`; sie sind keine Messung
der neuen Gesamtantwortzeit. Erst zukünftige freigegebene Live-Turns füllen die
Latenzverteilung. Ein leeres Ergebnis bleibt leer.

## Frühe Sätze und Dazwischenreden

`canStreamVoiceAnswer()` klassifiziert die Nutzeranfrage. Nur klare
Gesprächsfragen, Begrüßungen und allgemeine Erklärungen können vollständige Sätze
früh sprechen. Geräte-/App-Zustand, Aktionen und Werkzeugbestätigungen warten
auf den Abschluss. Die vorhandene knappe Aktionsnarration bleibt erhalten.
Auch natürliche Formulierungen wie „Ich hatte einen anstrengenden Tag“,
„Was hältst du von einem Spaziergang?“ und „Kannst du mir erklären …?“
gehören zum Gespräch. Gemischte Anfragen mit einem Geräte-/Änderungsauftrag
bleiben gepuffert; mehrdeutige Fortsetzungen werden nicht pauschal freigegeben.
Ein Werkzeugereignis kann die frühe Wiedergabe für den Turn wieder sperren.
Der Satzpuffer gibt auch kurze vollständige Sätze frei, hält häufige deutsche
Abkürzungen, Initialen und Zahlenfragmente zusammen und spricht keine rohen
Tokenfragmente.

Beim Dazwischenreden bleibt der vorhandene hohe Pegel-/Rauschabstandsschutz
zusammen mit Mikrofon-Echounterdrückung aktiv. Der Pegel startet nur einen
lokalen Prüfkandidaten. Erst Silero `vad-speech` für dessen aktuelle Generation
stoppt PCM und fordert die Unterbrechung an. Die Vorlaufblöcke bleiben Teil
derselben Aufnahme. STT darf während der Bestätigung laufen, die nächste
Aufgabe wartet aber auf den bestätigten Abschluss des alten Turns. Bei
unbekanntem Ergebnis wird der Sprachauftrag nicht gesendet oder automatisch
wiederholt. Silero klassifiziert Sprache, nicht Sprecheridentität; die
Echosicherheit muss zusätzlich im echten freigegebenen Audioumfeld geprüft
werden.

Audio-Generationen verwerfen verspätete Starts und PCM des alten Turns.
Datenschutz, Live-Aus und Sessionwechsel verhindern späte Übermittlung.
Die bestehende Standby-/Wake-Kamera-Wiederherstellung bleibt bestehen.

## Ausführbare Prüfungen

`node --test tests/voice-flow.test.cjs tests/voice-timing.test.cjs tests/voice-renderer.test.cjs tests/renderer-control.test.cjs`

Die Prüfungen verwenden isolierte PCM-Arrays und gesteuerte Renderer-Uhren,
keine Geräteaufnahme. Sie prüfen kurze Sätze/Abkürzungen, Gesprächsgrenzen,
Stufenvalidierung, Begrenzung/p50/p95, VAD-bestätigte Unterbrechung mit Vorlauf,
einmalige STT/Übermittlung, unbekannte Unterbrechung, verspätetes PCM,
Datenschutz, Sessionzuordnung und die bestehenden Standby-Kamerafälle.
Sie belegen Zustands- und Abbruchverhalten, keine reale Hardwarelatenz.

Native Prüfung am 11.10.2026: Die echte lokale TTS lieferte für „Ich bin hier,
Boss.“ 92.160 PCM-Bytes in sechs Portionen. Der unveränderte App-Renderer spielte
sie über einen stummgeschalteten AudioContext ab; nach Stop wurden verspätete
Starts und PCM derselben Generation verworfen. Eine Stichprobe: erstes PCM
144,88 ms nach TTS-Beginn, Syntheseende 389,68 ms, Renderer-Ausgabezeitstrahl
96,91 ms nach Empfang. Das ist ein einzelner kurzer Satz mit bereits laufendem
Modell, kein allgemeines Live-Latenzversprechen. Beleg:
`.local/friday-voice-native/result.json`.

## Engpassprüfung am 12.10.2026

Die laufenden lokalen Modelle waren in isolierten Stichproben schnell: Die
ausgewählte Referenzstimme lieferte erstes PCM nach 44–89 ms, Whisper erkannte
zwei lokal erzeugte Clips von 1,76 und 3,60 Sekunden in 108 und 124 ms.
Das belegt warme Synthese-/Erkennungszeiten, keine Mikrofon- oder Raumprüfung.

Zwei native Tests über die bestehende Hermes-Session, mit realer TTS und
stummgeschaltetem Renderer-Ausgabezeitstrahl, zeigten vorher: erster Modelltext
nach 2,20–2,43 s; erste Wiedergabe nach 3,02 bzw. 6,22 s ab lokalem Auftrag.
Die Erklärung wartete zusätzlich 3,40 s zwischen erstem Text und TTS-Einreihung
auf die vollständige Antwort. Beide Tests nutzten `none` und keine Werkzeuge;
der vorbereitende Konfigurationsabruf dauerte nur 7–10 ms. Nach Satzende kommen
beim echten Mikrofon noch VAD-Entscheidung und Transkription hinzu.

Mit erweiterter Gesprächserkennung begannen dieselben zwei Anfragen in einer
weiteren nativen Stichprobe nach 2,63 und 2,50 s mit Wiedergabe, jeweils vor dem
Modellabschluss. Zwischen erstem Text und erstem Satz lagen nun 310 bzw. 347 ms.
Die Modellantworten schwanken in Inhalt, Länge und Ankunftszeit; das ist kein
kontrollierter Modellgeschwindigkeitstest und kein allgemeiner Prozentgewinn.
Session und lokale Präferenzen blieben erhalten. Belege bleiben ignoriert unter
`.local/live-chain-before.json`, `.local/live-chain-after.json`,
`.local/live-latency-stt.json` und `.local/live-latency-tts.json`.

Frühe Sätze beseitigen die zusätzliche Vollantwort-Wartezeit, nicht die Wartezeit
auf den ersten Modelltext. Parallelagenten halten den Gesprächsweg frei, machen
diesen einzelnen Modellaufruf aber nicht schneller. Die Datei-/Satzkette bleibt
eine verkettete Sprachpipeline, kein durchgehendes Speech-to-Speech-Modell.

Für eine weitere Ausbaustufe ist eine schnelle, ständig ansprechbare
Gesprächsschicht sinnvoll, während Hermes längere Aktionen ausführt. Sie muss
Persönlichkeit, zuletzt Gesprochenes und bestätigte Auftragszustände synchron
halten; aktuelle PC-/Kamera-Informationen kommen aus vorhandenen freigegebenen
Quellen. Abbruch und Datenschutz gelten für beide Wege. Aufgaben und Ergebnisse
werden über echte Job-IDs verbunden, keine Erfolgsmeldung aus einer bloßen
Übergabe. Ein lokales Gesprächsmodell sollte vor einer dauerhaften Einbindung
mit deutscher Sprache, kurzem Kontext und gleichzeitiger STT/TTS auf Patriks
Hardware gemessen werden. Die lokale Ausbaustufe ist jetzt eingebaut; siehe [Lokales Live-Gespräch](local-live-conversation.md). Die obigen Hermes-Messungen bleiben Vergleichswerte der bisherigen Pipeline.
Die [Hermes-Voice-Dokumentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode)
beschreibt ebenfalls die Trennung von Voll-duplex-Gespräch und Hermes-Arbeit;
deren angebotener Cloud-Modus ist kostenpflichtig und ersetzt nicht automatisch
die lokal geklonte Stimme. Er wurde hier nicht aktiviert.
