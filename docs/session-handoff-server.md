# Session-Übergabe am bestehenden Hermes-Dashboard

Stand 13.10.2026: auf dem bestehenden VPS-Dashboard bereitgestellt. Die eigene
Integration ergänzt `hermes_cli/lilith_handoff/` und bindet die Route vor der
SPA ein; vorhandene fremde Änderungen wurden erhalten. Der tatsächliche
Dashboard-Code wurde zuvor privat gesichert und vor Ersetzung verglichen.
Importprüfung bestätigt genau eine Route. Der laufende Server weist einen
nicht angemeldeten POST mit HTTP 401 ab. Das Dashboard wurde im bestätigten
Leerlauf neu geladen; der getrennte Hermes-Gatewaydienst blieb aktiv.
Die reale PC-/Notebook-Übergabe ist über beide nativen Oberflächen mit
produktiver Anmeldung bestätigt. Drei vollständige Rundläufe verwendeten
dieselbe gespeicherte Session/Profil und Besitzrevisionen 1 → 2 → 3 → 4 → 5 → 6 → 7.
Nach bestätigter Übernahme wurde jeweils genau die Quelle passiv. Der zweite
Rundlauf prüfte auch die bereinigte Verlaufdarstellung und Wiederverbindung.
Der dritte bestätigt das automatische Öffnen aus dem Orb auf beiden Geräten.

Die Rückholerweiterung wurde im bestätigten Dashboard-Leerlauf geladen;
der getrennte Messaging-Gatewayprozess blieb unverändert. Produktive Belege
bestätigen Online-Rückholung in beiden Richtungen (Revisionen 11/12) und
Offline-Rückholung nach beendetem Notebook-Client (Revision 13 mit
`recall:true, offlineRecovery:true`). Nach dessen Rückkehr blieb der PC
Besitzer; beide Clients verwendeten dieselbe gespeicherte Session und dasselbe
Profil. Private Datenbank und Journale wurden erhalten, keine Authdaten geändert.

Die vorhandene Basic-Anmeldung hatte keinen dauerhaften Signaturschlüssel,
wodurch ihre Cookies bei jedem Dashboardneustart ungültig wurden. Ein eigener
Systemd-Drop-in lädt nun einen dauerhaften Schlüssel aus einer privaten
Datei (0600) außerhalb des Checkouts. Passwort, Benutzer und Provider wurden
nicht geändert; der Schlüssel steht weder in Ausgaben noch im Repository.

## Integration nach geprüftem Serverzugang

Die Dateien `scripts/session_handoff.py` und `scripts/hermes_handoff_router.py`
gehören in denselben bestehenden Python-Prozess wie das authentifizierte
Hermes-Dashboard. Sie benötigen nur dessen vorhandenes FastAPI und die
Python-Standardbibliothek. Kein zusätzlicher Server, Token oder kostenpflichtiger
Dienst ist erforderlich.

Vor Bereitstellung den tatsächlich laufenden Prozess, seine Python-Umgebung,
Quellversion und seine `hermes_cli/dashboard_auth/{base,middleware}.py` prüfen.
Im hier gelesenen installierten Quellstand setzt `gated_auth_middleware` nach
Cookie-/Providerprüfung `request.state.session`: `Session.user_id` und
`Session.provider` sind die Identität. `Session.principal` existiert dort nicht.
Der Router verwendet ausschließlich diese verifizierten Felder, getrennt nach
Provider. Nutzlastfelder wie `principal` sind verboten. Legacy-Loopback-Token
und Service-Token ohne verifizierte Session werden auch lokal mit 401 abgewiesen.

Den bestehenden Hermes-Checkout zuerst sichern und Änderungen dort separat
prüfbar halten. Beispielsweise beide Dateien in ein neues Paket
`hermes_cli/lilith_handoff/` kopieren, mit einer leeren `__init__.py`. Dann im
bestehenden `hermes_cli/web_server.py` nach Erstellung von `app` und **vor**
`mount_spa(app)` diesen Router einbinden:

```python
from hermes_cli.config import get_process_hermes_home
from hermes_cli.lilith_handoff.session_handoff import Coordinator
from hermes_cli.lilith_handoff.hermes_handoff_router import create_router

handoff_directory = get_process_hermes_home() / "lilith-handoff"
handoff_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
handoff_directory.chmod(0o700)
app.include_router(create_router(Coordinator(handoff_directory / "ownership.sqlite3")))
```

