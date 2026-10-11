# Arbeitsstart, Freizeit und eigene Abläufe

Einsatzmodi bündeln Apps, lokale Ordner und Webseiten. „Arbeitsplatz starten“
oder „Ich fange an zu arbeiten“ wählt Arbeit; „Ich möchte spielen“ oder
„Ich will zocken“ wählt Gaming; „Feierabend“ wählt Feierabend. Ein vorangestelltes
„Hermes, bitte …“ und ein abschließendes „…, bitte“ sind ebenfalls möglich.
Jeder Modus öffnet nur die zuvor gespeicherten Ziele. Die drei vorhandenen
Modi bleiben zunächst leer: Gaming und Feierabend schalten Sprachhinweise
leise, Arbeit schaltet sie hörbar. Kamera-Aus und Standby sind ausdrückliche
Optionen und bleiben standardmäßig aus.

Für den eigenen Alltag lassen sich die Namen und Ziele anpassen, etwa Arbeit
mit Editor, Projektordner und Projektseite oder Gaming mit Spieleplattform
und Spieleordner. Ein eigener gespeicherter Modus namens Fokus lässt sich
mit „Starte meinen Fokus“ oder „Aktiviere das Profil Fokus“ aufrufen.
Fragen, Verneinungen und zusätzliche Aktionen in derselben Äußerung lösen
keinen lokalen Moduswechsel aus. Mehrdeutige Modusnamen werden ebenfalls
nicht automatisch ausgewählt.

Ein Modus enthält bis zu acht Apps, acht Ordner und acht Webseiten. Ordner
werden als absolute lokale Windows-Pfade gespeichert, beispielsweise
`C:\Users\Patri\Documents\Projekte`. Laufwerkbuchstaben sind erforderlich;
relative Pfade, UNC-Freigaben, Gerätepfade, `..`, reservierte Windows-Namen
und Steuerzeichen werden abgewiesen. Ein abschließender Verzeichnistrenner
ist erlaubt. Das Öffnen eines Ordners verändert oder löscht keine Dateien.
Die Windows-Einbindung prüft vor dem Öffnen, ob das Ziel ein vorhandener
Ordner ist; Verknüpfungen beziehungsweise Junctions folgen dabei der
normalen Windows-Verzeichnisauflösung.

Webseiten benötigen eine vollständige HTTP- oder HTTPS-Adresse. Optional
kann ein Anzeigename hinterlegt werden. Lokale Entwicklungsseiten wie
`http://localhost:8080`, LAN-Dashboards, IP-Adressen und eigene Ports sind
erlaubt. Anmeldedaten innerhalb einer URL, Steuerzeichen und Protokolle wie
`file:`, `ftp:`, `data:` oder `javascript:` werden abgewiesen. Die App
übergibt diese ausdrücklich gespeicherten Ziele nur an den Nutzerbrowser;
sie ruft sie nicht über einen Server ab. Die Prüfung bestätigt weder die
Erreichbarkeit noch die aktuelle DNS-Auflösung. Normale Queryparameter
und Fragmente bleiben Teil des gespeicherten Ziels; für häufig genutzte
Seiten eignen sich dauerhafte Adressen ohne Anmelde- oder Freigabetoken.

```json
{
  "id": "work",
  "name": "Arbeit",
  "apps": ["C:\\Programme\\Editor\\Editor.exe"],
  "folders": ["C:\\Users\\Patri\\Documents\\Projekte"],
  "sites": [
    { "name": "Projekt", "url": "https://github.com/example/project" }
  ],
  "instructions": "Prüfe, ob der Editor das Arbeitsprojekt zeigt.",
  "quiet": false,
  "cameraOff": false,
  "standby": false
}
```

Für gespeicherte mehrteilige Aufgaben gibt es weiterhin Abläufe mit einem
eindeutigen Namen, Schritten und Erfolgskriterien. „Starte meinen Ablauf
Arbeitsstart“, „Starte den Ablauf Arbeitsstart“ oder „Führe meinen Ablauf
Arbeitsstart aus“ übergibt genau diesen Ablauf an die bereits ausgewählte
Hermes-Session. Die Namen werden vollständig verglichen: Arbeit wählt keinen
Ablauf namens Arbeitsstart. Es entsteht keine zusätzliche Agenten-Session
und keine zusätzliche Cloud-API. Die Grenzen und Auftragsnachweise beschreibt
[routines.md](routines.md).

Ein angenommener Windows-Start ist noch kein Beleg für ein geöffnetes,
bereites Fenster. `runMode` prüft alle Ziele und benötigten Aktionen vor
dem ersten Zustandswechsel. Es startet Apps, Ordner und Webseiten der Reihe
nach und liefert für jedes Ziel Annahme oder Fehler. Für Ordner und Webseiten
bleibt `verified: false`; `ok` bedeutet ausschließlich, dass sämtliche
Startanforderungen angenommen wurden. Ein einzelner Fehler setzt `ok: false`,
auch wenn weitere Ziele erfolgreich angefordert wurden. Hermes-Schritte und
Standby folgen dem bestehenden Modusablauf; ihre Wirkung wird dadurch nicht
als ausgeführt oder verifiziert behauptet.

„Stopp“, „Bitte stoppe“, „Hör auf“ oder „Brich den aktuellen Auftrag ab“
beenden die aktuelle Antwort beziehungsweise den aktuellen Auftrag über
den lokalen Abbruchweg. Noch nicht gesendete Aufträge werden verworfen; Live,
Wakewords und Kamera bleiben eingestellt. Eine neue ausdrückliche Anfrage
setzt die Warteschlange fort, sofern keine unbekannte externe Wirkung blockiert.
Bereits gestartete externe Arbeit wird nur nach tatsächlicher Bestätigung als
beendet behandelt. Sie aktivieren keine Datenschutzsperre. „Not-Aus“
bleibt die ausdrückliche Notfallaktion mit Datenschutzsperre. Ein Befehl wie
„Stoppe Spotify“ wird nicht als allgemeiner Abbruch behandelt.

Die normalen Prüfungen öffnen keine Benutzerprogramme und keine Webseiten:
`node --test tests/modes.test.cjs tests/routines.test.cjs` nutzt die realen
Parser und Validierungen mit kontrollierten Windows-Aufrufantworten.
