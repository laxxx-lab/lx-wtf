# Sprachbereitschaft und begrenzte Reparatur

`voice-health.cjs` bewertet ausschliesslich inhaltsfreie Beobachtungen. Der
Helfer oeffnet keine Geraete, fuehrt keine Befehle aus und greift weder auf
Netzwerk noch auf Einstellungen zu. Ein reparierbarer Befund ist ein Vorschlag
an den vorhandenen Hauptprozess, kein Beleg fuer eine ausgefuehrte Reparatur.

## Beobachtungsvertrag

`createVoiceHealth({now = Date.now})` liefert `observe(value)`, `snapshot()`,
`recordRepair(kind)` und `clear()`. `observe` uebernimmt eine vollstaendige
Momentaufnahme und liefert den aktuellen Snapshot. Alle Zeitstempel verwenden
dieselbe Uhr wie `now`, in Millisekunden; kuenftige oder ungueltige Zeitstempel
werden nicht als Beleg angenommen.

| Feld | Inhalt |
| --- | --- |
| `startedAt` | App-Startzeit; sonst gilt die erste Beobachtung als Start. |
| `privacyLocked` | Explizit `false` erlaubt Diagnose; `true` oder unbekannt schuetzt sie. |
| `expectedMicrophone` | Ist ein geoeffneter Eingang derzeit beabsichtigt? |
| `microphoneActive` | Tatsaechlich geoeffneter Eingang, kein gespeicherter Wunsch. |
| `frameCount` | Kumulativer Zaehler echter Mikrofon-PCM-Callbacks, ganze Zahl >= 0. |
| `frameAt` | Zeitpunkt des letzten echten PCM-Callbacks; `null` ohne Beleg. |
| `rendererAt` | Zeitpunkt des inhaltsfreien Renderer-Heartbeats. |
| `audioContextState` | `running`, `suspended`, `closed` oder unbekannt. |
| `connected` | Beobachteter Hermes-Transportzustand, Boolean. |
| `engines` | `{stt,voice,live,vad,wake}`: je Boolean; `live`, `vad`, `wake` duerfen bei nicht benoetigten Prozessen `null` sein oder fehlen. |
| `busy` | Boolean: aktive Vorder-/Hintergrundauftraege und ausstehende Steueraktionen. |
| `speaking` | Boolean: tatsaechlich aktive Wiedergabe. |
| `ttsPending` | Boolean: Sprachausgabe wartet auf PCM. |
| `lastPcmAt` | Letzter beobachteter Ausgabe-PCM-Block, sonst `null`. |
| `repairing` | Boolean: eine bestehende Reparaturaktion laeuft. |
| `capturing`, `transcribing` | Optionale explizite Schutzflags fuer laufende Spracheingabe. |

IDs, Geraetenamen, Gespraechstext, Prompts und uebergebene Zusammenfassungen
werden nicht gespeichert oder projiziert. Der Renderer muss den PCM-Zaehler
auch bei stillen Bloecken erhoehen. Lautstaerke ist kein Bereitschaftsbeleg.
Ein neuer Heartbeat mit unveraendertem Zaehler erneuert den PCM-Beleg nicht.

## Snapshot und Entscheidungen

Die lokale Steuerungs-API zeigt unter `status.live` zusätzlich inhaltsfreie
Renderer-Flags: `captureArmed` (auch bei Stille), `transcribing`,
`awaitingResume`, `vadReady`, `dispatchCurrent`, `inputBusy`,
`inputTtsPending` und `speaking`. Ein offenes Mikrofon oder `active=true`
belegt noch keine laufende Aufnahme. Die Flags enthalten keine Sprachdaten.

Der Snapshot hat `{state,summary,checks,repair}`. `state` ist `ready`,
`starting`, `degraded` oder `private`. Jeder Check besteht ausschliesslich aus
`{key,state,summary}` mit lokal vorgegebenem Text. Die Checks heissen
`renderer`, `microphone`, `audio-output`, `engines`, `gateway`, `speech-output`
und `conversation`; nach einem Versuch kommt `repair` hinzu. Unter
Privatsphaerenschutz gibt es nur den Check `privacy`.

Die Startfrist betraegt zehn Sekunden. Ein frischer Renderer-Heartbeat ist
hoechstens zehn Sekunden alt; Mikrofon-PCM hoechstens fuenf Sekunden. Ein
spaeter bewusst eingeschaltetes Mikrofon bekommt zehn Sekunden fuer seinen
ersten PCM-Beleg. Absichtlich ausgeschaltete Eingabe ist gesund. Ein noch nicht
geoeffneter AudioContext ist ebenfalls gesund, wenn Mikrofon, ausstehende
Sprachausgabe und Wiedergabe explizit aus sind. Eine lange
Modellantwort erscheint als laufender Auftrag; fehlende Tokens allein sind
weder ein Transportfehler noch ein Reparaturgrund. Ausstehende Sprachausgabe
ohne neue PCM-Bloecke seit mindestens 30 Sekunden wird separat sichtbar,
ohne den Modellauftrag neu zu starten.

