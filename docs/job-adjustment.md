# Aufträge ausdrücklich korrigieren

`job-adjustment.cjs` erkennt eng begrenzte Hinweise auf eine Änderung:
„Warte, nur das ausgewählte Foto.“, „Doch lieber auf die Soundbar.“ und
„Ändere den laufenden Auftrag: …“. „Stopp“ bleibt beim bestehenden Abbruch;
„Ja“, „Okay“ und „Weiter“ allein ändern keinen Auftrag. Allgemeine Fragen
über Aufträge lösen ebenfalls keine Änderung aus. `jobAdjustmentIntent(text)`
liefert `null` oder `{kind:'amend'|'pause'|'resume',instruction}`. Für Änderungen
ist `instruction` der Text nach dem Korrekturpräfix, höchstens 4.000 Zeichen.
Für „Pausiere den laufenden Auftrag.“ und „Setze den pausierten Auftrag fort.“
ist er leer. Das Erkennen führt selbst keine Aktion aus.

## Noch nicht gesendete Aufträge

```js
const owner = { sessionId, profile };
const original = queue.owned(id, owner);
const changed = original && queue.amendQueued(id, {
  ...owner, text: changedInstructions, title: safeTitle,
  expectedRevision: original.revision,
});
```

`owned(id,{sessionId,profile='default'})` liefert nur für den exakten Besitzer
einen getrennten vollständigen Datensatz; sonst `null`. Er enthält private
Anweisungen und darf nicht in Renderer, allgemeine Logs oder Antworten gelangen.
`list()` und `snapshot()` bleiben die öffentlichen, redigierten Projektionen.

`amendQueued(id,{text,title?,sessionId,profile='default',expectedRevision?})`
ändert ausschließlich `kind:'user'`, `status:'queued'`, `executor:'hermes'`
ohne beanspruchten Lauf oder Remote-Annahme. Fremder Besitzer, fehlende ID,
veraltete Revision, laufender/delegierter Auftrag und unbekannter Ausgang
liefern `null`; ungültige Eingaben werfen. Die bisherigen Text-/Besitzergrenzen
gelten. Titel werden wie bisher redigiert und begrenzt; ohne Titel bleibt der
bisherige erhalten. Anweisungen werden niemals automatisch als Titel benutzt.

ID, Besitzer, Sprach-/App-Einstellungen und Auftragsherkunft bleiben erhalten.
`revision` startet bei 1, erhöht sich pro Änderung und ist zusammen mit
`updatedAt` in sicheren Snapshots sichtbar. Ältere Schema-1-Dateien ohne Revision
werden als Revision 1 geladen; vorhandene Revisionen müssen positive sichere
Ganzzahlen sein. Der bestehende temporäre Dateischreib-/Flush-/Rename-Ablauf
persistiert Text und Revision gemeinsam. Bei Fehler bleibt der alte Datensatz
im Speicher und es wird kein Änderungsereignis veröffentlicht.

Lesen und Ändern sind synchron. Nach einem `await` müssen ID, Besitzer, Status
und Revision neu geprüft werden; `expectedRevision` verhindert die Übernahme
eines veralteten Entwurfs. Gewinnt `claim()` vorher, liefert die Änderung `null`.
Ein bereits erfasster Dispatch-Datensatz darf nach asynchroner Vorbereitung nur
gesendet werden, wenn diese Identität und Revision noch übereinstimmen.

Bei einer laufenden asynchronen Vorbereitung kann der Hauptprozess
`cancelPrepared(id,{sessionId,profile='default',expectedRevision})` benutzen,
nachdem er sicher festgestellt hat, dass noch kein Remote- oder lokaler Lauf
begonnen hat. Die Revision ist hier erforderlich. Die Queue akzeptiert nur den
exakten Besitzer eines laufenden Nutzerauftrags mit Hermes-Executor, ohne
Remote-Annahme oder Runtime-ID. Sie persistiert dann `cancelled`, `verified:false`,
Endzeit und den festen Grund „Vor Ausführung durch Änderung ersetzt.“ gemeinsam.
Andere Zustände/Besitzer/Revisionen liefern `null`; ungültige Eingaben werfen.
Die Queue stellt selbst nicht fest, ob ein Sendeversuch stattgefunden hat. Eine
verzögerte Vorbereitung darf nach dieser Änderung nicht mehr senden.

