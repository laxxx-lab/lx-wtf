# Hermes Voice installieren und wiederherstellen

Die Version 0.2.0-preview.1 ist eine installierbare Desktop-Vorschau. Sie verbindet
sich mit deinem vorhandenen Hermes, bringt aber keinen Ersatzagenten mit.
Erforderlich ist ein Hermes-Gateway mit der Dashboard-/WebSocket-API dieses
Clients (`/api/auth/ws-ticket`, `/api/ws`, Sessions und Prompt-RPC). Eine reine
Hermes-CLI ohne diese API wird durch Eingabe einer URL nicht automatisch kompatibel.
Das Setup installiert keinen VPS, kein Modellkonto und keine privaten MCP-Schlüssel.
Die eigene Projektlizenz ist noch nicht festgelegt; sie wird nicht stillschweigend
auf MIT oder GPL gesetzt. Die bestehenden Drittanbieter-Lizenzen bleiben erhalten.

## Auswahl im Setup

1. Assistentenname und eigene Gateway-Adresse eintragen. Der Name ist die
   Anzeigeidentität; ein eigener Name trainiert kein neues Aktivierungswort.
2. Spracherkennung separat auswählen: Textmodus, Whisper Base oder Small auf CPU,
   oder eine bereits eingerichtete native Laufzeit.
3. Sprachausgabe separat auswählen: keine Stimme, Piper Thorsten (Deutsch),
   Piper Lessac (Englisch), oder vorhandene native Stimme.
4. Ausgewählte Sprachpakete und Modelle werden installiert und geprüft. Bei
   einem Fehler bleibt das Setup offen und kann erneut ausgeführt werden.
5. Im Client am **eigenen Hermes** anmelden und eine Session wählen. Zugangsdaten
   gehören ausschließlich ins Anmeldefenster, nicht in Setup-Dateien oder Skripte.

Kamera, Aktivierungswort, automatisches Mikrofon und Systembeobachtung sind bei
Neuinstallationen aus. Sprechen wird ausdrücklich im Client gestartet. Die
ausgewählten Sprachmodelle rechnen lokal; Aufträge und Texte gehen an deinen
Gateway und dessen vorhandene Modellanbindung. Lokale PC-Steuerung benötigt
weiterhin die passende, gesondert eingerichtete Windows-/Linux-MCP-Verbindung;
die Anmeldung am Gateway vergibt keine pauschalen System- oder Adminrechte.

## Windows

`Hermes-Voice-0.2.0-preview.1-win-x64.exe` aus der Veröffentlichung herunterladen
und starten. Das Setup installiert für deinen Benutzer und erstellt eine
Desktopverknüpfung. Electron ist enthalten; Node.js oder Hermes Desktop werden
für dieses Installationspaket nicht separat benötigt. Python 3.12 wird über
Windows' vorhandenes winget nur dann eingerichtet, wenn gewählte Sprachkomponenten
es brauchen. Ohne winget Python 3.10–3.12 installieren und im Setup erneut versuchen.

Die Vorschau ist nicht mit einem Herausgeberzertifikat signiert. Es werden keine
Windows-Sicherheitsoptionen oder Treiber verändert. Vor Start kann die Datei mit
der veröffentlichten SHA256SUMS abgeglichen werden:

```powershell
Get-FileHash .\Hermes-Voice-0.2.0-preview.1-win-x64.exe -Algorithm SHA256
```

Für Quellinstallation im geklonten Repository:

```powershell
.\scripts\install-windows.ps1 -InstallNode -InstallPython
.\launch.ps1
```

`-Autostart` ist optional, `-DryRun` zeigt den Ablauf ohne Änderungen.
`launch.ps1 -Setup` öffnet den Assistenten erneut. Bestehende Installationen
behalten ihre Sitzung und persönlichen Dateien.

## Zorin / Ubuntu / Debian

Linux x64: AppImage und `install-linux.sh` aus derselben Veröffentlichung lokal
speichern. Das Skript vor Ausführung ansehen. Kein Download wird in eine Shell
gepiped. Auf dem angemeldeten Desktop:

```bash
bash install-linux.sh --appimage "$HOME/Downloads/Hermes-Voice-0.2.0-preview.1-linux-x64.AppImage" --install-system
```

`--install-system` richtet ausdrücklich ausgewählte Debian-Systemvoraussetzungen
für Python/venv und die Oberfläche über apt/sudo ein. Es installiert keine GPU-
Treiber. Ohne diese Option verändert das Skript keine Systempakete. Die AppImage
braucht kein Node.js. Der Benutzerstarter erscheint im Anwendungsmenü; von dort
kann er an die Taskleiste angeheftet werden. `--autostart` ist optional.

Alternativ löst das deb-Paket Abhängigkeiten über apt auf:

