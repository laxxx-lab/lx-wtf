# Gesprächsort und explizites Zurückholen

Der bestehende Gesprächsbesitz wird auf beiden Orbs mit dem tatsächlichen
Gerätenamen angezeigt. Ein entfernter Besitzer zeigt „Auf <Gerät>“, bei
abgelaufener Verbindung zusätzlich „offline“. Daten werden als Text gerendert.
Die bestehende Gesprächsaktion bietet auf einem passiven Gerät „Hierher
zurückholen“; eine kompakte Aktion ist erreichbar, ohne Sprache zu aktivieren.

Explizites Zurückholen verwendet dieselbe gespeicherte Session und dasselbe
Profil, dieselben Leases und persistierte Besitzrevisionen. Ist der Besitzer
online, wird eine Rückgabe angefordert. Sein Client wartet auf seine bestehende
Arbeit und bereitet die normale Übergabe an genau den Anfragenden vor.
Ist der Besitzer länger als acht Sekunden ohne Verbindungsmeldung, darf der
Anfragende eine vorbereitete Wiederübernahme bestätigen. Die Annahme prüft
erneut, dass der frühere Besitzer weiterhin offline ist. Ein zurückgekehrter
Client kann dadurch keine parallelen Eingänge oder automatischen Rückwechsel
erzeugen. Gleichzeitige Ansprüche werden über dieselbe SQLite-Transaktion
und Besitzrevision abgeglichen.

Der Anfragende bestätigt vor jeder Wiederübernahme den echten gespeicherten
Hermes-Laufstatus über die vorhandene Sessionauswahl. Laufende Hermes-Arbeit
wird weiter beobachtet; kein Prompt wird wiederholt oder unterbrochen. Der
Client wartet auf Leerlauf, wählt und zeigt Verlauf vor dem Besitzwechsel.
Datenschutz wird nicht aufgehoben; fremde lokale Queues bleiben gerätegebunden.
Der normale lokale Ankunftsgruß folgt erst nach bestätigter Übernahme.

Neue geschlossene Operation `recall` am vorhandenen Endpunkt enthält nur
`requestId` und `session` zusätzlich zur vorhandenen Geräte-/Profilidentität.
Der Belegzustand `requested` bezeichnet eine online angeforderte Rückgabe;
`preparing`, `committed`, `failed` behalten ihre bisherigen Bedeutungen.
Das existente `request` des Besitzers bereitet einen `requested`-Beleg vor.
Ein erneutes `recall` derselben UUID darf einen inzwischen ausgefallenen
Besitzer erst nach erneutem Lease-Abgleich in `preparing` überführen.
Keine neue Tabelle, kein separater Server, kein neues Geheimnis erforderlich.
