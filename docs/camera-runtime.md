# Lokale Kamera-Prüfung · 9. Oktober 2026

Die echten Kamera-Geräte wurden bei der Implementierung nicht aktiviert.
Der native UI-Lauf bestätigt Kamera-Aus-Zustand, null Video-Tracks, verborgenen
Aktivitätsindikator und null Renderer-/Preload-Fehler. Die Einstellungen wurden
als Electron-Fenster gerendert und visuell geprüft.

YuNet `face_detection_yunet_2023mar.onnx` (232589 Bytes) und SFace
`face_recognition_sface_2021dec.onnx` (38696353 Bytes) wurden vom offiziellen
OpenCV-Zoo geladen; beide SHA256-Summen stimmen mit den LFS-Metadaten überein.
Die Modelle und ihre Lizenzen liegen unter `runtime/vision/models/`.

Die öffentlichen OpenCV-Prüfbilder zeigen eine erfolgreiche Einzelgesicht-
Erkennung, Enrollment mit drei Referenzen, dieselbe Identität mit Kosinuswert
1,0 und ein anderes Gesicht mit 0,127 als unbekannt. Diese Werte sind keine
Messung der Erkennungsrate an der Webcam. Enrollment und Vergleichsprüfungen
benutzen temporäre Testprofile, nicht die persönlichen Profile des Nutzers.

Die Node-Worker-Verbindung wurde zusätzlich mit einem echten Modellbild
geprüft: ein erkanntes Gesicht, kein Name bei deaktivierter Wiedererkennung,
keine persönlichen Profile vorhanden. Bilder werden über die Prozess-Pipe
übergeben, nicht als Foto gespeichert.

Qwen3-VL `8b-instruct` wurde über die vorhandene Ollama 0.30.8 in eine eigene
Modellablage geladen (6,1 GB). Die Download-Digests wurden von Ollama geprüft.
Der Laufzeit-Log bestätigt RX 7900 XTX / ROCm. Eine Fußball-Szene wurde auf
Deutsch mit Trikot, Ball und Rasen beschrieben; `held_object` blieb korrekt
null. Der erste kalte Bildaufruf brauchte 21,7 Sekunden einschließlich Modell-
Anlauf; der interne Inferenzteil lag bei etwa 2,0 Sekunden. Die App bereitet
das Modell deshalb bereits beim Einschalten der Kamera ohne Bild/Benutzertext
vor und hält es bei aktiver Nutzung zehn Minuten bereit.
Eine anschließende Prüfung maß 17,9 Sekunden für das Vorbereiten und 2,1 Sekunden
für den Bildaufruf mit bereits geladenem Modell.

Eine unabhängige Prüfung reproduzierte drei Fehler und bestätigte die Fixes:
normale Textfragen lösen keinen Kamerablick aus; HTTP-Weiterleitungen dürfen
den Bild-POST nicht aus dem lokalen Endpunkt herausleiten; Abschaltung während
einer Startprüfung darf keinen neuen Ollama-Prozess erzeugen.

Die tatsächlichen Main-IPC-Handler wurden mit verzögerten Beschreibungen geprüft.
Stoppen, Kamera aus, Gerätewechsel und Sessionwechsel senden danach null Prompts
und zeigen kein spätes Kamerabild-Ergebnis. Weitergeleitet wird ausschließlich
die Beobachtung als Text, keine JPEG-Daten oder Gesichts-Einbettungen.

Noch erforderlich ist der Nutzertest mit seiner angeschlossenen Kamera:
Geräteauswahl, Licht/Entfernung, Gegenstand in der Hand, persönliche Einrichtung
und Begrüßung in der echten Umgebung. Vergleiche sind Komfortfunktionen und
keine Authentifizierung oder Lebendigkeitsprüfung.

Abschließende Suite: 51 JavaScript- und 22 Python-Tests bestanden. Die normale
App wurde mit der vorhandenen Session neu gestartet; Kamera und persönliche
Wiedererkennung bleiben bis zur manuellen Einrichtung deaktiviert.
