# USB-Umstecken und blockierte Aufträge · 11.10.2026

Der konkrete Ausfall hatte zwei belegte Ursachen: Nach USB-Umstecken war die
gespeicherte Sennheiser-Eingabekennung nicht mehr vorhanden. Gleichzeitig blieb
ein früherer unterbrochener Auftrag als `outcome-unknown` aktiv und blockierte
spätere Anfragen, obwohl das Gateway verbunden und frei war.

Die App speichert jetzt zur Mikrofonkennung den gewählten Namen. Beim erneuten
Anschluss wird nur ein eindeutiger gleicher Eingang neu zugeordnet; Windows-
Instanzpräfixe wie „2-“ in Klammern werden dafür normalisiert. Keine Auswahl
eines anderen Standard-/Headset-/Webcam-Eingangs und keine Auswahl bei mehreren
gleichnamigen Geräten. Gerätetausch, Eingabe und Ausgabe sind getrennte Zustände.
Details: [Mikrofon](microphone.md).

Unbekannte Auftragswirkungen blockieren weiterhin die Wiederholung. Diese
Blockade ist nun in der aufgeklappten Orb-Ansicht sichtbar und besitzt den
vorhandenen, eigentümergeprüften Prüfweg. Bei belegtem Remote-Leerlauf kann der
unklare Auftrag ohne Erfolgsaussage pausiert werden, damit neue Aufträge wieder
laufen. Alte Aktionen werden dadurch nicht erneut gesendet.
Hinweise zu vorgemerkten Aufgaben unterscheiden eine laufende Agentenaufgabe,
Sprachausgabe, Aufnahme und lokale Verarbeitung.

Am echten PC geprüft: alte Sennheiser-Kennung automatisch zur neuen Kennung
aufgelöst, gespeicherte Wahl und laufende Aufnahme verglichen, unbekannte Arbeit
ohne Replay pausiert und drei überholte Diagnoseanfragen beendet. Ein neuer
Testauftrag erreichte dieselbe Hermes-Session und wurde beantwortet. Wake-
Bereitschaft, Live und unverändert ausgeschaltete Kamera wurden bestätigt.
Eine spätere echte gesprochene Audio-Umschaltung erreichte Hermes ebenfalls und
wurde abgeschlossen. Ihre lokale Wartezeit betrug etwa 6,5 Sekunden vor dem
Hermes-Start, danach etwa 7,7 Sekunden Agentenzeit; dieser Hinweis war kein
Verbindungsabbruch. Andere frühere Unterbrechungen sind damit nicht pauschal erklärt.

647 reguläre Tests bestanden, vier Hardwaretests bleiben separat aktiviert.
Belege: ignorierte `.local/replug-recovery-proof.json` und Testausgabe.
