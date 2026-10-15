# hey-jev und Lilith · Vergleich vom 11.10.2026

Geprüfter Stand: `24e4b378350d999d2b45ff2549ea039c2bc7863d`.
Statische Quellprüfung; hey-jev wurde nicht installiert oder ausgeführt.
Die laufende Lilith-App wurde nicht verändert.

hey-jev ist ein englischer macOS-Assistent mit AppleScript-Aktionen, lokaler
Whisper-Erkennung, Cloud-Befehlsentscheidung und Cloud-Stimme. Er enthält eine
feste Aktionstabelle, App-Aliase, vorbereitete Antwortaudios, Taste-zum-Sprechen,
Timer und ein Diktat mit Wörterbuch und Behandlung fehlgeschlagener Teile.
[Quellcode](https://github.com/henryklunaris/hey-jev/blob/24e4b378350d999d2b45ff2549ea039c2bc7863d/siri.py),
[Diktat](https://github.com/henryklunaris/hey-jev/blob/24e4b378350d999d2b45ff2549ea039c2bc7863d/dictation.py).

## Sinnvolle Erweiterungen für unser Projekt

| Idee | Lilith heute | Eigenständige Umsetzung für Windows |
| --- | --- | --- |
| Direkte Standardbefehle | Lokal für Standby, Werkstatt und Status; allgemeine PC-Aufträge gehen an Hermes | Eine kleine geprüfte Aktionsliste für App-Start, Lautstärke und passende Medienaktionen. Komplexe Aufgaben und Titelsuche bleiben bei Hermes. Auftragsverfolgung und Ergebnisprüfung beibehalten. |
| Erkennungswörterbuch | Feste Varianten für Hermes/Lilith/Lillis; kein bearbeitbarer allgemeiner Wortschatz | Eigene Begriffe und erlaubte Fehlerformen bearbeiten, etwa LightCraft und Projektnamen. Korrektur sichtbar machen; keine frei erfundenen Befehle ergänzen. |
| Gedrückthalten zum Sprechen | Hotkey schaltet Live um | Konfigurierbare Taste/Maustaste: halten nimmt auf, loslassen beendet den Satz. AltGr für die deutsche Tastatur freihalten. |
| Vorbereitete kurze Bestätigungen | Wake-Begrüßungen sind vorbereitet | Lokale Audios für häufige feste Antworten erweitern, abhängig von Stimme/Sprechweise. Erfolgsbestätigung erst nach belegter Wirkung. |
| Lokales Diktat | Transkription dient Sprachaufträgen | Separater Diktatmodus mit lokaler deutscher Whisper-Erkennung, Vorschau und ausdrücklich angeforderter Übernahme. Fehlende Teile sichtbar behandeln. |
| Timer im HUD | Kein eigener lokaler Timerbereich | Sichtbarer Countdown und kurze Ansage. Persistenz sowie Verhalten bei Neustart, Standby und Datenschutz festlegen. Vorhandene Hermes-Erinnerungen nicht duplizieren. |

Empfohlene Reihenfolge: Standardbefehle, Wörterbuch, Taste-zum-Sprechen;
anschließend Diktat/Timer nach Bedarf. Hermes behält seine Session und die
anspruchsvollen Aufgaben. Es ist keine zweite unabhängige Agenteninstanz nötig.

## Grenzen der Übernahme

Die Cloud-Entscheidung ist nicht dauerhaft kostenlos; TypeSafe nennt
verbrauchsabhängige Preise. Fishs kostenloses TTS-Angebot gilt derzeit bis
30.11.2026. Deshalb passt eine eigenständige lokale Umsetzung besser zu
des Nutzers Kostenwunsch. Das sind keine Klang- oder Geschwindigkeitsmessungen für
unser deutsches Setup.
[TypeSafe](https://docs.typesafe.ai/models),
[Fish-Angebot](https://fish.audio/blog/s2-1-pro-free-api/).

Die Quellprüfung zeigte auch eine mögliche falsche Gesamtbestätigung bei
Teilerfolg mehrerer Aktionen. Dieses Verhalten sollte nicht übernommen
werden; unsere getrennten Auftrags-/Werkzeugbelege bleiben maßgeblich.
[Ausführung und Antworten](https://github.com/henryklunaris/hey-jev/blob/24e4b378350d999d2b45ff2549ea039c2bc7863d/siri.py).

Im vollständigen Repository-Baum wurde keine Lizenzdatei gefunden;
GitHub meldet `license:null`. Direkte Codeübernahme setzt eine geklärte
Lizenz voraus. Die beschriebenen Bedienideen können wir eigenständig umsetzen.
[Repository](https://github.com/henryklunaris/hey-jev),
[GitHub zu Repository-Lizenzen](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