```bash
bash install-linux.sh --deb "$HOME/Downloads/Hermes-Voice-0.2.0-preview.1-linux-x64.deb" --install-python
```

Für einen verifizierten Download kann `--release-url` die konkrete HTTPS-Adresse
der AppImage übernehmen; die daneben veröffentlichte SHA256SUMS ist verpflichtend.
`--dry-run` zeigt die beabsichtigte Installation ohne Downloads oder Änderungen.

Quellinstallation benötigt Node.js ab 22.12:

```bash
bash scripts/install-linux.sh --source "$PWD" --install-python
bash launch-linux.sh
```

Ein Script kann nach der Installation auch die Auswahl setzen:

```bash
"$HOME/.local/share/hermes-voice/HermesVoice.AppImage" --configure \
  --gateway https://dein-hermes.example --assistant-name Athena \
  --stt base --tts de_DE-thorsten-medium --language de
```

Das benötigt eine Desktopumgebung; es ist kein headless VPS-Agent. Ohne `--stt`
und `--tts` wählt `--configure` Textbetrieb. Geheimnisse werden nicht als
Kommandozeilenparameter angenommen. Die normale Anmeldung folgt im Client.

## macOS und weitere Geräte

Die native Build-Pipeline erzeugt DMG/ZIP für Apple Silicon. Der gemeinsame Client
enthält Gespräch, Orb, Browser und den portablen Sprachweg, soweit passende
Python-Wheels verfügbar sind. Desktopsteuerung und Geräteübergabe werden hier
nicht als Linux-Notebook ausgegeben. Die macOS-Vorschau ist noch nicht notarisiert
oder an echter Mac-Hardware geprüft. Intel-Mac, Linux ARM und Android haben in
dieser Version noch keine veröffentlichten, verifizierten Installationspakete.

## Daten, Updates und Neuaufsetzen

App-Dateien und persönliche Daten sind getrennt. Installierte Programmupdates
kopieren nur öffentliche Programmdateien. Sie ersetzen keine Sessions,
Sprecherreferenzen, Modelle, Cookies oder lokalen Einstellungen.

| System | Persönlicher Arbeitsordner |
|---|---|
| Windows | `%LOCALAPPDATA%\Hermes Voice\workspace` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/hermes-voice/workspace` |
| macOS | `~/Library/Application Support/Hermes Voice/workspace` |

Quellinstallationen behalten Daten im vorhandenen Projektordner. `HERMES_VOICE_HOME`
kann einen ausdrücklich gewählten absoluten Arbeitsordner setzen. Hier liegen
unter `.local/` Einstellungen und Verbindungen, unter `runtime/` die optionalen
Sprachmodelle und unter `voices/` eigene Stimmen. Für eine Wiederherstellung
diesen Arbeitsordner bei geschlossener App privat sichern, nach der Installation
am selben Ort zurückspielen und anmelden. Browseranmeldungen können nach einem
Systemwechsel erneut erforderlich sein. Das ist kein öffentliches Exportpaket.

Sprachkomponenten lassen sich mit `--setup` erneut auswählen. Eigenständige
Modellartefakte werden über SHA-256-Belege geprüft; beschädigte Dateien werden
nicht still überschrieben. Die Fehlermeldung benennt die aufzubewahrende Datei.
Ein abgebrochener Download markiert die Installation nicht als bereit.

## Abhängigkeiten und Nachweise

Whisper: [faster-whisper](https://github.com/SYSTRAN/faster-whisper),
Sprachausgabe: [Piper](https://github.com/OHF-Voice/piper1-gpl),
Pakete: [electron-builder](https://www.electron.build/).
Ausgewählte Modelle sind auf bestimmte Revisionen festgelegt. Modellkarten,
Quellen und die jeweiligen Drittanbieter-Lizenzen bleiben unter
`runtime/public/licenses/` erhalten. Für Piper-Stimmen gelten die jeweiligen
Modellkarten; die Produktlizenz ersetzt diese nicht.
Die im Desktop-Paket enthaltenen MediaPipe-Dateien behalten ihre Hinweise;
`assets/licenses/mediapipe-Apache-2.0.txt` enthält die zugehörige
[Upstream-Lizenz](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).
Der Paketbau prüft die Datei-Prüfsummen nach Electron-Bereinigung erneut.

Geprüft wurden ein nativer Windows-Setup-Build, ein isolierter Electron-Erststart
mit eigenem Namen/Textbetrieb und ausgeschalteten Sensoren sowie echte lokale
Piper-Synthese mit anschließender Whisper-Transkription. Das prüft weder das
physische Mikrofon noch den Höreindruck oder alle Betriebssysteme. Linux/macOS-
Installationspakete werden jeweils auf den nativen CI-Systemen gebaut; ihre
tatsächlichen Build-Ergebnisse sind separat in GitHub Actions sichtbar.
