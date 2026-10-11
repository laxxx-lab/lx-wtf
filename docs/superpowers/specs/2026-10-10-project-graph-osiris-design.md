# Projektgraph, visuelle Anleitung und OSIRIS

Der Nutzer erweitert den JARVIS-Auftrag um sichtbares Projektverständnis,
geführte Erklärungen und öffentliche OSIRIS-Daten. Grundlage ist vorerst
Graphify-Labs/graphify; die optionale Nachfrage kann diese Auswahl korrigieren.

- Lokale Graphify0.9.84-Codeanalyse in eigener Python-Umgebung. Nur bewusst
  gewähltes Projekt; runtime/.local/Abhängigkeiten/Geheimnisse ausgeschlossen.
  JSON wird als Daten normalisiert, kein fremdes graph.html privilegiert ausgeführt.
  Suche liefert reale Knoten-IDs; Quelltext öffnet als begrenzte Textvorschau,
  niemals über einen potenziell ausführenden Windows-Dateizuordnungsbefehl.
- Werkstatt erhält Projektgraph und Lagekarte als eigene Ansichten. Graph-Suche
  hebt Treffer und Beziehungen hervor. Aktivität/Glow beschreibt beobachtete
  Werkzeugschritte mit eindeutig gebundenem Ziel, keine erfundenen Suchbewegungen.
- Visuelle Anleitung zeigt Fensterglow und einen künstlichen Zeiger. Aktueller
  HWND/PID, Quellzeitpunkt und Rechteck müssen zu frischen Windows-Daten passen.
  Nutzer klickt selbst; keine OS-Mausbewegung, Eingabe oder Fokusänderung.
  Bewegung, minimiertes/geschlossenes Fenster, Ablaufzeit und Datenschutz löschen
  die Anleitung. Quelldaten aus UIA/DOM bleiben erforderlich; Bildbeschreibung
  allein begründet keine genaue Klickposition.
- OSIRIS wird über feste öffentliche GET-Feeds in der lokalen App gelesen.
  Dokumentationsangaben werden gegen Live-Antworten geprüft. Keine RECON-Scans,
  Schreiboperationen oder kostenpflichtigen OI-Modellaufrufe in dieser Integration.
  Kameras sind öffentliche, vom Anbieter gelistete Quellen; Standortmehrdeutigkeit
  führt zur Nachfrage/Quellenauswahl. Keine automatische Wiedergabe.
- Erdbeben »heute« verwendet Kalendergrenzen Europe/Berlin; rollierende24Stunden
  allein sind keine Antwort. Quellenzeit und Abrufzeit bleiben getrennt. Ukraine-
  Darstellung zeigt Feed-/Kartenquellen und deren Alter; keine simulierten Prognosen
  als Fakten. Weiterführende Quellen öffnet der separate Werkstatt-Browser bewusst.
- Neue IPC/API-Schemas bleiben eng und authentifiziert. Datenschutz beendet
  Analysen/Requests/Overlays; Entsperren startet nichts automatisch.

Prüfung: TDD für Normalisierung, Pfadgrenzen, Standort-/Zeitfilter, Sperr- und
Navigationsrennen; tatsächlicher lokaler Graphify-Lauf, öffentliche GET-Proben,
native Electron-Darstellung und reale Overlay-Identitäts-/Positionstests.
