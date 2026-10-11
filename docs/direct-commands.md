# Direkte Standardbefehle

`direct-commands.cjs` erkennt eine kleine, feste Liste vollständiger deutscher Befehle. Das Modul verwendet keine zusätzliche KI, bezahlte API oder neue Abhängigkeit. Es ist eigenständig implementiert; hey-jev-Code wurde nicht übernommen.

| Beispiel | Lokale Aktion |
| --- | --- |
| `Öffne Spotify`, `Bitte starte Google Chrome` | Genau eine bekannte Anwendung aus dem bestehenden App-Katalog öffnen |
| `Lauter`, `Mach den Ton leiser` | Master-Lautstärke um zehn Prozentpunkte ändern, auf 0–100 begrenzt |
| `Stelle die Lautstärke auf 42 Prozent` | Master-Lautstärke auf einen ganzzahligen Wert von 0–100 setzen |
| `Ton aus`, `Ton an` | Master-Stummschaltung setzen bzw. aufheben |
| `Spiele Musik in Spotify`, `Pausiere Spotify` | Die eindeutige Spotify-SMTC-Sitzung abspielen bzw. pausieren |
| `Nächster Titel in Spotify`, `Vorheriger Titel in Spotify` | In derselben Spotify-Sitzung weiter bzw. zurück |

Fragen, Verneinungen, mehrere Aktionen, Titelsuche, ungültige Werte, unbekannte App-Namen und mehrdeutige Katalogtreffer ergeben `null` und können im bestehenden Hermes-Ablauf bearbeitet werden. App-Namen werden nur exakt verglichen; Groß-/Kleinschreibung, Leerzeichen und Unicode-Normalisierung werden vereinheitlicht. Es gibt keine unscharfe App-Suche. `enabled: false` schaltet die Erkennung ab.

Der Client prüft Spotify zunächst lesend. Fehlt eine eindeutige Windows-SMTC-Sitzung, geht der Auftrag vor einem nativen Wiedergabeversuch an den vorhandenen Hermes-/Spotify-Weg. Nach einer möglicherweise angewandten nativen Aktion erfolgt kein automatischer Ersatzversuch. Lokale Ergebnisse bleiben in derselben Auftragsliste und werden mit Zeitangabe an den nächsten Hermes-Auftrag dieser Session übergeben; sie gelten nicht als zeitloser aktueller Zustand.

## Vertrag und Einbindung

`parseDirectCommand(text, { apps, enabled })` liefert `null` oder eine dieser privaten, serialisierbaren Befehlsformen:

```js
{ type: 'app.open', app: { id: 'app:Vendor!Main', name: 'Name' } }
{ type: 'volume', action: 'up' } // down, mute, unmute
{ type: 'volume', action: 'set', value: 42 }
{ type: 'spotify', action: 'play' } // pause, next, previous
```

`validDirectCommand(command)` prüft die gesamte Form mit genau diesen Schlüsseln, erlaubten Aktionen und der vorhandenen App-Referenzvalidierung. `createDirectCommands({ getApps, execFile, platform, windowsDir })` liefert `parse(text, { enabled })`, `execute(command, { signal })` und `observe(command, { signal })`. `getApps` darf asynchron sein. Lautstärke und Spotify benötigen beim Parsen keinen Katalogzugriff; App-Starts lesen und prüfen den Katalog erneut vor dem nativen Aufruf. Während asynchroner Schritte arbeitet das Modul mit einer Kopie des validierten Befehls.

Ergebnisse haben `{ status, verified, message, evidence }`. Nur `status: 'completed'` setzt `verified: true`. Ein sicher abgelehnter Befehl ist `failed`; ein möglicherweise ausgeführter, aber nicht bestätigter Befehl ist `unverified`. Transport-Timeouts, Abbrüche nach Dispatch und beschädigte native Antworten bleiben `unverified`, weil die Wirkung bereits eingetreten sein könnte. Nach einem nativen Versuch darf kein automatischer Hermes-Ersatzauftrag oder zweiter Aktionsversuch entstehen. Der Aufrufer reiht die Aktion in die vorhandene persistente Auftragswarteschlange ein und wendet ihre Datenschutz-, Standby- und Konfliktgates vor Dispatch an.