`repair` ist `null` oder `{kind,reason}`. Ein Vorschlag braucht bekannte
Ruhe (`busy=false`, `speaking=false`, `repairing=false`), keine Aufnahme und
keine Transkription. Die einzigen Arten sind:

- `microphone`: beabsichtigter Eingang fehlt oder liefert keine aktuellen
  Bloecke, bei frischer Renderer-Messung. Die Integration verwendet den
  bestehenden Reconnect desselben ausgewaehlten Geraets.
- `audio-output`: vorhandener AudioContext ist `suspended`, bei frischer
  Renderer-Messung. Die Integration setzt diesen Context fort.
- `engines`: ein erwartetes Modell ist explizit nicht bereit. Die Integration
  benutzt den vorhandenen Start-/Bereitschaftsweg.
- `gateway`: Transport ist explizit getrennt. Erlaubt ist die vorhandene
  Verbindungsanforderung, kein Gateway-Neustart oder Session-Reset.

Die Integration meldet `vad` fuer den erwarteten Silero-Sprachdetektor im Live-
Modus und `wake` fuer den erwarteten Wakeword-Prozess. Ein explizit ausgefallener
benoetigter Prozess verschlechtert die Modellbereitschaft auch bei gesunden
STT-/Sprachausgabe-HTTP-Diensten. Optionale `null`- oder fehlende Prozessfelder
werden ignoriert; `false` benutzt dieselbe begrenzte `engines`-Reparatur.

Unbekannte Modellzustaende autorisieren keinen Modellstart. Ein geschlossener
AudioContext autorisiert kein automatisches Ersetzen. Keine Entscheidung
betrifft Kamera, Bildschirmaufnahme, Sessionwahl, Privatsphaerepraeferenzen
oder Wiederholung eines Auftrags. Die Integration prueft Eigentum und aktuelle
Privatsphaere erneut unmittelbar vor ihrer Wirkung.

## Versuche und Ergebnisbeleg

Unmittelbar vor einer passenden Aktion ruft die Integration
`recordRepair(kind)` auf. Nur der aktuell vorgeschlagene Typ wird akzeptiert;
Rueckgabe `false` bedeutet keine Autorisierung. Danach wird derselbe Typ
30 Sekunden unterdrueckt. Hoechstens drei akzeptierte Versuche insgesamt
duerfen in einem rollenden Fuenf-Minuten-Fenster liegen.

Der Check `repair` bleibt zunaechst `starting`, nach zehn Sekunden ohne Beleg
`degraded`. Erst eine zeitlich spaetere gesunde Beobachtung des reparierten
Bereichs setzt ihn auf `ready`. Beim Mikrofon muss zudem ein echter PCM-Block
nach dem Versuch vorliegen. Eine Ausgabe-Reparatur erfordert tatsaechlich
`audioContextState=running`; weggefallener Audiobedarf reicht nicht. Erfolg der Aktionsfunktion oder eine Modellantwort
reichen dafuer nicht. Die Bestaetigung beschreibt diesen Versuch; eine spaetere
Stoerung bleibt an den normalen Bereitschaftschecks sichtbar.

`clear()` verwirft Messungen, Versuche und Bestaetigung, setzt aber keinerlei
App-Einstellung zurueck. Ohne neue Beobachtung ist der Zustand `starting`.

## Pruefung

`node --test tests/voice-health.test.cjs` prueft Startfrist, stille gesunde
Eingabe, echte Frame-Starvation, Schutz aktiver Aufnahme/Auftraege,
Privatsphaere, begrenzte Versuche, beobachtete Wiederherstellung, ausgefallene
benoetigte VAD-/Wakeword-Prozesse und getrennte
Transport-/Ausgabebefunde. Diese deterministischen Tests belegen keine echte
Windows-Mikrofon- oder Lautsprecherwirkung; dafuer ist zusaetzlich die
interaktive Electron-Pruefung aus `agent-maintenance.md` erforderlich.


## Integration und reale Prüfung

Der Hauptprozess prüft lokale HTTP-Modellbereitschaft höchstens alle zehn
Sekunden, erforderliche Silero-/Wakeword-Bereitschaft und einen inhaltsfreien
Renderer-/Audioblock-Heartbeat. Reparaturen benutzen vorhandene Helfer, die
bestehende Mikrofonwahl und eine unveränderte Session. Kein automatisches
Wiederholen von Aufträgen. Während aktiver Sprache/Arbeit bleiben Reparaturen
zurückgestellt. Der Orb zeigt einen beobachteten Leerlauffehler mit
„SPRACHE PRÜFEN“, die Werkstatt zeigt die einzelnen Prüfungen. „Wieder bereit“
folgt erst auf neue passende Beobachtungen.

Im tatsächlichen Electron/Windows-Test wurde nur der eigene Mikrofonstream
unterbrochen. Die App erwarb denselben gespeicherten Sennheiser-Eingang erneut;
Live und Kamera blieben aus. Ein gezielt beendeter, nach Startargumenten
bestätigter eigener Satzend-Worker wurde wieder gestartet; die Sprachbereitschaft
war nach rund 28 Sekunden wieder bestätigt. Diese begrenzte Reparatur ist kein
Versprechen sofortiger Wiederherstellung oder neuer Systemrechte.
