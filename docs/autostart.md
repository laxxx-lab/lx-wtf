# Windows-Autostart

„Mit Windows starten“ in den Einstellungen registriert `Hermes.Voice.Windows` für den aktuellen Benutzer. Electron startet dabei seine vorhandene ausführbare Datei mit dem Projektordner als Argument. Der Ordner und die Electron-Laufzeit müssen am gleichen Ort bleiben.

Die App setzt mit Electrons `app.setLoginItemSettings` sowohl `openAtLogin` als auch `enabled`. Damit wird auch die Windows-StartupApproved-Einstellung aktualisiert. Ausschalten entfernt den Autostart-Eintrag. Smoke-Tests ändern keinen Autostart.

Der Status prüft den Eintrag mit genau diesem Namen, der ausführbaren Datei und diesem Projektordner. Ein anderer Hermes-Desktop-Eintrag zählt nicht als aktivierter Voice-Autostart. Der Wert `executableWillLaunchAtLogin` allein reicht dafür nicht aus, weil Electron dabei Argumente ignoriert.

Die API wurde anhand der installierten Electron-40.10.2-Typdefinition geprüft. Sie ist in der [Electron-Dokumentation](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows) beschrieben.
