# Lokale Sprachprüfung · 9. Oktober 2026

## Satzende im Live-Gespräch · 10. Oktober

Die Live-Aufnahme verwendet jetzt einen residenten Silero-v5-Detektor über
die vorhandene sherpa-onnx-Umgebung. Der frühere RMS-Timer konnte bei
gleichmäßigem Raumgeräusch bis zur 30-Sekunden-Grenze weiterlaufen. Jetzt
beendet erkannte Sprache die Aufnahme nach 500 ms erkannter Sprechpause;
der Pegel allein verlängert sie nicht. Aufnahmegenerationen verhindern,
dass verspätete Ergebnisse einen neuen Turn beenden. Audio bleibt lokal.

Zwei echte Sprachproben mit anschließendem Rauschen (RMS 0,004) endeten
432 bzw. 784 ms nach dem Dateiende. Jeweils etwa 16 ms Rechenzeit verarbeiteten
die gesamte Probe schneller als Echtzeit. Reines Rauschen und Stille lösten
keine Sprache aus. Das sind Modelltests, keine Messung des aktuellen Mikrofons
oder der vollständigen Hermes-Antwortzeit.

Modell: `runtime/wake/silero_vad.onnx` aus dem offiziellen Silero-v5-Tag:
https://github.com/snakers4/silero-vad/raw/refs/tags/v5.0/files/silero_vad.onnx.
Prüfung: `runtime/voice/venv/Scripts/python.exe scripts/speech_listener_test.py`.
Ohne bereitstehenden Detektor verweigert die App den Live-Start mit Hinweis.

qwentts.cpp wurde mit dem vorhandenen LLVM-MinGW, Ninja und Vulkan SDK gebaut.
Der Runtime-Log bestätigt **AMD Radeon RX 7900 XTX / Vulkan0**; CPU ist kein
heimlicher Ersatz für die gemessene Sprachsynthese. Whisper meldet ebenfalls
Vulkan0 und geladene large-v3-turbo-Gewichte.

| Probe | Dauer des Audios | Synthesezeit | Verhältnis Zeit/Audio |
|---|---:|---:|---:|
| Souverän | 14,40 s | 9,27 s, erster Aufruf | 0,644 |
| Dunkel/kraftvoll | 14,80 s | 2,22 s | 0,150 |
| Warm/frech | 13,28 s | 2,02 s | 0,152 |
| Flüstern | 15,20 s | 2,23 s | 0,147 |
| Kraftvolle Betonung | 13,28 s | 1,84 s | 0,138 |

Die erste Probe enthält den kalten Shader-/Engine-Anlauf. Ein separater kurzer
PCM-Streamingtest lieferte erstes Audio nach 130 ms und erzeugte 3,04 Sekunden
Audio in 726 ms. Dieser Wert ist ausschließlich die lokale TTS-Verbindung.

Whisper erkannte die 14,8-Sekunden-Probe in 2,09 Sekunden vollständig, einschließlich
„Überblick“, „prüfe“, „kümmere“ und „nächsten“. Kurze Testaufnahmen der fünf
Aktivierungsvarianten wurden nach Aufwärmen in etwa 158–181 ms transkribiert und
den richtigen Namen zugeordnet. Der Text hinter dem Namen blieb erhalten.
Die kleine Keyword-Engine allein war für die deutschen Lilith/Lillis-Proben
unzuverlässig; deshalb gehört der deutsche Whisper-Rückfallweg zur Umsetzung.

WAV-Dateien und `wake-check.json` liegen unter `voices/`. Die WAVs sind gestaltet,
keine Kopien echter Schauspielerinnen. Ein brauchbarer technischer Audiostream
und eine korrekte Transkription ersetzen keinen Hörtest der Stimmqualität.
Beim ersten Nutzertest wechselte die Stimmidentität zwischen Sätzen. Der
Live-Pfad wurde deshalb auf Base mit festen Sprecherreferenzen umgestellt.
VoiceDesign bleibt ausschließlich das Werkzeug zur Erstellung der Referenzen.

Vier getrennte Synthesen unter der aktuellen Einstellung Souverän/Kraftvoll
wurden anschließend vollständig transkribiert. Die Sprecher-Einbettungen der
generierten Clips erreichen untereinander Kosinusähnlichkeiten von 0,958 bis
0,991. Das ist eine technische Konsistenzprüfung; der Höreindruck bleibt vom
Nutzer zu beurteilen. Gemeinsame Hörprobe: `voices/fixed-consistency.wav`.

Eine reine Nullsignal-Aufnahme erzeugte mit Whisper ohne VAD „Vielen Dank.“,
ein Rauschsignal „Amen.“. Silero VAD 6.2.0 verwirft beide Aufnahmen. Die normalen
deutschen Sprachproben und ein wirklich synthetisiertes „Vielen Dank.“ bleiben
erkennbar. Die App verwendet zusätzlich ein Signalminimum und Segmentprüfung.
Nach Audiowiedergabe hält die Mikrofonaufnahme 400 ms Abstand gegen Nachhall.

