# Hermes als Windows-Sprachassistent

Design vom 9. Oktober 2026. Vom Nutzer freigegeben; Umsetzung begonnen.

## Ziel

Ein Windows-Assistent läuft im Hintergrund, nimmt gesprochene Aufträge an,
antwortet mit einer hochwertigen deutschen Frauenstimme und lässt die bestehende
Hermes-Instanz auf dem VPS die Arbeit erledigen. Windows-MCP bleibt der Zugang
zur Windows-Steuerung. Die neue Sprachschicht verursacht keine API- oder
Abonnementgebühren; bestehende Kosten für Hermes, VPS und Strom bleiben.

## Vorhandene Grundlage

- Der Nutzer arbeitet bislang über Telegram mit Hermes auf einem VPS.
- Laut Nutzer erreicht der VPS den vorhandenen Windows-MCP bereits über eine
  private Verbindung oder einen Tunnel.
- Auf diesem PC ist Hermes Desktop installiert. Eine Remote-Verbindung zu
  `http://lilith.lx.local` ist gespeichert. Erreichbarkeit, Authentifizierung und
  serverseitige Version wurden noch nicht geprüft.
- Der lokale Desktop-Quellcode enthält den Betrieb im Infobereich, ein
  schwebendes HUD, transparente Overlay-Fenster und Sprachfunktionen.
- Dieser PC hat eine Radeon RX 7900 XTX, einen Ryzen 7 5800X3D und ungefähr
  96 GB RAM. Ein nutzbarer GPU-Sprachruntime wurde noch nicht nachgewiesen.

## Empfohlener Ansatz

Hermes Desktop als vorhandenen Client wiederverwenden. Die lokale Sprachschicht
und eine kleine Overlay-Anzeige ergänzen. Vorzugsweise die dokumentierte
Desktop-Plugin-Schnittstelle verwenden; erst nach Prüfung ihrer Möglichkeiten
gezielte Änderungen am Desktop erwägen. Keine zweite Agenteninstanz für die
eigentliche Arbeit und kein vollständiger Nachbau des Chatclients.

Alternative: eine eigenständige Windows-Tray-App mit Hermes-Gateway-Anbindung.
Das ermöglicht eine unabhängige Oberfläche, benötigt aber zusätzliche Pflege für
Anmeldung, Sitzungen, Streaming und Werkzeugfreigaben. Diese Alternative nur
wählen, wenn der Desktop die benötigte Integration nicht sinnvoll zulässt.

## Sprachfluss und Sitzung

Lokales Mikrofon -> lokale Spracherkennung -> ausgewählte Hermes-Session auf dem
VPS -> Textantwort -> lokale Sprachsynthese -> Lautsprecher.

Die App bindet sich an eine ausdrücklich ausgewählte Session. Der bisherige
Telegram-Verlauf darf nicht stillschweigend durch einen neuen Chat ersetzt
werden. Zuerst prüfen, ob der Gateway die Telegram-Session direkt fortsetzen
kann. Andernfalls den Übergang mit nachvollziehbarer Übernahme des relevanten
Kontexts lösen und im Client kenntlich machen. Gemeinsame Memory allein ist
kein Ersatz für denselben Gesprächsverlauf.

Sprachaufträge derselben Session werden geordnet verarbeitet. Bei einer
Unterbrechung wird Audio sofort gestoppt; laufende Werkzeugaktionen werden
getrennt behandelt. Eine bereits gestartete Dateiverschiebung darf beispielsweise
nicht allein durch das Stoppen des Lautsprechers halb abgebrochen werden.

## Stimme und Aktivierung

Erster Qualitätskandidat ist Qwen3-TTS; OmniVoice dient als Vergleichskandidat.
Die Auswahl fällt erst nach lokalen Hörproben und Laufzeitmessungen. Geprüft
werden natürliche deutsche Aussprache, gleichbleibende Stimmfarbe über längere
Antworten, Zahlen und Namen, Betonung sowie Flüstern und kraftvolle Sprechweise.
Ein Modell wird nicht allein wegen eines gelungenen kurzen Beispiels gewählt.

Stimmrichtung: erwachsene Frau, warm und etwas dunkel, souverän, präzise,
leicht rauchig, mit trockenem Humor. Drei Varianten mit derselben Testpassage
vergleichen: souverän/präzise, samtig/kraftvoll, warm/frech.

Im ersten Schritt Aktivierung über einen globalen Hotkey und den Orb. Danach
eine lokal erkannte Aktivierungsphrase ergänzen. Während eines aktiven Gesprächs
sind automatische Spracherkennung und Unterbrechungen vorgesehen. Die konkrete
Phrase wird nach einem Erkennungstest festgelegt; eine beliebige deutsche Phrase
ist bei vorhandenen Wake-Modellen nicht automatisch unterstützt.

## Anzeige und Hintergrundbetrieb

Verschiebbarer, transparenter Orb am Bildschirmrand, ungefähr 120-160 Pixel.
Das vorhandene Overlay-Verhalten dient als Ausgangspunkt: keine zusätzliche
Taskleistenkachel und kein verdecktes Abfangen von Klicks außerhalb des Orbs.

