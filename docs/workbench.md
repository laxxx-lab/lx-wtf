# Lilith Workbench

Der gemeinsame Controller stellt `browserState` und
`controlBrowser({action,url?})` bereit. `state` ist lesend, `navigate` öffnet
die eigene Ansicht nach bestätigtem HTTP(S)-Laden; `back`, `forward`, `reload`
verwenden den vorhandenen Navigationsverlauf. Unbekannte Felder/Aktionen,
Credentials und privilegierte URLs werden abgewiesen, Datenschutz verbirgt
Adresse/Titel. Agenten müssen tatsächliche Adresse, Ladezustand und Sichtbarkeit
prüfen. Native Chrome-/Edge-Profile bleiben unabhängig. Diese Schnittstelle
führt keine beliebigen Seitenskripte aus; Seitenklicks verwenden frische native
Desktopbeobachtungen und Eingabe.

Seit 13.10.2026 heißt die Konsole in der Oberfläche **Zusammenarbeit** (interne Tab-ID weiterhin `console`). Die Auftragseingabe bleibt in allen Bereichen unten erreichbar. **Projekte** oben schaltet die dauerhafte Projektseitenleiste; ausgewählte Ordner, aufklappbare Dateiliste und an Aufträge gebundene Textdateien: [Projektverzeichnis](projects.md). Die interne Browseransicht berücksichtigt Seitenleiste und Eingabehöhe. Auf kleinen Fenstern startet die Seitenleiste geschlossen. Desktop-Hinweise unterstützen zusätzlich vier feste Farben und eine Ellipse am Ziel: [Geführte Hinweise](guided-explanations.md).

Der Artcraft-Fensterstream startet automatisch für das ausgewählte geöffnete Fenster und wird bei erneutem Anzeigen der Werkbank wieder aufgenommen. Metadaten werden ohne Screenshot-Polling alle drei Sekunden geprüft. Ctrl+Alt+Q oder „◎ Einkreisen“ oben öffnet Circle of Interest: Bildschirmbereich markieren, Frage stellen, lokale Bildanalyse und Antwort in derselben Hermes-Session. Details: `docs/circle-interest.md` und `docs/artcraft.md`.

An on-demand resizable window with System, Console, Browser, Context, Project Graph, Intel and Artcraft workspaces. Closing, minimizing or Escape hides the window; opening it again keeps its browser and console state. It uses the existing Hermes session through its parent callbacks.

```js
const {createWorkbench}=require('./workbench.cjs');
const workbench=createWorkbench({
  electron:require('electron'),root:__dirname,
  getSnapshot:()=>snapshot(),
  onCommand:text=>submit(text),
  onAction:async value=>{
    if(value.name==='status')return getStatusReport();
    if(value.name==='standby')return enterStandby();
    if(value.name==='mode')return activateMode(value.id,{submitInstructions:true});
    if(value.name==='highlight-clear')return clearHighlight();
  }
});
// Wire companion button, Ctrl+Alt+W and explicit voice intent in main.cjs.
await workbench.show('system');
await workbench.show('console');
await workbench.show({tab:'browser',url:'https://example.com'});
workbench.toggle();
workbench.hide();
workbench.cycleTab(1); // next; -1 = previous (including native view visibility)
workbench.publish({type:'gesture-state',enabled:true,ready:true,label:'Gesten bereit'});
workbench.publish({type:'user',text:'Mein Auftrag'});
workbench.publish({type:'activity',text:'WindowsMCP.GetState'});
workbench.publish({type:'reply',text:'Aktuelle Antwort'});
workbench.publish({type:'turn-end',status:'complete'});
workbench.destroy(); // app quit, releases embedded webContents and IPC handler
```

`publish` also accepts `tool.start`, `tool.end`, `tool`, `error`, `notice`, `workspace-cycle` with direction, and `open-browser` with URL. Only explicit user browser requests should emit `open-browser`. Typed commands are sent as plain text to `onCommand`; this console is an agent event log and command composer, not a PowerShell terminal. Events retain at most 200 entries and 6,000 characters each. Consecutive streamed reply updates replace the latest reply until another event separates them. Events use `textContent`, never HTML.

