# Bluetooth auf dem Windows-PC

Unter **Einstellungen → Bluetooth** stehen Geräteliste, Radio, achtsekündige
Suche, Kopplung, Verbinden/Trennen und Audioausgabe bereit. Die Liste wird auf
Anfrage gelesen; es gibt keine dauernde Suche. Windows muss PairTool unterstützen
(auf diesem Windows-11-PC vorhanden), die App in der aktiven Benutzersitzung laufen.

Kurze Sprachbefehle werden lokal ausgeführt und mit dem tatsächlichen Ergebnis
bestätigt. Gerätnamen werden vor dem Auftrag gegen die aktuelle Liste aufgelöst;
mehrdeutige oder fehlende Ziele gehen zur Klärung an Hermes.

- „Schalte Bluetooth ein“ / „Bluetooth aus“
- „Suche Bluetooth-Geräte“
- „Verbinde die Soundbar“ / „Trenne die Soundbar“
- „Ton auf die Soundbar“
- „Kopple Bluetooth mit GERÄTENAME“

Der bereits gekoppelte Xbox-Controller verbindet sich vom Gerät aus selbstständig.
Seine Kopplung bleibt bestehen. Geräteseitiges Einschalten ist kein PC-Befehl;
Windows bietet für manche Eingabegeräte keinen Connect-/Disconnect-Button.
Lilith darf daraus keine Berechtigungsdiagnose ableiten oder neu koppeln.

Radioänderungen verwenden die Windows-Radio-API ausschließlich für Bluetooth.
Verbinden und Trennen bedienen den Button des eindeutigen physischen Geräts
auf der nativen Windows-Bluetoothseite. Diese Seite kann dabei sichtbar werden.
Der frische Buttonwechsel bestätigt das Ergebnis; gespeicherte „Connected“-Flags
allein bestätigen keine ausgeführte Aktion. Beobachten wiederholt keine Mutation.

Audio ordnet das Bluetooth-Gerät über seine physische Container-ID einer aktiven
Windows-Wiedergabeausgabe zu. Anschließend werden Windows-Standardausgabe und
Liliths Ausgabe geprüft. Separat festgelegte Ausgaben anderer Programme sind
damit nicht nachgewiesen geändert. Zur Zuordnung siehe
[Microsoft: Audio endpoint container ID](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/audio-endpoint-container-id).

Die Suche nutzt einen zeitlich begrenzten DeviceWatcher für Classic/LE. Sie zeigt
bekannte und innerhalb dieses Zeitfensters gefundene Geräte, ohne Vollständigkeit
zu garantieren. Neue Geräte müssen sichtbar beziehungsweise im Kopplungsmodus
sein. Kopplung öffnet den nativen Windows-Dialog; notwendige PIN- oder
Nummernbestätigungen bleiben dort beim Benutzer. Es gibt kein Entfernen von
Kopplungen, Diensten oder Treibern und keinen automatisch ausgelösten Radio-Neustart.
PairTool dient hier dem Lesen gespeicherter Endpunkte:
[Microsoft: PairTool](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/pairtool).

Die Agentenanbindung nutzt dieselbe authentifizierte lokale API über Windows-MCP.
[Befehle und Endpunkte](control-api.md), [Hermes-Skill](hermes-voice-control/SKILL.md).
Not-Aus, Datenschutz, Stop, Geräteaktions-Sperre und bestehende Auftragsverwaltung
gelten auch für diese Aktionen. Unbestätigte Wirkungen werden nicht als Erfolg
ausgegeben und nicht automatisch erneut ausgeführt.

## Geprüft am 11.10.2026

Am tatsächlichen PC: Samsung-Soundbar getrennt und wieder verbunden, beide
Übergänge frisch bestätigt. Alle drei ursprünglichen Windows-Standardausgaben
waren danach wiederhergestellt. Physische Bluetooth-Audiozuordnung samt
Lilith-Ausgabe, echtes Radio-On, achtsekündige Suche, Einstellungen,
lokaler Sprachauftragsweg und installierter Hermes-Skill wurden geprüft.
Controller wurde als gekoppeltes Gerät gelesen; seine automatische Verbindung
wurde nicht verändert. Neue Kopplung und Radio-Off wurden noch nicht an Hardware
getestet. Die automatisierten Tests prüfen unter anderem Schema, Authentifizierung,
Geräteidentität, unbekannte Wirkungen und Zuordnung der Audioausgabe.
