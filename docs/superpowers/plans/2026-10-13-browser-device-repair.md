# Browser und Gerätezugriff reparieren

Nutzerauftrag: Auf beiden Systemen Browser/Werkstatt bedienen und Öffnung
bestätigen, Notebook-Zugriff statt falscher Behauptung fehlender Werkzeuge;
„ich will wieder auf dem gaming pc arbeiten“ muss wirklich übergeben.

Belege: aktive Hermes-Session sieht 149 Tools einschließlich Cua (61) und
lilith-zorin (10). Lokaler Cua-Daemon antwortet; direkter Edge-CDP-Lesezugriff
scheitert mit browser_consent_required. Keine Sicherheits-/Profiländerung als
Reparatur. Linux hatte keinen Agentenweg zur eigenen Werkstatt. URL/Titel der
Werkstatt waren im lokalen Agentenstatus nicht prüfbar.

## Gemeinsamer Vertrag

- Workbench-Controller `browserState` liefert echte Metadaten: ready, url,
  title, loading, visible, tab; Datenschutz gibt keine Seite preis.
- Controller `controlBrowser({action,url?})`: state/navigate/back/forward/reload,
  geschlossene Nutzlast und bestehende HTTP(S)-Validierung. Navigation zeigt
  ausdrücklich den Browser, Änderungen an Benutzerprofilen/Cookies gibt es nicht.
  Keine freie JavaScript-, Shell- oder DOM-Ausführung. Nach Aktion frische Metadaten
  zurück; Ladefehler oder verdeckte/nicht bestätigte Seite niemals Erfolg nennen.
- Lokale API `GET /v1/browser`, `POST /v1/browser` mit denselben Aktionen;
  vorhandene Bearer-/Origin-/Privacy-Grenzen erhalten. Windows `control.ps1
  -Action browser` und `-Operation navigate -Url ...` verwendet diesen Weg.
- Windows-Status ergänzt Workbench-Tab/Browsermetadaten. Linux bietet denselben
  begrenzten Controller über vorhandene createControlApi; Loopback 8874,
  private .local/linux-control.json {url,token,pid}, Modus0600. Nur status,
  workbench und browser freigeben (`enabledActions` auf sharedAPI optional).

## Linux-MCP / Modellzuordnung

- Bestehender authentifizierter Linux-MCP bekommt lilith_status,
  lilith_workbench und lilith_browser. Private App-Token nur lokal im Speicher;
  feste Loopbackadresse, keine URL-/Headersteuerung durch Modell, fehlende App
  klar melden. Native Chrome/Edge weiterhin Screenshot/Eingabe und shell_run;
  Systemdaten über system_status. Kein VPS- oder Windows-Fallback.
- Linux-Gerätekontext nennt tatsächlich bereitgestellte Toolnamen und verlangt
  Werkzeugbeobachtung statt Behauptung „kann nichts“. Beide Skills erklären
  eigenständigen Browser, Native-UI-Ersatz für verweigerten CDP und Ergebnisprüfung.

## Prüfung und Aktivierung

- TDD fokussierter gemeinsamer Browserstatus/API/Privacy/URL-Vertrag, Linux
  Loopback/MCP-Auth/keine Tokenausgabe und Gerätezuordnung; voller Node-Test und
  Python-MCP-Test. Native Browserseite/navigation in beiden Clients prüfen.
- Gaming-Wechsel bereits rot/grün im gemeinsamen Parser: alle Alias-/Ablehnungs-
  und Main/Linus-Routen getestet; kombinierter voller Test bestanden.
- Eigene Clients/MCP erst bei bestätigtem Leerlauf aktualisieren; Einstellungen,
  Session, Voice-Präferenzen bewahren. Kein Gateway-/Modellrestart, kein Commit/Push.
- Chrome/Edge-Zugriff über bestehenden Desktopweg prüfen; verweigerter CDP bleibt
  transparent, keine automatische Freigabe oder neue Browserprofile.
