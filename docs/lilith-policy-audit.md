# Lilith: Verhalten und Sprachausgabe

Prüfung und Anpassung am 09.10.2026 auf ausdrücklichen Nutzerwunsch. Untersucht wurden die tatsächlichen Dateien des Gateway-Profils `default`, nicht nur die lokalen Windows-Kopien.

## Befund

- `SOUL.md` verlangte kurze Antworten, aber gleichzeitig Belege und Grenzen in jeder Antwort. Es fehlte eine klare Trennung zwischen knapper Sprachausgabe und technischen Textberichten.
- `/srv/example/.hermes/AGENTS.md` enthielt hauptsächlich B2B-, Team-, Telegram- und Hostregeln, ohne konkreten PC-/Spotify-Ablauf. Die aktuelle Session hatte Arbeitsverzeichnis `/`; ihr tatsächlicher Kontextbericht listete nur `SOUL.md` als geladen. Die AGENTS-Datei im Hermes-Home war dort nicht automatisch im Projektkontext geladen.
- Die Voice-App behandelte nur erkennbare Handlungsverben als kurze Antwortfälle. Rückfragen und Einwände aus dem Beispiel wurden deshalb als längere Gespräche mit gesprochenen Zwischenberichten behandelt.
- Aus dem Gespräch lässt sich eine fehlende Zustandsprüfung erkennen. Die Ursache des Spotify-Problems selbst wurde hier nicht live untersucht. Ein angenommener Play-Befehl, eine Geräte- oder Fensterliste allein belegen keinen bestimmten Liedwechsel und keine fehlenden Schreibrechte.

## Änderungen

Die global geladene SOUL-Datei trägt jetzt klare Regeln für kurze Voice-Antworten, Ausführung bereits erlaubter Routineaktionen und aktuelle Ergebnisprüfung. Für genaue Host-/Teamabläufe verweist sie ausdrücklich auf die AGENTS-Datei. Der PC-/Spotify-Ablauf wurde vor die bisherigen Teamregeln in AGENTS eingefügt; deren Inhalte sowie Freigabe-, Projekt-, Gateway-Neustart- und Zugangsdatenregeln bleiben erhalten.

Spotify: gewünschte URI/Titel/Künstler bestimmen, das tatsächlich angesprochene Gerät prüfen, bei Bedarf Spotify über die Windows-Anbindung selbst öffnen, starten und aktuellen Wiedergabezustand mit dem Auftrag vergleichen. Ein unverändertes Ergebnis führt zu Diagnose und geeignetem Ersatzweg, nicht zu einer erfundenen Erfolgsmeldung. Details wie Fehlermeldung/Scope/Premium nur aus tatsächlichen Antworten ableiten.

Voice: standardmäßig ein bis zwei kurze abschließende Sätze, auch bei Einwänden oder Problemen. Zwischenberichte werden dabei nicht vorgelesen. Explizite Erklärungswünsche dürfen ausführlich sein; „erkläre kurz“ bleibt kurz, „nicht kurz, sondern ausführlich“ wird berücksichtigt. Telegram bekommt keine globale kurze Sprachpräferenz.

## Sicherung und Prüfung

Vor dem Schreiben wurden beide Remote-Dateien erneut mit den gelesenen Originalen verglichen. Originale sind lokal im ignorierten `.local/agent-audit/` und auf dem VPS neben den Dateien als datierte Backups gespeichert. Nach dem Schreiben wurden beide Dateien vollständig zurückgelesen und ihre Inhalte mit den vorbereiteten Fassungen verglichen. Der vorherige Kontextbericht und die Hashnachweise liegen in `.local/agent-audit/applied.json`.

155 Tests bestanden nach der Voice-Anpassung. Die neue Agentenantwort selbst wurde nicht durch einen zusätzlichen Hermes-Chat-Auftrag getestet. Für einen sauberen Praxistest eine neue Session verwenden, damit die alten widersprüchlichen Spotify-Aussagen den Gesprächskontext nicht weiter prägen.
