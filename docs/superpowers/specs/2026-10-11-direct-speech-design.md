# Direkte Sprachbedienung

Der Nutzer hat die drei Empfehlungen aus dem hey-jev-Vergleich mit „ja los“
beauftragt. Die vorhandene Electron-App, Hermes-Session und lokale Modelle
bleiben bestehen; hey-jev-Code wird nicht kopiert und keine neue Cloud-API
eingeführt. Der bestehende Checkout wird verwendet, weil vorherige Arbeiten
noch unversioniert sind. Keine bestehenden Änderungen verwerfen oder committen.

1. Exakt erkannte Standardbefehle laufen über dieselbe persistente, serielle
   Warteschlange als lokale Windows-Aufträge. Native Rückmeldung muss den
   gewünschten Zustand belegen, bevor Erfolg bestätigt wird. Unklare,
   mehrteilige oder negierte Anweisungen und Musik-Titelsuchen gehen an Hermes.
   Unbekanntes lokales Ergebnis wird gespeichert und nicht blind wiederholt.
   Lokale Aufträge verlangen weiterhin eine ausgewählte Hermes-Session zur
   gemeinsamen Auftragszuordnung. Direkte Standardbefehle sind standardmäßig an.
2. Ein leer startendes, bearbeitbares Wörterbuch speichert ausdrücklich
   definierte korrekte Wörter und Fehlerformen. Es korrigiert neue
   Transkriptionen in einem einzigen Durchlauf; keine freie Interpretation,
   Teilwort-Ersetzungen oder Kaskaden. Ursprünglicher/korrigierter Text ist
   kurzfristig lokal nachvollziehbar; er gehört nicht in die Telemetrie.
3. Eine optional einschaltbare Sprechtaste (F8, F9 oder Ctrl+Leertaste) erfasst
   nur zwischen Drücken und Loslassen. Sie erhält Live-/Standby- und
   Kamerapräferenz, kann vorhandenen Wake-Mikrofonstream verwenden und wartet
   nicht auf eine Sprechpause zum Abschluss. Privatmodus, Sessionwechsel,
   Verbindungsabbruch, Umbelegen und überlanges Halten brechen ab. Sie ist
   zunächst ausgeschaltet; AltGr wird nicht als Sprechtaste verwendet.

Native Tastenerfassung akzeptiert nur die erlaubten Bindings und ignoriert
injizierte/automatisch wiederholte Tastendrücke. Sie zeichnet selbst kein Audio
auf. Drücken/Loslassen teilen eine Sequenz. Ein bestätigter lokaler Stopp und
ein tatsächlicher Remote-Abschluss bleiben getrennt. Direkte Ausführung wird
vor ihrem Beginn als lokal persistiert, damit Wiederanlauf nicht in einen
Hermes-Auftrag oder erneute Windows-Ausführung umgedeutet wird.

Neue UI bleibt innerhalb der vorhandenen Einstellungen. Tests prüfen
Konflikte/Ambiguitäten, Unicode-Wortgrenzen, Audio-/Sequenzgenerationen,
Datenschutz und seriellen lokalen/Remote-Betrieb. Native Prüfungen verwenden
zunächst eigene Testquellen; vorhandene Freigaben werden nicht erweitert.
