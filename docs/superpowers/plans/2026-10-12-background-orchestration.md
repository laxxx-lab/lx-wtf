# Hintergrundaufträge bei weiter ansprechbarer Lilith

**Ziel:** Die bestehende Voice-Session bleibt nach einer echten asynchronen
Delegation ansprechbar. Bis zu zwei unabhängige Hintergrundaufträge laufen;
Desktop-/Dateiarbeit am gleichen Ziel erhält eine eindeutige Zuständigkeit.
Ergebnisse und Stopps werden ihrem ursprünglichen Auftrag zugeordnet.

**Architektur:** Vorhandene Hermes-Unteragenten, Session und Werkzeuge verwenden.
Eine getrennte Auftragsverwaltung verfolgt delegierte Arbeit unabhängig vom
aktuellen Gesprächszug. Übergabe ist kein Fertig-/Erfolgsnachweis. Lokale direkte
Steuerung, Datenschutz, gespeicherte Session und vorhandene Warteschlange erhalten.
Kein zweites kostenpflichtiges Produkt, kein Gateway-/Sessionreset.

## Schritte

- [ ] Gateway-Fähigkeiten und tatsächliche Delegations-/Ergebnisereignisse lesen.
      Mit zwei ungefährlichen Tests in einer isolierten Diagnosesession prüfen,
      dass das Elterngespräch antworten kann, während ein Kind noch läuft.
- [ ] Regressionen für Übergabe, zwei Slots, Zielkonflikte, Ergebniszuordnung,
      gezielten Stopp, Datenschutz und Wiederanlauf ohne automatische Wiederholung.
- [ ] Kleinsten passenden Ablauf implementieren: längere Arbeit delegieren,
      Elterngespräch zügig abschließen; Kind-IDs und Job-IDs dauerhaft korrelieren.
      Keine Bilddaten an externe Unteragenten senden; vorhandene lokale Vision
      über ihren bestehenden Steuerungsweg benutzen.
- [ ] Werkstatt um echten Auftragsstatus, Fortschritt und gezielten Stopp ergänzen.
      Sprachmeldungen sind knapp; Hintergrundmeldungen unterbrechen den Nutzer
      nicht und dürfen nicht als Antwort auf einen anderen Auftrag erscheinen.
- [ ] Gesamtsuite, native Renderer-/Gateway-Prüfung mit vorhandener Windows-App,
      erhaltene Sensor-/Audio-/Sessionpräferenzen und gesicherter Skill-Readback.
- [ ] Normalen Client aktivieren und innerhalb des autorisierten Umfangs publizieren.

Die konkreten Methoden und Felder richten sich nach dem nachgewiesenen VPS-
Gateway. Fehlende asynchrone Fähigkeiten werden als solche angezeigt, nicht durch
parallel angelegte Ersatzsessions oder scheinbar fertige Aufträge verdeckt.
