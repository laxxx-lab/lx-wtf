# Automatisches Thinking

Der Windows-Client wählt die Rechentiefe vor jedem an Hermes gesendeten Auftrag.
Alltagssteuerung und kurze Gespräche verwenden `none`. Analyse, Fehlersuche,
Planung, Vergleiche, längere/mehrteilige Aufträge und riskante Datei-/Systemänderungen
verwenden `medium`. „Denke gründlich nach“ verwendet `high`. Eine kurze Fortsetzung
wie „weiter“ behält die Stufe des vorherigen anspruchsvollen Auftrags. Explizit
„ohne Thinking“ setzt `none`. Direkte lokale Windows-Befehle brauchen kein LLM.

Die Auswahl in `automatic-thinking.cjs` ist eine lokale deutsche Intent-Heuristik,
kein zusätzlicher Modellaufruf und kein perfekter Schwierigkeitsklassifikator.
Sie liest die angezeigte Nutzerfrage statt ergänzter Systemhinweise oder Bildtexte.
Bei neuen Fehlklassifikationen die tatsächliche Formulierung als Regression ergänzen.
Es wird kein zweiter Agent und keine neue Session erzeugt.

`Conversation.submit` liest `config.get` mit `key:reasoning` für die ausgewählte
Runtime-Session und das gewählte Profil. Nur wenn nötig setzt es `config.set`
mit `scope:session` und prüft die Einstellung erneut, bevor `prompt.submit` erfolgt.
Ein Stopp, Datenschutz oder eine geänderte Verbindung während dieser Vorbereitung
verhindert das spätere Senden. Nicht gesendete Aufträge werden als Fehler beendet,
statt eine unklare Ausführung vorzutäuschen.

Nach dem bestätigten Abschluss/Fehler stellt der Client die vorherige Stufe wieder
her. Bis zum Abschluss der Rückstellung startet kein nächster lokaler Auftrag.
Eine zwischenzeitliche manuelle Thinking-Änderung wird erhalten. Die globale
Hermes-Konfiguration und andere Sessions werden nicht geändert; diese Umschaltung
ist aber eine Einstellung dieser Runtime-Session, kein vom Gateway atomar isolierter
Per-Prompt-Parameter. Während der Vorbereitung keine zweite Oberfläche gleichzeitig
in derselben Runtime-Session bedienen.

Ein unbestätigtes Senden wird niemals automatisch wiederholt. Bei unterbrochener
Verbindung wartet die Auftragswarteschlange weiterhin auf Ergebnisprüfung; eine
offene Rückstellung wird vor dem nächsten Auftrag geprüft. `status.reasoning`
meldet `mode`, `phase`, `requested`, `effective`, `reason` und gegebenenfalls `error`.
`effective` ist die vom Gateway bestätigte Einstellung, kein Beweis der internen
Tokenverwendung des Providers. Es wird nicht lediglich die Gedankenanzeige versteckt.

Thinking steuert das Hauptmodell. Mikrofon, STT, TTS und lokale Qwen-VL-Bildanalyse
bleiben unverändert. Der Gateway/Provider muss die Einstellung unterstützen; Modelle
mit verpflichtendem Thinking können sie ablehnen oder auf ihre Vorgabe zurückfallen.
Es gibt kein allgemeines Latenzversprechen.

Prüfen: `node --test tests/automatic-thinking.test.cjs tests/conversation.test.cjs
tests/camera-control-main.test.cjs`, danach `npm.cmd test`. Echte Gateway-Tests müssen
Auswahl, Readback, Antwort und Rückstellung in derselben vorhandenen Session prüfen.
