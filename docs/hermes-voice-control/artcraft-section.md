## Artcraft in der visuellen Werkbank

Patriks zwölf native Artcraft-Editoren sind unter `I:\tools\artcraft\apps` installiert. Werkbank hat jetzt sieben Reiter: System, Konsole, Browser, Lagebild, Projektgraph, Lagekarte und **Artcraft**. Vor Funktionsauskünften diesen aktuellen Skill lesen; alte Chatbeschreibungen können überholt sein.

Über die bestehende Windows-Cua-Shell und die vorhandene lokale Kontrollschnittstelle:

Den Vertrag „Werkbank als Arbeitsfläche“ im Hauptskill verwenden: agentisch ohne Fokuswechsel zeigen, `result.requestId` merken und später ausschließlich dieselbe Darstellung freigeben. Bei Nutzerbesitz dessen Ansicht erhalten.

```powershell
& 'C:\Users\patri\Documents\ChatGPT\Voice\control.ps1' -Action workbench -State on -Agent -Tab artcraft -Reason 'Arbeit in der nativen App'
& 'C:\Users\patri\Documents\ChatGPT\Voice\control.ps1' -Action artcraft
& 'C:\Users\patri\Documents\ChatGPT\Voice\control.ps1' -Action artcraft-select -App photo
& 'C:\Users\patri\Documents\ChatGPT\Voice\control.ps1' -Action artcraft-open -App photo
```

IDs: photo, vector, design, deck, grid, word, cad, light, sound, effect, film, pdf. Aufträge aus dieser Werkbank werden an die ausgewählte bestehende Hermes-Session übergeben. Die eigentliche Dokumentbearbeitung mit dem eingerichteten jeweiligen Artcraft-MCP durchführen; Installation allein bestätigt keinen verbundenen MCP.

**Sichtbare Arbeit braucht dieselbe native GUI-Instanz.** Ein getrenntes Headless-Dokument nicht als Änderung im geöffneten Fenster ausgeben. Ermittelt wurde: alle GUI-Kanäle verwenden lokalen TCP, MCP stdio. Keine HTTP-/SSE-Weboberfläche erfinden, keine EXE-Datei als Browserseite laden. Ports aus tatsächlicher GUI-Konfiguration verwenden, nicht die kollidierenden README-Beispielports raten. VectorCraft ohne explizites `--connect` kann auf Headless ausweichen. PdfCrafts GUI-Control-Protokoll ersetzt nicht automatisch eine MCP-Live-Anbindung.

Bei vorhandener GUI-Control-Verbindung kann deren Kanal mit `-Action artcraft-link -App <ID> -Port <tatsächlicher Port>` lokal registriert werden. Photo braucht zusätzlich `-TokenFile '<absoluter lokaler Pfad der GUI-Token-Datei>'`; Pdf verwendet stattdessen `-EndpointFile '<absoluter lokaler Endpoint-Dateipfad>'`. Niemals Schlüssel ausgeben, im Chat übertragen oder Datei-Inhalte an den VPS senden. Nur lokale Dateipfade registrieren. Registrierung verändert keine Hermes-MCP-Konfiguration und startet keine zweite Headless-Instanz.

Die Werkbank bietet echte Vorschau auf Anfrage und optional Live, gemeldete Dokument-/Werkzeugdaten und erkannte Werkzeugereignisse. „Live verbunden“ heißt erreichbarer GUI-Control-Kanal, nicht erfolgreich ausgeführter Auftrag. `artcraft` liefert zuletzt geprüften Status ohne Bilder. Wenn GUI-Control fehlt, kurz benennen und die konkrete Live-Verbindung einrichten; laufende Nutzerdokumente nicht ungefragt schließen. In Voice für einfache Aufgaben eine kurze geprüfte Bestätigung geben.