`observe` übergibt ausschließlich den Read-only-Schalter `-ObserveOnly` an denselben Helper. Damit werden weder Apps geöffnet noch Lautstärke oder Wiedergabe verändert. Aktuelle Zielzustände für App-Fenster, absolute Lautstärke, Stummschaltung sowie Abspielen/Pause lassen sich erneut prüfen. Relative Lautstärke und vorheriger/nächster Titel bleiben bei einer späteren Beobachtung immer unbestätigt: Nach einem Neustart fehlt die ursprüngliche Vergleichsbasis. Ein Abgleich wiederholt diese Aktionen nicht.

## Native Wirkung und Grenzen

Der feste Helper `scripts/direct_commands.ps1` läuft mit getrennten `execFile`-Argumenten, `shell: false`, `windowsHide: true` und 18 Sekunden Transportfrist. Die interne Prüfung verwendet höchstens 14 Sekunden. Er arbeitet nur im aktiven Konsolen-Desktop `Default` derselben angemeldeten Windows-Sitzung. Er erzeugt keine Tasteneingaben, fokussiert kein fremdes Fenster und akzeptiert keinen Shell-Code aus der Äußerung.

Ein App-Start aktiviert die validierte bekannte AppsFolder-ID über Explorer oder den bekannten lokalen `.exe`-/`.lnk`-/`.appref-ms`-Verweis über Windows. Ein frisches sichtbares, nicht verborgenes Fenster muss anschließend zum exakten Prozesspfad oder zur AUMID und zur aktuellen Desktop-Sitzung passen. Bei Store-Fenstern werden auch die Kindfenster auf die Prozessidentität geprüft. Der Spawn allein zählt nicht als Erfolg. Verknüpfungen ohne auflösbares EXE-Ziel und `.appref-ms` können geöffnet werden, bleiben ohne belegbare Fensteridentität jedoch `unverified`.

Lautstärke nutzt die Core-Audio-Schnittstelle des aktuellen Standard-Wiedergabeendpunkts. Vorher-/Nachher-Lesung, Geräteidentität, tatsächlicher Pegel und Stummschaltung werden verglichen. Die Pegelprüfung toleriert einen Prozentpunkt Gerätequantisierung. Pegeländerungen verändern die Stummschaltung nicht.

Spotify nutzt Windows SMTC ab Windows 10 Version 1809. Genau eine Sitzung mit `SourceAppUserModelId` gleich `Spotify.exe` oder `SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify` muss vorliegen. Andere Medienquellen werden nicht gesteuert; mehrere passende Sitzungen werden abgelehnt. Play/Pause erfordern den frisch gelesenen Ziel-Wiedergabestatus. Weiter/Zurück erfordern zusätzlich einen geänderten Titel oder Interpreten bei gleichem Wiedergabestatus. Ein Zurück-Befehl, der lediglich denselben Titel neu beginnt, ist damit bewusst nicht als Titelwechsel bestätigt. Web-Spotify, nicht veröffentlichte SMTC-Sitzungen und andere Spotify-Quell-IDs werden nicht blind gesteuert. Titel- und Interpretenwerte in Belegen sind auf je 300 Zeichen begrenzt.

## Prüfung

`node --test tests/direct-commands.test.cjs` prüft Erkennung, Ablehnung, Validierung, sicheren Transport, Belege und den lesenden Abgleich mit kontrollierten nativen Antworten. `DIRECT_COMMAND_NATIVE_TEST=1 node --test tests/direct-commands-native.test.cjs` aktiviert Windows-Prüfungen, die echte Core-Audio- und SMTC-Zustände ausschließlich lesen. Die normalen Tests öffnen keine Benutzerprogramme und ändern keine Lautstärke oder Musik.

Quellen: [Microsoft SMTC-Sitzung und Methoden](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession), [Core Audio Endpoint Volume](https://learn.microsoft.com/en-us/windows/win32/api/endpointvolume/nn-endpointvolume-iaudioendpointvolume), [GetApplicationUserModelId](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/nf-appmodel-getapplicationusermodelid), [EnumWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows), [EnumChildWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumchildwindows), [QueryFullProcessImageName](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-queryfullprocessimagenamew).
