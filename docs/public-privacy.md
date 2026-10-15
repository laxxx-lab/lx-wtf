# Öffentliche Daten und Geheimnisse

Öffentliche Quellen enthalten keine persönlichen Benutzernamen, Heimverzeichnisse,
Hostnamen, echten Serveradressen, Zugangsdaten oder privaten Einsatzprotokolle.
Beispiele verwenden projekt-relative Befehle, Umgebungsvariablen und reservierte
Dokumentationsdomains/-adressen. Loopback, öffentliche Softwarequellen und
synthetische Netzwerktests sind keine persönlichen Verbindungsdaten.

Persönliche Konfiguration liegt in den ignorierten Verzeichnissen `.local/`,
`runtime/` und `voices/` beziehungsweise in der lokalen Umgebung. `.env`-Dateien,
Cookies, Tokens, Referenzstimmen, Fotos, Aufnahmen, Diagnoselogs und Sicherungen
werden nicht versioniert oder in Installer übernommen. Zugangsdaten gehören in
die jeweiligen Anmeldefenster und lokale Token-Dateien, nicht in Befehlsbeispiele.

Eine frei gewählte Anzeigeidentität erfordert keinen fest eingebauten
Personennamen. Gerätenamen und Verbindungen werden lokal ermittelt oder gewählt.
Artcraft-Pfade können über `HERMES_VOICE_ARTCRAFT_ROOT` angegeben werden.

Vor Veröffentlichung:

```powershell
node --test tests/public-privacy.test.cjs
gitleaks git . --log-opts=--all --redact
git diff --check
```

Der Secret-Scanner läuft lokal und gibt gefundene Geheimnisse nur redigiert aus.
Die einzige projektspezifische Ausnahme sind bekannte SHA-256-Modellprüfsummen,
keine Tokens. Die Paket-Allowlist und nachgelagerte Dateiprüfung schließen private
Laufzeitverzeichnisse aus.

Dateien zu bereinigen entfernt keine Daten aus älteren Commits, Tags,
Commit-Autoren, Releases, CI-Logs, Forks oder fremden Klonen. Eine vorbereitete
Historienbereinigung muss separat angewendet werden. Tatsächlich veröffentlichte
Zugangsdaten müssen zusätzlich beim Anbieter widerrufen oder erneuert werden.
