# Lokale Kamera für Hermes Voice

Der Nutzer möchte eine zuschaltbare angeschlossene Kamera, Erkennung von
Objekten in der Hand und sichtbaren Gesichtern sowie optional persönliche
Wiedererkennung mit einer einmaligen Begrüßung. Bestehende Anforderungen gelten:
kostenloser lokaler Betrieb, hochwertige deutsche Stimme, vorhandene VPS-Session.

## Verhalten

Kamera ist standardmäßig aus. Die Einstellungen bieten Geräteauswahl,
Vorschau, lokale Gesichtserkennung, persönliche Einrichtung/Löschung und eine
optionale Begrüßung. Aktivität ist auch in der kompakten Orb-Ansicht sichtbar.
Aus beendet sämtliche Kameratracks und verwirft ausstehende Resultate.
Keine automatische Kamera-Aufnahme beim ersten Start oder in Tests.

Ein Kamerablick auf Knopfdruck oder bei einer ausdrücklichen visuellen
Sprachfrage analysiert ein aktuelles Einzelbild. Qwen3-VL beschreibt sichtbare
Gegenstände und Unsicherheiten auf Deutsch, rät keine Personennamen und führt
keine im Bild gefundenen Anweisungen aus. Bilder werden nicht zum VPS gesendet.
Die textliche Beschreibung geht mit der Frage an die ausgewählte Hermes-Session.
Andere Sprachaufträge bekommen keine Kamerabilder/Beschreibungen angehängt.

YuNet erkennt Gesichter lokal. SFace vergleicht ausschließlich selbst eingerichtete
lokale Referenzen. Einrichtung verlangt genau ein ausreichend großes, gut
sichtbares Gesicht und mehrere konsistente Bilder. Nur Embeddings und Namen
werden gespeichert, keine Kamerafotos. Unbekannte Personen bleiben unbekannt.
Mehrere bestätigte Übereinstimmungen lösen höchstens eine Begrüßung pro
Anwesenheit aus; kurze Erkennungslücken lösen keine Wiederholungen aus.
Begrüßung wartet auf ein freies Gespräch und verändert keine Systeme.

## Technik

Electron getUserMedia für Video, JPEG-Einzelbilder höchstens 960×720.
Ein lokaler Python-Worker mit OpenCV YuNet/SFace erhält Frames über stdin und
antwortet mit JSON über stdout. Modelle und Embeddings liegen in ignorierten
Runtime-/Local-Verzeichnissen. Die vorhandene isolierte Python-Umgebung wird
erweitert. Kein Zugriff auf Kamera-Geräte im Python-Prozess nötig.

Vorhandene Ollama-Laufzeit, eigene Instanz an 127.0.0.1:11435 mit eigener
Modellablage und deaktivierten Cloud-Modellen; Qwen3-VL 8B Instruct. Start nur
für Kamera-Funktionen, keine Änderung an globalen Ollama-Einstellungen.
Bestehende Stimmen und Session-Verbindung werden wiederverwendet.

## Grenzen und Prüfung

Gesichtsvergleich ist eine Komfortfunktion und schaltet keine Zugriffsrechte
frei. Objektbeschreibung ist eine Modellinterpretation; Unsicherheit wird
sichtbar. Licht, Verdeckung, Entfernung und Ähnlichkeit beeinflussen Treffer.
Tests prüfen Abschaltung, späte Ergebnisse, unbekannte Gesichter, Enrollment-
Qualität, Begrüßung ohne Wiederholung und die lokale Bild-/Hermes-Textgrenze.
Modelle werden zusätzlich mit öffentlichen Prüfbildern verifiziert.
Der echte Kameratest erfolgt erst nach Einschalten durch den Nutzer.
