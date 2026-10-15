# Direkte Sprachbedienung · 11.10.2026

Die drei beauftragten Erweiterungen sind in Lilith integriert; die bestehende
Hermes-Session, Stimme und lokale Modelle werden weiterverwendet.

- **Standardbefehle:** „Öffne Spotify“, „Mach den Ton leiser“, „Lautstärke auf
  30 Prozent“, „Pausiere Spotify“. Die kleine lokale Liste ist standardmäßig
  aktiv. Titelsuche, komplexe/unklare Anfragen bleiben bei Hermes. Ohne
  passende Windows-Spotify-Sitzung bleibt der bestehende Hermes-Weg zuständig.
  Wirkung prüfen, bevor Erfolg bestätigt wird; unbekannte Wirkung blockiert
  Wiederholung. Ergebnisse fließen mit Zeitangabe in den nächsten Hermes-Auftrag.
- **Wörterbuch:** Unter Einstellungen → Sprache / Direkt beobachtete
  Fehlerformen zu einem Begriff speichern. Die Vorschau zeigt Ersetzungen.
  Bei einer tatsächlichen Ersetzung zeigt das Gespräch den letzten
  Vergleich aufklappbar. Live, Sprechtaste und akzeptierter Wake-Befehl
  korrigieren gleich; das Wörterbuch erfindet kein Aktivierungswort.
- **Sprechtaste:** Optional in derselben Sektion einschalten und F8, F9 oder
  Ctrl+Leertaste wählen. Halten nimmt auf; Loslassen beendet sofort. Global
  auch beim kleinen Orb, ohne Live-/Standby-/Kamerapräferenz zu ändern.
  Sie ist anfangs aus. AltGr und injizierte Tastendrücke werden nicht erfasst.

## Geprüft

531 reguläre Tests bestanden; die drei bewusst separat aktivierten
Windows-Prüfungen bestanden ebenfalls. Tatsächliches Core Audio und SMTC
wurden gelesen, ein eigenes leeres natives Testprogramm wurde über den
Produktionsweg gestartet und sein Fenster exakt bestätigt. Die echte
C#-Tastenkantenlogik wurde ohne Tasteneingabe geprüft. Reale Electron-Renderer
prüften Editor, Speichern, Entwürfe, Korrekturansicht und PTT mit Testaudio.

Die aktive Hermes-Verbindung bearbeitete einen belegten lokalen Tonbefehl
und anschließend einen Agenten-Testauftrag seriell. Der Tonbefehl setzte den
bereits bestehenden Stummschaltungszustand; Pegel und Stummschaltung blieben
gleich. Datenschutz und Sensor-/Wake-Einstellungen blieben erhalten.
Beleg: `.local/direct-speech-activation.json`.

Die unabhängige Prüfung fand einen blockierten Folgeauftrag nach lokalem
Abbruch, Tastaturwiederholung nach Loslassen eines Modifikators und fehlende
Wörterbuchkorrektur im Standby-Weg. Alle drei Fehler sind korrigiert und durch
Regressionstests abgesichert.
Eine native Aktion mit unbestätigter Wirkung wird nach Neustart nicht
wiederholt. F8/Hardwaremikrofon und Musik-Wechsel bei des Nutzers aktueller
Wiedergabe bleiben noch als gemeinsame Alltagstests erforderlich.

Kein neuer kostenpflichtiger Dienst, keine fremde Sprachpipeline und keine
Installation eines anderen Jarvis-/Ultron-Assistenten.

Weitere Quellen und sinnvolle Alltagsmuster:
[Jarvis-/Ultron-Recherche](jarvis-ultron-research.md).