27 Wakeword-Ansagen (drei Texte × drei Stimmen × drei Sprechweisen) sind als
24-kHz-PCM lokal gespeichert und auf nichtleeren, ausreichenden Audioinhalt
geprüft. Die Ansage braucht weder Netzverbindung noch einen neuen TTS-Lauf.

## Adapter

```powershell
.\runtime\voice\venv\Scripts\python.exe scripts/voice_synthesize.py --text-file voices/audition.txt --output voices/test.wav --voice dark --engine http
.\runtime\voice\venv\Scripts\python.exe scripts/voice_synthesize.py --text-file voices/audition.txt --output voices/whisper.wav --voice dark --delivery whisper --engine http
.\runtime\voice\venv\Scripts\python.exe scripts/transcribe.py --input voices/02-dark.wav
```

Die App startet residente Sprachserver auf 127.0.0.1:8870/8871 selbst, sofern dort
noch keiner läuft. Befehle setzen diese lokalen Server voraus; es gibt keinen
Fallback zu einem bezahlten Sprachdienst.

Der Adapter `voice_synthesize.py` erzeugt weiterhin neue VoiceDesign-Referenzen.
Er stellt nicht den Live-Synthesepfad der App dar.

## Importierte Referenzstimme

Die Auswahl **Deine Referenzstimme** verwendet einen lokal aus der vom Nutzer
bereitgestellten Aufnahme erzeugten Sprechervektor und einen 11,66 Sekunden
langen Referenzausschnitt. Das Profil `hermes-reference-normal` liegt zusammen
mit den bisherigen Stimmen in `voices/fixed/registry.json`. Kurze Antworten
verwenden denselben Sprechervektor ohne den längeren Referenztext; drei
Wakeword-Begrüßungen sind mit dieser Stimme vorgerendert.

Die Auswahl erscheint nur bei installiertem Profil. Für diese Aufnahme ist
zunächst ausschließlich die natürliche Sprechweise verfügbar; Flüstern und
kraftvolle Projektion sind in der Oberfläche deaktiviert. Die bisherigen
Stimmen behalten ihre Sprechweisen.

Quelle, Ausschnitt, Sprecherprofil und Hörprobe bleiben in den ignorierten
lokalen Verzeichnissen `voices/` und `.local/`. Es wird kein externer Sprachdienst
verwendet. Die Hörprobe liegt unter
`voices/imported/lilith-reference-preview.wav`. Drei Probesätze wurden korrekt
transkribiert; die Sprechervektoren sind technisch konsistent. Das garantiert
keine identische Nachbildung der Originalstimme und ersetzt keinen Hörtest.

## Mehrere lokale Stimmprofile

Unter Einstellungen → **Stimme** erscheinen die tatsächlich installierten
Profile mit ihren lokalen Anzeigenamen. Eine Auswahl oder Änderung der
Sprechweise wird sofort gespeichert; **Anhören** spielt eine kurze Probe.
Nur vorhandene Sprechweisen lassen sich auswählen. Profile mit ausschließlich
natürlicher Sprechweise bieten kein Flüstern oder kraftvolle Projektion an.
Die Wahl verändert weder Hermes-Session noch Mikrofon-, Sensor- oder Standby-
Einstellungen.

Die Liste kommt aus `voices/fixed/registry.json`: `hermes-<id>-<delivery>`
identifiziert ein Profil, `display_name` benennt es optional. Der Renderer
bekommt nur ID, Anzeigename und vorhandene Sprechweisen, keine Sprechervektoren,
Referenztexte oder Audio-Codes. Frühere Profile werden unter eigener ID
erhalten, einschließlich ihrer passenden Wakeword-Begrüßungen.

Eine Referenz mit leerem `ref_text` nutzt nur den Sprechervektor; die
Referenz-Audio-Codes werden im vorhandenen TTS-Server nicht zur Synthese
übernommen. Das kann Begleitton aus einer gemischten Vorlage vermeiden,
garantiert aber keinen rauschfreien Höreindruck. Eine separat gestaltete
Studiostimme braucht keine gemischte Originalaufnahme. Hörproben und
Profil-Backups bleiben unter den ignorierten `voices/` und `.local/`.

**Lilith · Studio** bietet zusätzlich **Flüstern** an. Die natürliche Variante
bleibt erhalten; die Flüsterreferenz verwendet denselben Sprechervektor und
eine eigene lokal erzeugte Stilaufnahme. Kurze Antworten behalten ebenfalls
die Stilreferenz. Falls eine gewünschte Sprechweise kein Audio erzeugt, wird
ein Fehler gemeldet statt unbemerkt normal zu sprechen. Drei passende lokale
Wakeword-Begrüßungen sind separat vorgerendert. Kraftvolle Projektion wird für
dieses Profil nicht ergänzt.
