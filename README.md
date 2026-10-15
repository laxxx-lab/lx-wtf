# Hermes Voice

Desktop-Sprachclient für den eigenen kompatiblen Hermes-Gateway. Assistentenname,
Gateway und lokale Sprachkomponenten werden beim ersten Start gewählt. Persönliche
Dateien, Verbindungen und Zugangsdaten gehören ausschließlich in die lokale
Konfiguration und sind nicht Bestandteil des Repositorys oder Installers.

[Installationsanleitung](docs/install.md) ·
[Downloads](https://github.com/laxxx-lab/lx-wtf/releases) ·
[Gemini-Live-Recherche](docs/gemini-live-evaluation.md)

## Installation

- Windows x64: Setup mit gebündeltem Electron und Desktopverknüpfung.
- Zorin/Ubuntu/Debian x64: AppImage oder deb sowie `install-linux.sh` mit optionalen
  Systemvoraussetzungen, Anwendungsstarter und Autostart.
- macOS Apple Silicon: experimentelles DMG/ZIP; Desktopsteuerung und Geräteübergabe
  werden dort nicht als unterstützt ausgegeben.
- Android, Linux ARM und Intel Mac sind noch nicht als Installationsziel enthalten.

Whisper und Piper sind unabhängig auswählbar; Textbetrieb braucht keine
Sprachmodelle. Native optimierte Laufzeiten können bei vorhandener Einrichtung
weiterverwendet werden. Vorschaupakete sind unsigniert; macOS ist nicht notarisiert.
Die eigene Projektlizenz ist noch nicht festgelegt.

Benötigt wird ein Hermes-Gateway mit kompatibler Dashboard-/WebSocket-API. Eine
standalone Hermes-CLI wird nicht allein durch Eingabe einer URL kompatibel.
Desktop-/Linux-MCP-Verbindungen müssen für das eigene Gerät eingerichtet sein.

## Bedienung

Orb öffnen und am eigenen Gateway anmelden, anschließend die gewünschte Session
wählen. Live-Gespräch, Sprechtaste und optionale Aktivierung verwenden das lokal
gewählte Mikrofon. Antworten lassen sich unterbrechen. Kamera und Aktivierungswort
sind bei Neuinstallationen ausgeschaltet.

Die Werkstatt zeigt Projekte, Dateien, Aufträge und einen eigenen Browser.
Gesprächsübergabe, unabhängige neue Gespräche und lokale Werkzeuge erfordern die
jeweils erreichbaren und ausdrücklich verbundenen Geräte. Angeforderte Aktionen
werden durch ihre tatsächlichen Ergebnisse bestätigt.

## Aus Quellcode starten

Die Befehle im geklonten Projektverzeichnis ausführen:

```powershell
.\scripts\install-windows.ps1 -InstallNode -InstallPython
& .\launch.ps1
```

```bash
bash scripts/install-linux.sh --source "$PWD" --install-python
bash launch-linux.sh
```

Optionale Artcraft-Anwendungen werden im eigenen lokalen Installationsverzeichnis
gesucht. Einen abweichenden Ort über `HERMES_VOICE_ARTCRAFT_ROOT` konfigurieren;
kein privater Laufwerkspfad ist vorgegeben.

## Entwicklung und Datenschutz

[Projektanleitung](AGENTS.md), [Wartung](docs/agent-maintenance.md),
[Steuerungs-API](docs/control-api.md), [Linux-Client](docs/linux-client.md),
[Gesprächsübergabe](docs/session-handoff.md), [Projekte](docs/projects.md).

```powershell
npm.cmd test
git diff --check
```

Sprachverarbeitung kann lokal laufen; Aufträge gehen an den eigenen Hermes und
dessen gewählte Modellanbindung. Gemini Live ist derzeit recherchiert und noch
kein aktivierter Anbieter. Hinweise zur Veröffentlichung und Prüfung privater
Daten stehen in [Öffentliche Daten und Geheimnisse](docs/public-privacy.md).