Zustände: bereit, hört zu, denkt, spricht, führt aus, benötigt Freigabe und
Verbindungsfehler. Der Orb reagiert beim Zuhören auf den Mikrofonpegel und beim
Sprechen auf das ausgegebene Audiosignal. Denk- und Arbeitsanimationen zeigen
den tatsächlichen Sitzungsstatus. Optional erweitert ein Klick die Anzeige um
eine kurze Erklärung der aktuellen Aktion und den Zugang zum Chat.

Optik: dunkler Hintergrund, türkis-blaue Partikel und feine Lichtverbindungen,
als räumlich wirkendes neuronales Gebilde. Die Anzeige bleibt im Alltag klein;
eine größere Detailansicht kann später hinzukommen.

Windows-Autostart ist eine bewusst aktivierte Einstellung. Das Schließen des
Hauptfensters lässt den Assistenten im Infobereich weiterlaufen. Das Menü bietet
Mikrofon aus, Gespräch beenden, Chat öffnen und App vollständig beenden.

## Windows-Fähigkeiten

Bestehenden Windows-MCP wiederverwenden. Erste überprüfbare Aufgaben:

1. Spotify öffnen, einen gewünschten Titel suchen und die Wiedergabe prüfen.
2. Speicherplatz und Systemauslastung abfragen und verständlich zusammenfassen.
3. Einen ausgewählten Ordner oder Laufwerk C: analysieren und konkrete
   Aufräumkandidaten mit Pfaden und Größen vorschlagen.

Bei Aufräumarbeiten zuerst analysieren. Vor Löschungen eine konkrete Auswahl
zur Freigabe zeigen; wenn geeignet in den Papierkorb verschieben. Der Assistent
bestätigt Erfolge erst nach einer Zustandsprüfung. Ein verbal erteilter Auftrag
ist kein Nachweis, dass Spotify spielt oder dass Dateien entfernt wurden.

Proaktive Hinweise und Systemüberwachung gehören ausdrücklich zum freigegebenen
Umfang. Konkrete Ereignisse sind knapp werdender Speicher, dauerhaft hohe CPU-
oder RAM-Auslastung, verlorene Verbindungen und abgeschlossene Aufgaben. Sie sind
einstellbar und erfordern keine ständigen Modellabfragen bei unverändertem Zustand.
Mehrere aufeinanderfolgende Messungen bestätigen kurzlebige Belastungen;
unveränderte Warnungen werden nicht wiederholt. Erholung wird einmal gemeldet.

## Umsetzung in überprüfbaren Schritten

1. Lokale Stimmproben und Laufzeitmessung. GPU-Unterstützung, Ausdruck und
   konsistente deutsche Aussprache auf diesem PC nachweisen.
2. Hermes-Remote-Verbindung und Session-Übernahme prüfen. Einen gesprochenen
   Auftrag an die gewünschte Session senden und die Antwort lokal ausgeben.
3. Hintergrundbetrieb, Hotkey und Orb integrieren. Audiopegel, Status und
   Unterbrechungen an echten Ereignissen testen.
4. Die drei Windows-Aufgaben end-to-end testen, danach Aktivierungsphrase und
   ausgewählte proaktive Hinweise ergänzen.

Vor jedem Schritt bleiben die vorhandene Telegram-Nutzung und die benötigten
Konfigurationen verfügbar. Änderungen an Konfigurationen werden gesichert.

## Grenzen des aktuellen Nachweises

Die lokale Stimme, Streaming-Latenz, deutsche Transkription, alle fünf
Aktivierungsvarianten und die Windows-Oberfläche wurden technisch geprüft;
Messungen stehen in `docs/voice-runtime.md`. Stimmqualität im Hörtest und das
vollständige Gesprächsgefühl sind noch nicht bestätigt. Die authentifizierte
Fortsetzung der Telegram-Session braucht die Gateway-Anmeldung.

## Implementierungsentscheidung

Die Desktop-Plugin-Schnittstelle stellt keine native Tür für ein unabhängiges
transparentes Fenster und lokale Sprachprozesse bereit. Daher wurde die bereits
beschriebene Alternative umgesetzt: ein eigenständiger kleiner Electron-Begleiter
mit der vorhandenen Desktop-Laufzeit und den tatsächlichen Hermes-Gateway-RPCs.
Das vermeidet Änderungen an der installierten Hermes-App und ersetzt den
VPS-Agenten nicht. „Hey Hermes“, „Hey Lilith“, „Hey Lillis“, „Lilith“ und „Lillis“
sind umgesetzt; die kurzen Namen sind getrennt einstellbar. Proaktive Überwachung
gehört zur ersten Version. Temperaturen und separate MCP-Probes bleiben offen.

## Quellen

- https://github.com/QwenLM/Qwen3-TTS
- https://github.com/k2-fsa/OmniVoice
- https://hermes-agent.nousresearch.com/docs/user-guide/desktop
- https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode
- https://hermes-agent.nousresearch.com/docs/user-guide/features/wake-word
- https://github.com/CursorTouch/Windows-MCP
