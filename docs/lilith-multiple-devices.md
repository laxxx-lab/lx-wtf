# Ein Assistent auf mehreren Geräten

Hermes Voice verbindet eigenständige Windows- und Linux-Clients mit dem eigenen
Hermes. Jeder Client verwendet sein lokales Mikrofon, seine Ausgabe und seinen
Desktopkontext. Eine RDP-Verbindung ersetzt keinen lokalen Linux-Client und
überträgt ohne entsprechende Konfiguration kein Mikrofon. Android ist ein
gesondertes geplantes mobiles Ziel und noch nicht implementiert.

## Aufträge und Gespräche

Ein Auftrag besitzt ein anfragendes und ein festes Zielgerät. Hostname und
Werkzeugstatus werden am tatsächlich verbundenen Gerät ermittelt; Daten des
Gateways gelten nicht als Notebook-Beobachtung. Fehlende oder gesperrte Geräte
bleiben als nicht verfügbar sichtbar, ohne automatischen Ersatzcomputer.

Ein Gespräch kann nach bestätigter Übernahme am anderen Gerät weiterlaufen.
Eine unabhängige neue Session lässt ein anderes Gespräch am bisherigen Gerät
weiterarbeiten. [Übergabevertrag](session-handoff.md) und
[Serverintegration](session-handoff-server.md) beschreiben die Voraussetzungen.
Projekte benötigen pro Gerät eine ausdrücklich gewählte lokale Wurzel; gleiche
Namen synchronisieren keine Dateien und erteilen keine Berechtigung.

## Private Verbindungen

Für den mobilen Zugriff kann ein eigenes Tailscale-Netz verwendet werden. Die
persönlichen Hosts, Adressen, SSH-Benutzer, Schlüssel und Tokens stehen nur in
lokaler Konfiguration. Tailscale-Anmeldung allein schließt bestehende öffentliche
Bindings nicht. Das eigene Gateway, TLS und Zugriffsregeln separat prüfen.

Eine Shell-Verbindung belegt keinen GUI-/Audiozugriff. Desktopwerkzeuge gehören
in die angemeldete grafische Sitzung; Quelle und Wirkung dort frisch prüfen.
Der [Linux-MCP](linux-mcp.md) ist separat einzurichten. Root-Rechte erfordern eine
eigene ausdrückliche Freigabe und werden durch diese Dokumentation nicht erteilt.

## Sprache und Plattformgrenzen

Die [öffentliche Installation](install.md) bietet CPU-Whisper und Piper. Native
GPU-Laufzeiten setzen passende Hardware, Treiber und eigene lokale Modelle
voraus. Mikrofon, Lautsprecher und Unterbrechen müssen am jeweiligen Gerät
geprüft werden; ein HTTP-Healthcheck ist kein Audio-Nachweis.

Zentralisierte Sprache benötigt einen authentifizierten Audio-Transport mit
Abbruch, Datenschutz und Gerätezuordnung. Eine andere Endpunktadresse allein
stellt diesen Vertrag nicht her. Kamera und Bildschirm werden ausdrücklich
ausgewählt; eine Freigabe auf einem Gerät gilt nicht pauschal auf anderen.
