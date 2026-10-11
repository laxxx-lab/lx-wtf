# Abläufe und ehrliche Auftragshistorie

Ein Ablauf besteht aus einer festen ID, einem Namen, vom Nutzer gespeicherten
Schritten und ausdrücklichen Erfolgskriterien. Die App liefert keinen
voreingestellten Ablauf und startet nichts automatisch. Bis zu 20 Abläufe
mit eindeutigen Namen sind möglich; ungültige, leere oder zu lange Einträge
werden abgewiesen statt unbemerkt gekürzt.

Beispiel:

```json
{
  "id": "arbeitsstart",
  "name": "Arbeitsstart",
  "instructions": "Öffne den Editor und mein Arbeitsprojekt.",
  "verification": "Der Editor ist geöffnet und zeigt das gewünschte Projekt."
}
```

„Starte den Ablauf Arbeitsstart“ oder „Führe den Ablauf Arbeitsstart aus“
aktiviert ausschließlich einen vollständig passenden gespeicherten Ablauf.
Fragen, Verneinungen und zusätzliche Aufträge werden nicht lokal als
Ablaufstart interpretiert. Hermes bekommt die Schritte und Erfolgskriterien
als begrenzte Daten sowie die Vorgabe, APIs und UI Automation zu bevorzugen,
die Wirkung frisch zu prüfen und pro gescheitertem Schritt höchstens zwei
gezielte Versuche auszuführen. Ein angenommener Befehl ist kein Erfolgsbeleg.
Diese Vorgaben sind Agentenanweisungen, keine lokale technische Garantie
für eine bestimmte Werkzeugwahl oder Wiederholungszahl.

Die Funktion ist kein Aufzeichnungs- oder Teach Mode: Sie zeichnet weder
Mausklicks auf noch führt sie selbst Shellbefehle oder geplante Aufgaben aus.
Schritte werden nach einem ausdrücklichen Start an die bestehende
Hermes-Session übergeben. Anmeldung und bestehende Freigaben bleiben
Voraussetzung für geschützte Handlungen.

`TaskLedger` hält höchstens 50 Aufträge im Arbeitsspeicher, davon einen
laufenden. Ein zweiter gleichzeitiger Auftrag wird abgewiesen. Die Historie
unterscheidet `running`, `agent-finished`, `error`, `interrupted` und
`disconnected`. Ein Agentenabschluss oder eine Behauptung wie „Erledigt“
ist ausdrücklich keine verifizierte Erfüllung des Nutzerauftrags.

`verification: "verified"` und `evidence.scope: "tool"` bedeuten allein
**Werkzeugwirkung bestätigt**. Aktuell wird ausschließlich eine explizite
boolesche `playback_verified: true` aus dem bekannten Spotify-Werkzeug
anerkannt: als strukturierte Rückgabe oder JSON in einem MCP-Textblock.
HTTP 204, `success: true`, generische `verified`-Felder, Webseiteninhalte
und natürlichsprachliche Behauptungen zählen nicht. Eine spätere explizite
fehlgeschlagene Wiedergabeprüfung zieht die frühere Wiedergabe-Evidenz
zurück. Eine bestätigte Wiedergabe beweist nicht die Erfüllung weiterer
Schritte eines mehrteiligen Auftrags und bleibt auch bei einem späteren
Abbruch lediglich eine beobachtete Teilwirkung.

Rohargumente, Bilder und vollständige Werkzeugantworten werden nicht im
Ledger gespeichert. Titel und Abschlussmeldungen sind begrenzt; verbreitete
Zugangsdatenfelder und Bearerwerte werden geschwärzt. URL-Anmeldedaten,
Queryparameter und Fragmente werden entfernt. Das ist eine zusätzliche
Datenminimierung, keine vollständige Erkennung beliebiger privater Inhalte.
Das Ledger selbst schreibt keine Datei und stellt nach einem Neustart
keine unterbrochenen Aufträge automatisch wieder her.

Prüfung: `node --test tests/task-ledger.test.cjs tests/routines.test.cjs`
