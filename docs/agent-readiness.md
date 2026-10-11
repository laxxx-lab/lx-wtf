# Hermes: aktuelle Projektkenntnis und Wartung

Stand 11.10.2026. Die aktuelle Windows-App ist in Hermes' Default-Profil mit
Bedien- und Entwicklungseinstieg dokumentiert. Kurze Verweise in seiner
`AGENTS.md` und `SOUL.md` nennen das tatsächliche Projekt und die aktuellen
Skills. Die bisherigen Persönlichkeits-, Kanal-, Team- und Betriebsregeln
wurden erhalten; vor den Änderungen wurden Backups erstellt und zurückgelesen.

- `hermes-voice-control`: aktuelle lokale Bedienverträge und Verweis auf Quellarbeit.
- `hermes-voice-development`: Einstieg über Windows, Projektanleitung, Diagnose,
  Patch, Tests, echte Laufzeitprüfung und Erhalt der Benutzerzustände.
- `lilith-live-voice-app`: trennt die heutige Electron-App von der früheren
  Python-/Tkinter-App. Die alte Anleitung ist als Legacy-Referenz archiviert.

Skill-Beschreibungen bleiben innerhalb des vom tatsächlichen Gateway erlaubten
60-Zeichen-Budgets. Alle drei Skills wurden nach Installation vollständig
zurückgelesen und als aktiviert geprüft. Quellzuordnung und Arbeitsregeln liegen
im Windows-Repository unter [AGENTS.md](../AGENTS.md) und
[agent-maintenance.md](agent-maintenance.md), damit zukünftige Änderungen an
diesen Quellen statt an alten Chat-Erinnerungen ansetzen.

## Echter Agententest

In derselben bestehenden Hermes-Session hat Lilith die Projektanleitungen und
`ui/microphone.js` über den bereits vorhandenen Windows-SSH-Zugang gelesen und
die aktuelle Electron-App sowie `microphoneConstraints(deviceId)` korrekt
zugeordnet. `node --test tests/microphone.test.cjs` auf dem tatsächlichen PC:
vier Tests bestanden, null Fehler, Exitcode 0.

In einem zweiten Test lud sie den installierten Entwicklungsskill ausdrücklich
über `skill_view`. Eine neue temporäre Datei wurde auf dem PC als UTF-8-JSON
geschrieben, zurückgelesen und inhaltlich verglichen, danach entfernt und deren
Abwesenheit geprüft. Nach einem Shell-Quoting-Fehler nutzte sie einen passenden
Skriptweg; der fehlgeschlagene Versuch wurde nicht als Erfolg gewertet.
`node --check ui/microphone.js` meldete Exitcode 0. Die lokale Steuerungs-API
wurde vom PC erreicht. Produktivcode, Geräte und Einstellungen wurden durch
diese Agententests nicht verändert. Die Werkzeugrückgaben wurden zusätzlich
geprüft; Belege bleiben im ignorierten `.local/`.

Das belegt aktuellen Quellen-, Test- und Schreibzugriff. Es garantiert nicht,
dass jede zukünftige Reparatur korrekt ist oder erhöhte Windows-Rechte verfügbar
sind. Jede tatsächliche Änderung braucht ihren passenden Ergebnisnachweis.
Ein reiner SSH-Quelltest belegt keinen sichtbaren GUI-Start oder Hardwarezugriff;
dafür bleibt die vorhandene interaktive Windows-Anbindung zuständig.