## Bereits laufende Arbeit

Die Hauptprozessintegration besitzt Unterbrechung und Fortsetzung. Sie stoppt
nur den exakten aktiven Besitzer, hält die neue Fortsetzung mit eigener ID und
`sourceJobId` zunächst in der Warteschlange zurück und gibt sie erst nach
tatsächlicher zugehöriger terminaler Bestätigung frei. Eine bloße Stop-Anforderung, Modellbehauptung oder Verbindung
belegt kein Ende. Unbekannter Ausgang sperrt die Fortsetzung. Pause/Resume müssen
die vorhandene Auftrags-/Queue-Sperre verwenden und beweisen selbst keinen
Remote-Stopp. Der Helfer und die Queue senden oder stoppen nichts.

`adjustmentPrompt(job,instruction)` liefert einen deutschen Fortsetzungstext
unter 20.000 Zeichen. Er benennt den ursprünglichen Titel, ursprünglichen Text
und die Änderung als unvertraute JSON-Daten. Überlanger ursprünglicher Kontext
wird ausdrücklich als gekürzt markiert, auch nach JSON-Escaping. Die Änderung
bleibt erhalten. Der Text verlangt eine neue Beobachtung des tatsächlichen
Zustands vor der verbleibenden Arbeit und verbietet automatisches Wiederholen
oder Rückgängigmachen schon ausgeführter Schritte. Er behauptet kein erfolgreiches
Ergebnis des vorherigen Laufs.
Nur für `job.status === 'queued' && job.acceptedAt === null` oder die ausdrückliche
Aufruferbestätigung `adjustmentPrompt(job,instruction,{neverDispatched:true})`
beschreibt die Einleitung einen unbegonnenen, vor Ausführung ersetzten Auftrag.
Diese Bestätigung darf nur nach tatsächlich nachgewiesener ungesendeter
Vorbereitung verwendet werden, etwa nach gezieltem `cancelPrepared`. Fehlende
Remote-Annahme allein beweist weder einen fehlenden Sendeversuch noch fehlende
Wirkungen: `prompt.submit` könnte noch auf seine Antwort warten. Die normale
Fortsetzung setzt das zuvor tatsächlich bestätigte Ende voraus.

Prüfung: `node --test tests/job-adjustment.test.cjs tests/job-queue.test.cjs`.
Diese Tests belegen Parser, Grenzen, Besitzer, Revisionsrennen, atomare
Persistenz und sichere Projektion; ein echter Hermes-Stopp-/Fortsetzungsversuch
muss die Hauptprozessintegration zusätzlich prüfen.


In der Werkstatt öffnet „Auftrag korrigieren“ das begrenzte Korrekturfeld für
genau die gewählte ID. Sprachbeispiele: „Warte, nur das ausgewählte Foto“,
„Doch lieber auf die Soundbar“ oder „Ändere den laufenden Auftrag: …“.
Bei mehreren möglichen Aufträgen ist eine konkrete Auswahl nötig. Bereits
ausgelöste lokale Standardbefehle lassen sich nicht zurückdatieren; deren
Istzustand prüfen und einen neuen Befehl geben. Änderungen bis 1200 Zeichen.

„Pausiere den laufenden Auftrag“ hält die Queue und fordert den passenden
Vordergrund-Stopp an. „Setze den pausierten Auftrag fort“ erstellt nach geprüftem
Stopp eine Fortsetzung für verbleibende Arbeit. Bei Hintergrundarbeit zuerst den
konkreten Agenten-Endzustand in der Werkstatt prüfen. Pause ist an die Session und
Freigabegeneration gebunden; „Stopp“ bleibt der bisherige Auftragsstopp.

Der native Integrationstest über die bestehende VPS-Session startete einen
harmlosen Python-Warteauftrag und änderte ihn während eines tatsächlichen
Werkzeugaufrufs. Der alte Job war nach bestätigtem Stopp angehalten, bevor die
neue Fortsetzung begann. Die neue Antwort entsprach der Änderung und benutzte
keine weiteren Werkzeuge. Session, Mikrofon, Stimme und Sensorpräferenzen blieben
gleich. Das belegt den echten Stopp-/Fortsetzungsweg, keine beliebige Rücknahme
von bereits ausgeführten Windows-/Fotoänderungen.