Nicht über den Dashboard-Plugin-Präfix `/api/plugins/...` mounten: Der feste
Clientvertrag ist `POST /api/lilith/handoff`. Die vorhandene Auth-Middleware,
ihre Provider und ihre Cookies bleiben die Anbindung. `app.state.auth_required`
muss tatsächlich aktiv sein. Ein umgekehrter Proxy muss bereits vertrauenswürdig
konfiguriert sein, damit `request.url` den äußeren HTTPS-Ursprung wiedergibt;
der Router vertraut zusätzlichen, vom Aufrufer gelieferten Forwarded-Headern
nicht selbst. Browser-POSTs mit fremdem/null `Origin` oder fremdem
`Sec-Fetch-Site` werden mit 403 abgewiesen.
Das reale Electron-`authSession.fetch` im Hauptprozess sendet kein `Origin`
und `Sec-Fetch-Site: none`. Genau diese Kombination ist nach verifizierter
Dashboard-Session erlaubt. Ein vorhandenes `Origin: null` bleibt verboten,
auch zusammen mit `none`; nur JSON-POSTs werden angenommen, ohne zusätzliche
CORS-Freigabe.

Der gelesene Dashboard-Stand gibt verifizierten interaktiven Nutzern administrative
Profilrechte. Der Adapter verwendet dessen `_resolve_profile_dir` zur Prüfung
des **existierenden benannten** Profils und `_open_session_db_for_profile` mit
`read_only=True`/`get_session` zur Prüfung der **exakten gespeicherten** Session-ID.
Ein Payload schafft keine Profilberechtigung und keine Hermes-Session. Hat die
produktive Version zusätzliche Benutzer-/Profil-/Session-ACLs, ihre vorhandenen
Prüfungen über `create_router(..., authorize_profile=..., authorize_session=...)`
einbinden. Beide synchronen Callbacks erhalten den verifizierten `Request`;
sie müssen `True` nur bei tatsächlicher Berechtigung zurückgeben. Keine pauschal
erlaubenden Callbacks in Produktion einsetzen.

Die SQLite-Datei liegt unter einem privaten Verzeichnis des Dienstbenutzers;
die Implementierung legt die Datei mit Unix-Modus 0600 an und benutzt dort
private SQLite-Journale. Ein bestehendes Verzeichnis muss ebenfalls 0700 haben.
Auf Windows ersetzt `chmod` keine ACL-Prüfung; die Windows-Testdateien liegen
in temporären Benutzerverzeichnissen. Die Datenbank enthält Geräte-/Session-
Metadaten und Besitzbelege, keine Cookies, Tokens, Audio oder Chatnachrichten.
Sie bleibt privat und gehört weder ins Repository noch in Debug-/Access-Logs.
Request-Bodies und Antwortinhalte nicht loggen; Access-Logs des Proxys für
diesen Polling-Endpunkt bei Bedarf auf reine aggregierte Fehlerzahlen begrenzen.
Die Datei muss Neustarts überleben; nicht bei Update/Timeout neu anlegen oder
löschen. Alle Worker derselben Dashboard-Installation müssen dieselbe lokale
SQLite-Datei verwenden. Kein Netzwerk-Dateisystem für SQLite einsetzen.

## HTTP-Vertrag

Alle Operationen sind JSON, maximal 8192 Bytes einschließlich gestreamter Bodies.
Objekte sind geschlossen: unbekannte und doppelte Felder scheitern. Jede
Nutzlast enthält `operation`, `clientId`, `instanceId`, `profile`. Client-,
Instanz- und Request-ID sind kanonische UUID-Strings. `profile` ist ein benannter
Hermes-Profilbezeichner; der Sessionwert ist `{id, profile, title}` mit exakt
gespeicherter ID und `title` als Text oder `null`.

| Operation | Zusätzliche Felder |
| --- | --- |
| `register` | `name`, `kind` (`windows`/`notebook`), `session` (Objekt oder `null`), `busy`, `privacyLocked`, `connected` (echte Booleans) |
| `poll` | keine |
| `request` | `requestId`, `targetKind`, `session` |
| `recall` | `requestId`, `session` |
| `accept` | `requestId` |
| `reject` | `requestId`, optional `error` (kurzer Code mit kleinen Buchstaben/Ziffern/Unterstrichen) |