`getSnapshot` receives the existing application's snapshot. It projects measured CPU/RAM/GPU/disk values, actual connection and local voice model status, session title, camera/screen/wake status, active mode, safe mode id/name pairs, HUD summary and `systemReport`. For current GPU data supply `sample.gpuTimestamp` as epoch milliseconds. For exact sensor state supply `camera.active` and top-level `wakeArmed`. `systemReport` supports `{text,fresh,ageSeconds,timestamp,metrics,links}`; link states are `online`, `offline` or `unknown`. Missing measurements stay unknown. Raw settings, session IDs, authentication details, device IDs, camera frames, mode programs and mode instructions are not sent to the workbench. Basic secret patterns are redacted from display text; parent publishers should still avoid sending sensitive material.

The IPC channel is `workbench:invoke`, with `(method,payload)`. The preload exposes only `window.workbench.invoke` and `.on`. Every invocation verifies the precise local `ui/workbench.html` top frame and its webContents. Actions allow only `{name:'status'}`, `{name:'standby'}`, `{name:'highlight-clear'}` and `{name:'mode',id}`. Return values from command/action callbacks are not exposed; the view refreshes through the safe snapshot. The renderer can select tabs, hide, request snapshots, compose commands and navigate its browser. Parent integration owns shortcut/voice intent handling and the application lifecycle.

The Browser workspace uses a separate `WebContentsView` in `persist:lilith-workbench-browser`. It starts neutral at `about:blank`; only explicit navigation accepts HTTP/HTTPS without embedded credentials. Browser pages are sandboxed, context-isolated, have no Node integration and no trusted preload. Main navigation, redirects and new frames reject privileged/non-web schemes. Popups, permissions and downloads are denied. Trusted UI navigation and webview attachment are denied. Chrome/Edge cookies and tabs are not integrated. Browser state is retained while hidden and persisted inside the application's Electron user data, independently of the authentication session.

Focused check: `node --test tests/workbench.test.cjs`. The Electron boundary uses a test double; a real Electron smoke check is still needed for native view bounds and visual rendering.

Native integration was subsequently checked in Electron: System and Console
were visually inspected; a local HTTP test page loaded in the real child
WebContentsView, and that page had neither `window.hermes` nor
`window.workbench`. Parent-page screenshots exclude the child browser view;
its own capture confirms page rendering. Current-session connection, local
status/API visibility and wakeword readiness are checked after normal restart.


## Fensterposition und maximierter Zustand

Die normale App speichert die Werkstatt-Geometrie unter `.local/workbench-window.json`: normale Fensterposition/-größe in Electron-DIP, Bildschirm-ID, dessen Arbeitsfläche und den maximierten Zustand. Verschieben und Größenänderungen werden kurz gebündelt gespeichert; Ausblenden, Schließen und Beenden sichern unmittelbar. Minimieren ersetzt den letzten maximierten Zustand nicht. Beim erneuten Öffnen oder App-Neustart erscheint die Werkstatt auf diesem Bildschirm mit derselben Darstellung. Maximieren geschieht erst beim bewussten Öffnen, damit kein verstecktes Fenster unerwartet erscheint. Fehlt der Bildschirm oder ändern sich dessen Maße, werden die Grenzen auf einen vorhandenen Bildschirm angepasst.

`createWorkbench` nimmt optional `stateFile` entgegen. Ohne diese Option bleibt die Factory ohne Dateispeicherung; isolierte Native-Tests verändern damit keine Produktionsgeometrie. Der Smoke-Modus der Haupt-App verwendet eine eigene Datei. Geprüft: echte native Maximierung auf dem zweiten Bildschirm, Ausblenden/Öffnen, Rekonstruktion einer maximierten und einer normalen Fensterinstanz, negative Bildschirmkoordinaten, Entfernen eines Monitors und beschädigte Zustandsdaten. 367 Node-Tests bestanden.
