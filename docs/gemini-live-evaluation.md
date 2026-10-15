# Gemini Live als Sprachinterface vor Hermes

Recherche vom 15. Oktober 2026. Dokumentationsprüfung, noch keine implementierte
Integration und kein Test mit Patriks Google-Projekt oder Mikrofon.

## Ergebnis

Gemini Live ist ein sinnvoller optionaler Gesprächsanbieter: Streaming-Sprache,
Unterbrechen und schnelle Rückmeldungen könnten die lokale STT → Agent → TTS-Kette
vereinfachen. Hermes sollte weiter Aufträge, Wissen, Gerätezuordnung und echte
Werkzeuge besitzen. Ein anderer Sprachdienst repariert weder falsche Desktop-
Koordinaten noch fehlende MCP-Verbindungen oder unklare Auftragsergebnisse.

Die [Live-Übersicht](https://ai.google.dev/gemini-api/docs/live-api) beschreibt
Audio-/Bild-/Texteingaben, Audioausgabe und Transkripte über WebSocket. Eingabe ist
PCM16 mit 16 kHz; Ausgabe PCM16 mit 24 kHz, passend zum vorhandenen Ausgabepfad.

## Kostenlos: für Tests ja, für unser öffentliches Produkt nicht voraussetzen

Die [Preisliste](https://ai.google.dev/gemini-api/docs/pricing) weist kostenlose
Ein- und Ausgabe für Gemini 3.8 Live und 3.1 Flash Live Preview aus. Das bedeutet
ein begrenztes API-Kontingent, keinen unbeschränkten Alltagsbetrieb. Die tatsächlichen
[Quoten](https://ai.google.dev/gemini-api/docs/rate-limits) sind pro Projekt in
AI Studio sichtbar, modellabhängig und nicht garantiert. Mehrere Schlüssel desselben
Projekts vervielfachen das Kontingent nicht.

Die [aktuellen Zusatzbedingungen](https://ai.google.dev/gemini-api/terms) verlangen
Paid Services, wenn API-Clients Nutzern im EWR, der Schweiz oder dem Vereinigten
Königreich bereitgestellt werden. Sie beschreiben den Dienst als Entwicklerangebot
für berufliche/geschäftliche Zwecke. Deshalb keine Zusage „kostenlos für alle“ im
Hermes-Voice-Setup. Direkte Experimente in AI Studio und ein veröffentlichtes
Sprachprodukt sind unterschiedliche Einsatzfälle. Keine kostenpflichtige
Anbindung wurde durch diese Recherche aktiviert.
Die Integration sollte die offizielle Live API verwenden. Eine fernbediente
AI-Studio-Webseite ist kein verlässlicher Dienstanschluss für unsere Clients.

Paid-Audio laut Preisliste: 0,005 USD pro Eingabeminute und 0,018 USD pro
Ausgabeminute. Eine Stunde Eingang plus zehn Minuten Antwort entspricht rechnerisch
0,48 USD für diese neuen Audiodaten. Das ist **keine Sitzungskostenprognose**:
Laut [Abrechnungshinweisen](https://ai.google.dev/gemini-api/docs/live-api/best-practices)
wird vorhandener Sitzungskontext je Zug erneut berechnet, Transkripte kommen hinzu.
Proaktives Hören zählt auch dann Eingabe, wenn Gemini nicht antwortet. Begrenzter
Kontext, lokale Aktivierung und eine nachvollziehbare Nutzungsanzeige sind nötig.

## Passendes Modell und Gesprächsfluss

[Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live)
ist derzeit Googles Standardempfehlung für schnelle Sprachagenten. Es unterstützt
asynchrone Werkzeugaufrufe: Während Hermes arbeitet, kann das Gespräch weitergehen.
Das ältere 3.1 Flash Live unterstützt laut Modellvergleich nur blockierende
Werkzeugaufrufe; das würde unser früheres Warteschlangenproblem begünstigen.
Die allgemeine Tool-Seite enthält noch ältere Vergleichstabellen; die aktuelle
Modellseite ist für diese Auswahl ausschlaggebend.

Extended Thinking ist für den ersten Versuch unnötig: Hermes übernimmt längere
Denkarbeit. Dessen [separates Live-Modell](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live-extended-thinking)
hat zusätzlich abweichende Leerlauf-/Hintergrundzustände. Ein bloßes turnComplete
bedeutet dort noch keinen fertigen Auftrag.

## Vorgeschlagene Einbindung

```text
Mikrofon → lokale Aktivierung/Datenschutz → Gemini Live → Audio/Orb
                                            ↕ feste Funktionen
                                    Hermes-Aufträge und Verlauf
                                            ↕
                                    MCP des ausgewählten Geräts
```

Gemini bekommt kleine geprüfte Funktionen: Auftrag an Hermes senden, tatsächlichen
Status lesen, Auftrag stoppen/ändern und Gespräch übergeben. Die bestehende Queue
führt IDs, Geräte, Freigaben und Ergebnisbelege. Gemini meldet „angenommen“ erst
nach Annahme und „erledigt“ erst nach bestätigtem Ergebnis. Ein Gespräch darf bei
laufender Recherche weitergehen; es startet nicht versehentlich dieselbe Aktion
erneut. Hermes-Antworten werden als Ergebnisdaten eingespielt, nicht als neue
Benutzerbefehle. UI-Karten und Orb-Zustände kommen aus echten App-Ereignissen.
Das ist ein Entwurf, keine bereits vorhandene Fähigkeit dieser Vorschau.
Native Audio erzeugt eigene Antworten und kann Hermes-Ergebnisse umformulieren;
für wortgetreues Vorlesen bleibt ein eigener TTS-Ausgabepfad sinnvoll. Angezeigte
Ergebnisdaten und bestätigte Aktionen dürfen dabei nicht umgedeutet werden.

[Function Calling](https://ai.google.dev/gemini-api/docs/live-api/tools) muss der
Client selbst ausführen und beantworten. Das Modell erhält dadurch keine automatische
Maus-, Browser- oder Root-Berechtigung. Beim Unterbrechen muss unsere Wiedergabe
sofort alte Audiopuffer leeren; ein bereits gestarteter Betriebssystemauftrag
wird dadurch nicht rückgängig. Die [VAD-Dokumentation](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
beschreibt die entsprechenden Unterbrechungs- und Aufrufabbruchereignisse.

## Grenzen und notwendige Prüfungen

- Cloud statt vollständig lokaler Sprache: übertragene Stimme, Bilder und
  ausgewählte Werkzeugergebnisse verlassen das Gerät. Kamera/Bildschirm nur auf
  ausdrückliche Auswahl senden. Tailscale schützt unsere eigene Verbindung,
  macht Googles Verarbeitung aber nicht lokal.
- Die Bedingungen enthalten eine wichtige EWR-Ausnahme: Dort gelten auch bei
  kostenloser Quote die Datenregeln der Paid Services. Deshalb nicht pauschal
  behaupten, alle deutschen Free-Tier-Inhalte würden zum Training verwendet.
  Paid-Daten werden laut Bedingungen nicht zur Produktverbesserung verwendet;
  begrenzte Missbrauchsprotokolle und internationale Verarbeitung bleiben möglich.
- [Sitzungsverwaltung](https://ai.google.dev/gemini-api/docs/live-api/session-management):
  ohne Kompression 15 Minuten Audio bzw. zwei Minuten Audio/Video; Verbindungen
  dauern ungefähr zehn Minuten. Resumption, Kompression und GoAway-Behandlung sind
  nötig. Hermes-Verlauf bleibt die dauerhafte Wahrheit, auch nach Gerätewechsel.
- Kontingent, Internet und Dienst können ausfallen. Lokaler Whisper/Piper-Weg und
  Textbetrieb bleiben auswählbar. Keine automatische Aktivierung eines Bezahlwegs.
- Für mobile Clients [kurzlebige Tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
  vom eigenen Backend statt eines gemeinsamen langlebigen Schlüssels im Client.
  Jeder Nutzer braucht eine eigene Anbindung; kein Entwicklerschlüssel im Installer.
- PC-Mikrofonauswahl, Echo, Discord-Nebengespräche und echtes Barge-in müssen am
  Gerät getestet werden. Googles „proaktiv“ ist keine zuverlässige Sprecheridentität.

## Empfohlener nächster Versuch

Abgeschalteter, auswählbarer Live-Anbieter neben lokalem Sprachbetrieb. Erst eine
kleine Teststrecke mit eigenem Google-Projekt: deutsch sprechen, Hermes-Auftrag
starten, währenddessen unterbrechen, Status korrekt wiedergeben, Quotenfehler und
Reconnect testen. Messen: erste hörbare Rückmeldung, Unterbrechungsdauer,
Transkriptqualität, doppelte Aufträge und Verbrauch. Erst nach diesem Vergleich
über einen Standardanbieter entscheiden. Noch kein Wechsel der laufenden App.
