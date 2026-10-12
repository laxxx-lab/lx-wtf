# Mikrofon auswählen

Orb öffnen → Einstellungen → **Audio / Mikrofon**. Den gewünschten Spracheingang
auswählen, beispielsweise Corsair-Headset oder Sennheiser-Tischmikrofon.
Die Wahl wird sofort gespeichert; zusätzliches Speichern ist nicht erforderlich.
Darunter stehen der tatsächlich geöffnete Gerätename und eine Pegelanzeige.
„Windows-Standard“ bleibt als bewusste Auswahl verfügbar.

Live, Aktivierungswort und Sprechtaste verwenden denselben Eingang. Bei einem
Wechsel werden alte Tracks geschlossen und eine angefangene Aufnahme verworfen;
die laufende Hermes-Aufgabe bleibt bestehen. Live wird auf dem neuen Eingang
fortgesetzt. Bei ausgeschalteter Aufnahme oder Datenschutz öffnet allein das
Speichern der Auswahl kein Mikrofon. Die Windows-Standard- und
Kommunikationsgeräte werden nicht verändert.

Gerätekennung und zuletzt gewählter Gerätename werden gespeichert. Nach USB-
Umstecken kann Windows eine neue Kennung und einen Zusatz wie „2-“ vergeben.
Wenn genau ein Eingang denselben vollständigen Gerätenamen einschließlich
vorhandener Hardwarekennung trägt, wird diese Kennung neu zugeordnet. Nur der
Windows-Instanzzusatz in Klammern wird beim Vergleich ignoriert. Bei mehreren
gleichnamigen Geräten oder fehlendem Treffer ist eine bewusste Auswahl nötig.
Die App weicht nicht auf Headset, Standardgerät oder Webcam aus. Ein beendeter Track wird nicht
weiter als verwendbarer Eingang wiederverwendet. Technische Grundlage:
[MediaTrackConstraints.deviceId](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/deviceId).

## Geprüft am 11.10.2026

Ursache des gemeldeten Ausfalls: Die App öffnete Windows-Standard/Corsair,
während ins Sennheiser gesprochen wurde. Am tatsächlichen PC wurde auf konkrete
Geräte-IDs zwischen Headset und Sennheiser gewechselt, die alte Aufnahme
geschlossen, die Wahl gespeichert sowie Live-Aufnahme und Wakeword-Bereitschaft
mit Sennheiser geprüft. Patrik bestätigte anschließend, dass Lilith ihn hört und
antwortet. Es wurden keine Rohaufnahmen für diese Diagnose gespeichert.

Automatisierte Prüfungen decken Auswahl ohne falschen Fallback, Trackende,
verzögerte Freigabe, laufenden Live-Wechsel, verworfene alte Aufnahme und
Datenschutz ab.

Nach dem Umstecken des Sennheiser wurde am echten PC die alte gespeicherte
Kennung gegen die neu gemeldete Kennung aufgelöst; Aufnahme und gespeicherte
Auswahl stimmten überein. Wake-Bereitschaft und Live wurden danach geprüft.

## Direkte Agentensteuerung

`control.ps1 -Action microphones` liefert frische `devices[].deviceId` und Labels.
`-Action microphone -DeviceId <id>` wählt genau diesen Eingang; `-DeviceId ''`
wählt bewusst Windows-Standard. Rendererbestätigung und `result.verified=true`
erfordern das passende aktive Gerät, sofern Live/Wake aktiv sind. Bei fehlendem
Gerät wird die vorherige Wahl wiederhergestellt; nie ungefragt Standard öffnen.
„Wechsle zum Tischmikrofon“ bzw. „Wechsle zum Headset“ wird bei eindeutigem
Sennheiser-/Headset-Treffer lokal verarbeitet, ohne Modellaufruf.
