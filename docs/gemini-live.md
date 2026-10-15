# Gemini Live (optional, Windows)

Unter Audio lässt sich neben lokaler Sprache Gemini Live wählen. Cloud-Audio muss
separat freigegeben und ein eigener API-Schlüssel eingetragen werden. Eine
Einstellungsänderung startet weder Aufnahme noch Verbindung. Erst **Live** öffnet
das ausgewählte Mikrofon für Gemini. Wakeword und Sprechtaste bleiben lokal.
Modell: `gemini-3.8-live`; Stimmen: Kore, Aoede, Puck, Charon.

Der Hauptprozess speichert den Schlüssel ausschließlich verschlüsselt über
Electron safeStorage in `.local/gemini-live-key.bin`. Nicht verfügbare Verschlüsselung
und `basic_text` werden abgelehnt. Der Renderer kann nur erkennen, ob ein Schlüssel
vorliegt. Schlüssel entfernen löscht diese lokale Datei; keine Billing-Einstellung
wird geändert. Keine Schlüssel in Einstellungen, Status oder Fehlermeldungen.

Datenschutz, Standby, Sessionwechsel, Übergabe, Verbindungsverlust und Beenden
schließen Cloud-Live. Ein verspäteter Verbindungsabschluss öffnet es nicht erneut.
Jeder Audioframe benötigt dieselbe ausgewählte Session, Eingaberecht und Freigabe.
Gemini-Antworten nutzen die vorhandene PCM24k-Ausgabe mit gemeinsamer Generation;
es gibt keine zusätzliche lokale TTS der Cloud-Antwort. Unterbrechung stoppt nur
Sprache, nicht bereits angenommene Hermes-Aufträge.

Gemini erhält schmale NON_BLOCKING-Funktionen: `hermes_submit`, `hermes_status`,
`hermes_stop`, `hermes_handoff`. Ein Auftrag geht mit `speak:false` durch den
bestehenden Submit-/Intent-/Auftragsweg. Keine freie Shell- oder Rendererfunktion.
Job-Ergebnisse enthalten den tatsächlichen Status und `verified`; `agent-finished`
ist keine bestätigte PC-Aktion. Mehrteilige Aufträge behalten alle Job-IDs; die
Antwort wartet auf alle Teilaufträge oder das Zeitlimit. Direkte Mikrofonergebnisse
übernehmen die vorhandene Prüfung. Erinnerungs- und Power-Ergebnisse bestätigen
nur Planung beziehungsweise Abbruch; eine tatsächliche spätere PC-Aktion oder
Erinnerungsausgabe ist damit nicht geprüft. Bei fehlender Bestätigung, Zeitüberschreitung oder
unbekanntem Ergebnis wird nichts automatisch erneut geschickt. Der Status zeigt
höchstens 20 Aufträge der gewählten Session mit begrenzten Ergebnistexten.
Gerätewechsel kennt Notebook und Windows-PC sowie Recall. Angeforderte Übergabe
ist noch kein bestätigter Gerätewechsel.

IPC: `gemini-live-configure` nimmt `speechProvider`, `geminiCloudAllowed`,
`geminiVoice`, optional `apiKey` oder `forgetKey`; Antwort `{settings,geminiLive}`.
`gemini-live-status` liefert nur sicheren Verbindungsstatus. Start/Stop brauchen
keine neue Session; Start und Feed binden `sessionId`, Feed zusätzlich `audio`
(PCM16k als Base64). State- und Transkript-Events tragen die Session-ID.

Transporttests verwenden einen lokalen WebSocket-Peer. Controllertests prüfen
Freigabe, Ownership, Schlüsselgrenzen, verspäteten Start und einmalige Jobs.
Ohne echten API-Schlüssel sind Google-Audio, Latenz und Abrechnung nicht geprüft.
Linux-Aktivierung ist nicht Bestandteil dieser Windows-Integration.

Freie Gemini-Gespräche erscheinen derzeit nur im Fenster. Sie werden nicht in
Hermes-Verlauf oder Geräteübergabe gespeichert und bei einer neuen Live-Verbindung
nicht als Kontext geladen. Nur ausdrücklich übergebene Hermes-Aufträge erreichen
den bestehenden Auftragsweg. Gemini erhält den konfigurierten Assistentennamen.
Gemini Live kann Google-API-Kosten verursachen; Gebührenfreiheit gilt nur für den
lokalen Sprachweg. Ein Mikrofonwechsel während des Cloud-Verbindungsaufbaus
bricht diesen Aufbau ab; Live kann danach ausdrücklich neu gestartet werden.

Wakeword-Wiederaufnahme bleibt lokal, auch bei ausgewähltem Gemini-Modus.
Für die lokale Sprechtaste muss eine laufende Gemini-Verbindung zuerst beendet
werden; die Oberfläche zeigt diesen Hinweis ausdrücklich.
