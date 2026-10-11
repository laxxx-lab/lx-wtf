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

Ein fest gewähltes, nicht verfügbares Mikrofon erzeugt einen Hinweis. Die App
weicht nicht heimlich auf ein anderes Gerät aus. Ein beendeter Track wird nicht
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