`register` wird alle zwei Sekunden erneuert. Nach acht Sekunden fehlt die
Bereitschaft. Ein anderer Start desselben Geräts wird innerhalb der aktiven
Lease mit `instance_conflict` abgewiesen. Profil und verifizierte Identität
partitionieren alle Tabellen. Der erste verbundene Client mit gewählter
gespeicherter Session beansprucht sie mit Revision 1, sofern noch kein Besitzer
existiert. Auch ein gerade beschäftigter oder datenschutzgesperrter Client darf
diese Besitzzuordnung melden: Sie ändert keine Datenschutzpräferenz und erlaubt
keine Übergabe, solange die separaten Bereitschaftsprüfungen scheitern.
Gleichzeitige erste Registrierungen sind durch die SQLite-Schreibtransaktion
serialisiert und erzeugen genau einen Besitzer. So führt eine bereits laufende
Quellaufgabe beim Start nicht zu dauerhaft fehlendem Besitz, wenn das zweite
Gerät dieselbe Session bereits geöffnet hat. Bestehender Besitz bleibt auch
nach Lease-Ablauf erhalten; Wiederanmeldung stiehlt ihn nicht.

Erfolgreiche Antworten enthalten `supported:true`, `clients`, `incoming`,
`outgoing`, `ownership`. `clients` enthält `clientId`, `instanceId`, `profile`,
`name`, `kind`, `session`, `busy`, `privacyLocked`, `connected`, `online`.
`incoming`/`outgoing` sind Arrays von Belegen. `ownership` enthält
`{sessionId, profile, ownerId, revision}`. `request`/`accept`/`reject` enthalten
zusätzlich **`receipt`**:

`recall` liefert ebenfalls einen Beleg. Bei erreichbarer Quelle bleibt er
`requested`, gebunden an die exakten Quell-/Zielinstanzen und Besitzrevision.
Die Quelle beginnt nach Leerlauf mit `request` derselben Request-ID und dem
Gerätetyp des initiierenden Ziels. Diese Anforderung bleibt bei langer Arbeit
erhalten, solange das Ziel seine Verbindung meldet. Nach Ablauf der
achtsekündigen Quell-Lease kann dasselbe Ziel denselben `recall` wiederholen;
er wird dann `preparing`. Solche Belege ergänzen `recall:true` und
`offlineRecovery:true/false`. Offline-`accept` prüft erneut den Lease-Ablauf;
eine frisch zurückgekehrte Quelle führt zu `source_online`, kein erzwungener
Besitzwechsel. Auch Offline-Rückholung verlangt bestätigte Zielauswahl,
Leerlauf, Datenschutzfreiheit und denselben atomaren Revisionsvergleich.

```json
{
  "requestId": "00000000-0000-4000-8000-000000000003",
  "sourceId": "00000000-0000-4000-8000-000000000001",
  "targetId": "00000000-0000-4000-8000-000000000002",
  "sourceInstanceId": "00000000-0000-4000-8000-000000000011",
  "targetInstanceId": "00000000-0000-4000-8000-000000000012",
  "session": {"id": "example-stored-session", "profile": "default", "title": null},
  "state": "committed",
  "revision": 2,
  "error": null
}
```

Das Beispiel enthält ausschließlich synthetische IDs. Vor Commit ist der Zustand
`preparing` mit der bisherigen Besitzrevision. Die Quelle muss frisch, frei,
verbunden, entsperrt und der aktuelle Besitzer sein. Genau ein passendes
bereites Ziel wird ausgewählt. Ein gültiger Besitzer mit nicht verfügbarem,
beschäftigtem, gesperrtem oder mehrdeutigem Ziel erhält HTTP 200 mit einem
persistierten `failed`-Beleg und `error`: `target_offline`, `target_busy`,
`target_locked`, `target_ambiguous` oder `transfer_pending`. Ist kein eindeutiges
bekanntes Ziel vorhanden, sind `targetId`/`targetInstanceId` `null`. Derselbe
Request bleibt bei erneuter Einsendung fehlgeschlagen; ein neuer gewollter
Versuch braucht eine neue UUID. Ein anderer Payload mit derselben UUID wird
mit `request_conflict` abgewiesen.

