# Direkte Lilith-Gerätewerkzeuge

Hermes verwendet den MCP-Server **lilith-device** für Standardaktionen. Der
Adapter läuft über stdio im bestehenden Gateway; er öffnet keinen Netzwerkport.
Die vorhandenen SSH-Verbindungen rufen einen festen JSON-Helfer auf dem
ausgewählten Gerät auf. Dessen Token bleibt ausschließlich lokal.

## Aufruf und belegte Wirkung

Jeder Aufruf verlangt `device: windows|notebook`. `device_status` liefert die
tatsächliche Host-/Plattformidentität und `result.sessionContext`: stabile `id`,
Runtime-ID, Profil und `canSubmit`. Änderungen verlangen `expected_session` aus
diesem Status. Der Gerätehelfer und die API prüfen diese Bindung erneut;
Fensteränderungen prüfen sie auch nach dem Warten auf die lokale Warteschlange.
Ein nicht erreichbares Gerät wird nicht durch VPS oder ein anderes Gerät ersetzt.

| Werkzeug | Wirkung |
|---|---|
| `device_status(device)` | Aktuellen lokalen Zustand lesen. |
| `show_camera(device,query,expected_session)` | HA öffnen, eindeutig passende Live-Kamera wählen, deren Wiedergabe prüfen. |
| `windows_list(device)` | Echte Windows-Fenster und physische Monitor-Arbeitsflächen lesen. |
| `window_place(device,id,pid,processStartedAt,monitorId,rect,expected_session)` | Fenster nativ positionieren und Position zurücklesen. Windows-spezifisch. |
| `browser(device,action,expected_session?,url?)` | Eigenen Lilith-Browser bedienen; native Chrome/Edge bleiben beim vorhandenen Desktopwerkzeug. |
| `conversation_handoff(device,action,expected_session?,target?)` | Bestehende Gesprächsübergabe lesen/anfordern oder zurückholen. |

`show_camera` benötigt eine kurze Bezeichnung wie „Haustür“, nicht einen
auswendig gelernten Sprachbefehl. Der Agent interpretiert die freie Formulierung.
Der Client führt den Ablauf innerhalb höchstens 15 Sekunden aus. `verified:true`
verlangt einen laufenden Player genau der gewählten Kamera. Mehrdeutigkeit,
fehlende Kamera, Anmeldung, Nichterreichbarkeit, unbestätigte Wiedergabe und
Abbruch bleiben unterscheidbar. Generische API-Fehler beweisen keinen Loginfehler.
Abbruch und Zeitlimit sperren auch verspätete native Fensteraktionen.

Eine Übergabe mit wartendem Status ist angefordert, noch nicht übernommen.
Rückholen bleibt auf einem passiven Gerät möglich. Es wird kein Gespräch kopiert,
zurückgesetzt oder während der Übergabe erneut als Modellauftrag ausgeführt.

Nach einem möglicherweise gesendeten Änderungsaufruf bedeutet
`effectUnknown:true` / `outcome-unknown`: Wirkung zuerst frisch lesen, nicht
erneut ausführen und nicht über einen zweiten Steuerungsweg wiederholen.

## Einrichtung

`scripts/lilith_device_mcp.py` verwendet das vorhandene offizielle Python-MCP-SDK
v2 (`MCPServer`). `LILITH_DEVICES_FILE` zeigt auf eine private, eigene reguläre
Datei mit Modus 0600. Die beiden Einträge `windows` und `notebook` besitzen je
`host` (tatsächlicher Hostname) und `command` (feste SSH-Argumentliste).
Konfiguration, Schlüssel und konkrete Verbindungsdaten bleiben außerhalb Git.
Nutzereingaben werden nur als JSON auf stdin übergeben, nie in Shelltext eingesetzt.

Der installierte Gerätehelfer `scripts/device_control.cjs` liest ausschließlich
die eigene `.local/control-api.json` bzw. `.local/linux-control.json`; erlaubt
sind nur die bestehenden Loopback-Adressen und sechs benannte Operationen.
Er startet keine GUI aus SSH und überträgt keine Kamera-Medienadressen.

## Ergebnisprüfungen

`evals/device-scenarios.json` enthält 20 Alltagsfälle. Private Laufaufzeichnungen
werden mit `node scripts/grade-device-evals.cjs <datei.json>` bewertet. Die
Aufzeichnungen enthalten gemessene Ergebnisse, Zielgerät, Sitzungsbindung und
Toolaufrufe. Kamerafälle brauchen zusätzlich `reference.cameraEntity`, unabhängig
vom Modell anhand der bekannten Testumgebung ermittelt; `referenceKey` bezeichnet
das öffentliche Testziel. Eine falsche Kamera, ein fehlender Werkzeugaufruf oder
eine bloße Erfolgsmeldung besteht nicht. Nicht ausgeführte Fälle heißen
`untested`, nicht erfolgreich. Reale Sprach-, Geräte- und Wiederanlauftests
bleiben von isolierten Softwaretests getrennt.

Prüfungen: `tests/device-tool-api.test.cjs`, `tests/device-control-bridge.test.cjs`,
`tests/home-display-workflow.test.cjs`, `tests/home-display.test.cjs`,
`tests/lilith_device_mcp_test.py`, `tests/agent-evaluations.test.cjs` und
`tests/device-tool-context.test.cjs`.
