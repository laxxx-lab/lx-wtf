# Hintergrundaufträge und ansprechbare Lilith

Längere Analyse, Recherche, Planung, Foto-/Codearbeit wird im Windows-Client
automatisch an genau einen echten Hermes-Unteragenten pro Auftrag übergeben.
Die bestehende Voice-Session bleibt erhalten. Der Hauptagent beendet seinen Zug
nach dem bestätigten Background-Handle; erst dann wird die Gesprächsspur frei.
Es wird kein zusätzlicher Anbieter oder anderes Modell eingerichtet.

Zwei unabhängige Aufträge können gleichzeitig laufen. „Verbessere das Foto und
recherchiere nebenbei eine Reise“ wird in zwei Aufträge aufgeteilt. Abhängige
Anweisungen wie „analysiere den Fehler und repariere ihn“ bleiben ein Auftrag.
Alltagssteuerung, einfache Erklärungen und Gespräch bleiben beim Hauptagenten.

## Zuständigkeit und sichtbare Rückmeldung

`BackgroundJobs` verfolgt Job-, Delegations- und Unteragenten-IDs. Ein bestätigter
`delegate_task`-Handle mit `status:dispatched` und `mode:background` ist eine
Übergabe, kein fertiger Erfolg. Der Parent-Auftrag erhält `delegated`, wodurch
die normale Auftragswarteschlange die nächste Frage bearbeiten darf. Nur ein
passendes `subagent.complete` beendet den Hintergrundauftrag. Tool-Call-IDs
verhindern, dass verspätete Handshakes einem anderen Auftrag zugeordnet werden.

Die Werkstatt zeigt die Hintergrundaufträge, Agentenzahl, Werkzeugfortschritt,
Rückmeldung und einen gezielten Stopp. „Stoppe die Fotoanalyse“ funktioniert bei
eindeutig zuordenbarem Titel. Sonst den Stoppknopf des gewünschten Auftrags
verwenden. Ein angenommener Stopp gibt dessen Platz erst nach Abschluss frei.
„Stopp“/Not-Aus/Datenschutz fordert den Stopp sämtlicher im Client bekannter
Hintergrundagenten an. Bereits ausgeführte Änderungen werden nicht rückgängig
gemacht; externe Prozesse oder unbestätigte Stopps werden nicht als beendet
ausgegeben.

Ein Desktop-Auftrag reserviert den Desktop für weitere automatisierte Aufträge
dieses Clients. Eine wartende Desktop-Aufgabe blockiert weitere Fragen nicht.
Gespeicherte Routinen reservieren ebenfalls den Desktop. Recherche darf keine Windows-GUI bedienen oder Dateien verändern. Diese Planung
ist keine systemweite Windows-Sperre: manuelle Bedienung, fremde Clients und
Werkzeuge außerhalb dieser Auftragsverwaltung werden dadurch nicht technisch
isoliert. Unteragenten erben Hermes-Werkzeuge; Auftragsumfang und Skill-Kontext
müssen deshalb ausdrücklich mitgegeben werden.

## Gespräch, Vision und Ergebnisse

`snapshot.busy`/Sprachzustand bezieht sich auf das laufende Gespräch. Lokale
Bildauswertung darf parallel dazu laufen. Längere gesprochene Bild-/Kamerafragen
werden vor dem ursprünglichen blockierenden Look-Ablauf delegiert. Bilder werden
weiterhin nur lokal analysiert; Unteragenten nutzen den vorhandenen Steuerungsweg
und erhalten Textbeobachtungen. Allgemeine Sensorfreigaben bleiben unverändert.

`controlStatus.conversationBusy` unterscheidet diese Gesprächsspur von
`controlStatus.busy`: Letzteres zählt auch Bildauswertung und Hintergrundarbeit
und bleibt der konservative Maßstab vor App-Neustarts. `status.background` zeigt
die ausgewählte Session; Datenschutz blendet Inhalte aus.

Abschlüsse landen als getrennte `background-result`-Rückmeldungen in der Queue.
Aktuelle Nutzerfragen haben Vorrang. Im Standby bleiben Rückmeldungen bis zum
Aufwachen zurückgestellt. Bei länger aktiven gesprochenen Aufträgen gibt es nach
etwa 20–35 Sekunden einmal einen kurzen Hinweis, sofern ein frischer
Agentenstatus den laufenden Auftrag bestätigt und die Gesprächsspur frei ist. Der Hauptagent fasst Ergebnisse ohne weitere
Aktionen in höchstens zwei gesprochenen Sätzen zusammen. Ein Agentenabschluss
beweist keine verifizierte PC-Wirkung. Ein Ergebnis des Kindes darf keinen
gerade laufenden anderen Auftrag abschließen.

## Unterbrechung und Wiederanlauf

Die Zustände liegen ausschließlich ignoriert unter `.local/background-jobs.json`.
Verbindungsabbruch/Neustart markiert aktive Einträge als `outcome-unknown`; es gibt
keinen automatischen Neustart von Agenten oder wiederholte PC-Aktionen.
`subagent.list` prüft bei Rückkehr zur owning Session bzw. über „Status prüfen“ die
bekannten IDs. Lebende Agenten bleiben reserviert. Bei keiner aktiven Instanz wird
der Auftrag als unbestätigtes Ergebnis beendet, niemals als verifizierter Erfolg.
Eine unterbrochene reine Rückmeldung bleibt angehalten, ohne die Gesprächsqueue
als unbekannte PC-Mutation zu sperren. Unteragentenausführung bleibt an Hermes-
Prozess/Session gebunden; lokale Speicherung ist keine Garantie dauerhafter
Ausführung nach einem VPS-Neustart.

## Prüfung

`node --test tests/background-jobs.test.cjs tests/background-main.test.cjs
tests/job-queue.test.cjs` prüft Trennung, zwei Plätze, Desktopkonflikte, Priorität,
Zuständigkeit, frühe/stale Ereignisse, Stopp und Rückmeldungen. Danach `npm.cmd test`.
Der tatsächliche VPS-Test lief mit zwei ungefährlichen Unteragenten gleichzeitig;
der Parent beantwortete währenddessen eine weitere Frage. Die native Prüfung über die bestehende Voice-Session bestätigte zwei
gleichzeitige Kinder, die zusätzliche Parent-Antwort, zwei sichtbare Auftragskarten,
einen gezielten Einzelstopp und getrennte, nach Queue-Abschluss geprüfte
Rückmeldungen. Auch während einer tatsächlich laufenden lokalen Kameraanalyse
blieb die Gesprächsspur frei. Renderer-Prüfungen decken Stoppknöpfe und
Datenschutz ab. Private Ergebnisse bleiben unter `.local/`.