Nur exakt die angesprochene Zielinstanz kann bestätigen/ablehnen. Vor `accept`
muss ihre Registrierung bereits dieselbe ausgewählte ID und dasselbe Profil
melden. Die Transaktion prüft beide Leases, beide Instanzen, Sessionauswahl,
Bereitschaft, Quellbesitz und Revision erneut. Erst dann wechselt sie Besitzer
und Revision atomar. Bis zu diesem Commit dürfen beide Clients keine neuen
Gesprächseinsendungen auslösen. Vorhandene Quellaufträge werden vorher beendet.
Nach 30 Sekunden wird ein unbestätigtes `preparing` explizit `failed/expired`.
Ein `committed`-Beleg verfällt nie zurück zur Quelle. Nach verlorenem Empfang
denselben Beleg über Poll/Retry abgleichen; kein neuer Prompt und kein neuer
Transfer auf Verdacht. Die Tabellen bewahren frühere Belege für idempotente
Retries; deren Aufbewahrung nicht ohne einen neuen Protokollvertrag verkürzen.

Abgewiesene Schema-/Identitäts-/Vorbedingungen liefern
`{supported:true, error:kurzer_code}`. HTTP 400 steht für `invalid_payload`, 401
für fehlende verifizierte Identität, 403 für Origin-/Profil-/Session-/Zielrechte,
404 für unbekannte Request-ID, 409 für Instanz-/Besitz-/Session-Konflikte,
413 für zu große Bodies, 415 für falschen Content-Type, 503 für nicht verfügbare
SQLite-Speicherung. `supported:true` bestätigt nur den vorhandenen Vertrag,
niemals eine erfolgreiche Übergabe. Die HTTP404 eines nicht bereitgestellten
Servers bleibt für den Client „nicht unterstützt“.

## Prüfungen und Aktivierung

Die lokale Suite verwendet echte SQLite-Dateien, kontrollierte Zeit und einen
echten FastAPI-ASGI-Router mit zwei **synthetisch durch Test-Middleware
verifizierten** Clientidentitäten. Die Test-Middleware ist keine produktive
Cookie-Anmeldung und wird nicht ausgeliefert. Sie prüft Identitäts-/Profil-
Isolation, Body-/Origin-Grenzen, parallele Vorschläge/Annahmen, Busy/Offline/
Datenschutz, falsche Instanzen, Sessionwechsel, Ablehnung, Expiry, Rücktransfer
und Persistenz nach Neustart. Auf Windows:

```powershell
& '.local/session-handoff-test-venv/Scripts/python.exe' -m unittest discover -s tests -p test_session_handoff.py
python -m py_compile scripts/session_handoff.py scripts/hermes_handoff_router.py
git diff --check
```

Im Hermes-Servervenv genügt `python -m unittest discover -s tests -p
test_session_handoff.py`, sofern dessen FastAPI-Testclient-Abhängigkeit verfügbar
ist. Die reine SQLite-Suite läuft auch ohne FastAPI; HTTP-Tests melden dann
explizit `skipped`. Die getrennte lokale Testumgebung ist ignoriert und ändert
keine App-Produktionsabhängigkeiten.

Nach geprüftem Serverzugang und Integration über **vorhandene echte Anmeldung**
zwei isolierte Clients registrieren, dieselbe bereits gespeicherte Session
übergeben und Poll/Receipt/Ownerrevision gegen ihren Renderer prüfen. Nach
Commit genau einen aktiven Gesprächseingang und keine doppelte Prompteinsendung
beobachten; Rückrichtung, verlorene HTTP-Antwort und App-Neustart prüfen.
Anschließend echte PC-/Notebook-Audio- und Gerätezustände einschließlich erhaltener
Live-/Wakeword-/Datenschutzpräferenzen verifizieren. Die neuen eigenen Clients
sind aktiviert und ihre Einstellungen erhalten. Die lokale Prüfung umfasst
955 bestandene Node-Tests (fünf optionale übersprungen) und 24 Python-Tests.
Die produktive Übergabe und Rückgabe per Gesprächsknopf, native Verlaufanzeige
und lokale Eingangsumschaltung sind bestätigt. Die ausdrücklich gesprochene
Übergabeformulierung ist noch nicht separat bestätigt. Die lokale
Ankunftsbegrüßung wurde zusätzlich in beiden Richtungen angezeigt und an den
echten Audioausgängen gemessen, ohne Mikrofonaufnahme. Patrik bestätigte die
Notebook-Begrüßung als einmalig und verständlich hörbar. Die menschliche
PC-Hörbestätigung bleibt getrennt. Lokale HTTP-/SQLite-Ergebnisse allein sind
kein Live-Gerätenachweis.
