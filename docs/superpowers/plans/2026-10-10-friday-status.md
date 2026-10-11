# Friday: lokale Lageberichte und Verbindungsüberwachung

> Für die Umsetzung: bestehende lokale App schrittweise erweitern, Regressionen zuerst prüfen. Spotify, Session, Kameraquelle und Sprachmodelle erhalten.

**Ziel:** Ein kurzer gesprochener und visueller Systembericht ohne zusätzlichen Hermes-Chat; GPU-Messung und überprüfter Status der Windows-Anbindung ergänzen die bisherige Überwachung.

**Architektur:** Vorhandene 15-Sekunden-Messung, MonitorPolicy und HUD wiederverwenden. Windows-GPU-WMI-Abfrage mit Timeout läuft asynchron und liefert unbekannt bei fehlenden Daten. MCP-Status kommt höchstens einmal pro Minute aus dem authentifizierten Gateway, nur wenn kein Agentenauftrag läuft. Keine neue Cloud, Kameraaufnahme, Browserabfrage, Löschung oder Treiberinstallation.

## Schritte

- [x] Tests für GPU-Aggregation (Summe pro Engine, Maximum der Engines), ungültige/unbekannte Daten und begrenzte Abfrage; `system-monitor.cjs` und neues festes PowerShell-Messskript implementieren.
- [x] Reine Systemberichtsfunktionen und genaue Sprachintents testen: negierte/zusammengesetzte Aufträge gehen an Hermes; normale Statusfrage bleibt lokal. Bekannte Messwerte mit Zeitstempel, unbekannte Verbindung niemals als offline behandeln.
- [x] `main.cjs`: MCP-Prüfung mit festem Timeout und Intervall, keine parallelen Ticks; Messwerte in Status-API, IPC-Bericht und HUD. Während eines Auftrags keinen HUD-Abschluss überschreiben. Standby- und Voice-Fortsetzung erhalten.
- [x] Renderer: GPU-Feld, Statusbericht-Schaltfläche und kompakter Verbindungsstreifen im vorhandenen Reactor-Stil. Report-Intent vor Screen/Kamera an bestehende WorkstationControls anbinden. Texte im Renderer als Text setzen.
- [x] Öffentliche Status-API liefert nur Messungen/Bericht, keine Zugangsdaten; `control.ps1 -Action status` bleibt kompatibel. Dokumentation aktualisieren.
- [x] Relevante Tests, voller vorhandener Node-Testlauf, reale GPU-Abfrage, Electron-IPC-/visuelle Prüfung im separaten Smoke-Profil. Review und normale App im Leerlauf neu starten; richtige Session und Wakewords prüfen.

## Grenzen

GPU-Zähler beschreiben Auslastung, keine Temperatur. Keine Warnung allein wegen hoher GPU-Auslastung: beim Spielen oder lokaler KI erwartbar. Verbindungsstatus belegt die Transport-/Werkzeugregistrierung, keine erfolgreiche Bedienung jeder Anwendung. Systemberichte verwenden Messalter, damit alte Daten nicht als frisch ausgegeben werden.

## Erweiterter autorisierter Umfang

Der Nutzer ergänzte digitale Werkstatt mit System/Konsole/Browser, Programme/Store-App-Auswahl und lokale optionale Handgesten. Getrennte Implementierungen wurden nach dem Parallel-Agenten-Skill integriert. Eine native Electron-Prüfung bestätigte UI, Browsernavigation/Isolation, WASM-Handmodell und Öffnen-Geste anhand eines öffentlichen Bildes; keine Nutzerkameraaufnahme. Review-Funde zur Live-Fortsetzung und Text-/Voice-Trennung wurden reproduziert und korrigiert.
