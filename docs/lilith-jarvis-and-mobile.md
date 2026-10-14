# Lilith im Alltag: JARVIS, FRIDAY und Android

Recherche vom 13.10.2026. Referenz sind Tonys Assistenten im Marvel Cinematic Universe; Comicvarianten haben teilweise andere Rollen. Das ist ein Produktentwurf, keine Behauptung, dass Lilith bereits alle beschriebenen Funktionen besitzt.

Zielgerät des Nutzers: **Google Pixel 9 Pro**. Die installierte Android-Version ist noch nicht am Gerät geprüft. Google nennt für dieses Modell 16 GB RAM und sieben Jahre Updates; daraus folgt keine getestete Lilith-/MCP-Kompatibilität. Quelle: [Google zur Pixel-9-Familie](https://blog.google/products-and-platforms/devices/pixel/google-pixel-9-pro-xl/).

## Was die Film-Assistenten leisten

JARVIS verbindet Tonys Umgebung, Werkstatt und Rüstung. Er verarbeitet natürliche Sprache, stellt Informationen visuell und gesprochen dar, unterstützt technische Arbeit und überwacht Systeme. Er ist über verschiedene Oberflächen verfügbar und liefert wichtige Zustandsmeldungen während Tony andere Dinge tut. FRIDAY übernimmt später die Assistenz und unterstützt ebenfalls Rüstungsbetrieb, Analyse und technische Tests. Quellen: [MCU JARVIS](https://marvelcinematicuniverse.fandom.com/wiki/J.A.R.V.I.S.), [MCU FRIDAY](https://marvelcinematicuniverse.fandom.com/wiki/F.R.I.D.A.Y.).

Ein Produktionsentwurf von *Iron Man* zeigt technische Empfehlungen, Diagnosen, Warnungen zum Energiezustand sowie den trockenen Gesprächston zwischen Tony und JARVIS. Der Entwurf ist kein wortgetreues Protokoll des fertigen Films. Quelle: [Marvel-Studios-Drehbuchentwurf von 2007](https://storyfactory.uk/wp-content/uploads/2019/05/1.-Iron-Man.pdf).

In *Civil War* meldet FRIDAY Tonys Nachteil im Nahkampf; Tony beauftragt sie mit einer Musteranalyse, deren Ergebnis unmittelbar in die Steuerung einfließt. Das verdeutlicht ihre Rolle als analysierende und ausführende Partnerin. Quelle: [Filmtranskript](https://www.springfieldspringfield.co.uk/movie_script.php?movie=captain-america-civil-war).

## Ableitung für Lilith

Diese Übertragung ist unsere Produktentscheidung, keine Aussage der Filmquellen:

| Filmprinzip | Nützlicher Alltag bei Patrik | Prüfkriterium |
| --- | --- | --- |
| Gemeinsame Aufmerksamkeit | „Das hier“ bindet Mauspunkt, ausgewählte Datei oder markierten Bereich | Richtige Quelle sichtbar, Wechsel verwirft veraltetes Ziel |
| Kurze kontextbezogene Aufträge | „Kürzer“, „Weiter“, „Nur dieses Foto“ | Bezug eindeutig, erledigte Schritte werden berücksichtigt |
| Assistenz während laufender Arbeit | Rückfragen stellen, während ein größerer Auftrag läuft | Sprache bleibt frei; tatsächlicher Auftrag wird separat geführt |
| Visuelle Hilfe | Farbiges Ziel auf dem Desktop mit „Hier klicken“ | Frische Position, durchklickbar, kein erfundener Klick |
| Werkstattpartner | Projekte/Dateien auswählen, Ergebnisse und Hindernisse zusammen sehen | Auftrag bleibt an seinen gewählten Ordner gebunden |
| Relevante Initiative | Nach Arbeitsstart ausstehende Aufgaben oder passende Fortsetzung anbieten | Nur freigegebener Kontext, kein dauerndes Reinreden |
| Kontinuität über Geräte | Auftrag am PC beginnen, unterwegs verfolgen und präzisieren | Derselbe Auftrag und Verlauf, eindeutiges ausführendes Gerät |
| Persönlicher Gesprächston | Direkt, aufmerksam, gelegentlich trocken; bei Fehlern klar | Hilfreiche Rückmeldung vor dekorativer Animation |

Die „Wow“-Momente werden als komplette Abläufe entwickelt: ausgewählte Nachricht → Antwortentwurf → gesprochene Korrektur; Projekt öffnen → Datei auswählen → gezielter Auftrag; Anwendung erklären → tatsächliche Stelle markieren → nach „Weiter“ frisch beobachten. Holografische Filmtechnik wird durch präzise Desktop-Hinweise und eine ruhige, verständliche Werkstatt ersetzt.

## Android-MCP: zwei tatsächlich unterschiedliche Wege

[CursorTouch Android-MCP](https://github.com/CursorTouch/Android-MCP) ist ein externer MCP-Server mit Python und ADB. Er unterstützt UI-Zustand, Tippen, Wischen und Appbedienung. Android 10+ und eine erreichbare ADB-Verbindung gehören laut Projekt zu den Voraussetzungen. Das eignet sich für einen Test am PC; unterwegs muss der steuernde Rechner das Gerät weiterhin erreichen.

[Android Remote Control MCP](https://github.com/danielealbano/android-remote-control-mcp) läuft auf dem Telefon. Das Projekt beschreibt einen Streamable-HTTP-Endpunkt, Bearer/OAuth-Authentifizierung und Android-Accessibility für UI-Zustand, Aktionen und Screenshots. Für mobile Nutzung müsste der VPS diesen Endpunkt über eine ausdrücklich eingerichtete Verbindung erreichen. Eine Integration in unseren Hermes und das tatsächliche Gerät ist noch nicht geprüft. Keine Installation oder öffentlich erreichbare Steuerung wurde eingerichtet.

Android bietet dafür [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService); Screenshot-Funktionen verlangen die entsprechende deklarierte Fähigkeit und Gerätefreigabe. Eine Aufnahme über [MediaProjection](https://developer.android.com/media/grow/media-projection) hat einen anderen Freigabeablauf. Android-MCP ist ein Werkzeug für den Bot; eine eigene Sprach-/Gesprächsoberfläche kommt zusätzlich dazu.

## Empfehlung: eine kleine native Lilith-App

Patrik ergänzt ein Zorin-Notebook mit eigenem Client und Linux-MCP. Der gemeinsame Geräte-/Auftragsvertrag und die bisher geprüften Zugangsgrenzen stehen im [Mehrgeräte-Entwurf](lilith-multiple-devices.md). Jeder Client soll sein eigenes Mikrofon verwenden; RDP-Mikrofonweitergabe ist ausdrücklich nicht gewünscht.

Drei Aufgaben für Version 1:

1. **Sprechen:** eine große Sprechtaste, kurze Textantwort, Audioausgabe und Abbruch.
2. **Teilen:** Text/Link über das Android-Teilen-Menü an Lilith schicken; Bilder erst nach Entscheidung für einen passenden tatsächlichen Analyseweg.
3. **Aufträge:** Ergebnis oder Hindernis sehen und einen konkreten Auftrag korrigieren/stoppen.

Der bestehende Client besitzt bereits HTTPS/WSS-Gateway-Tickets, Session-Wiederaufnahme und RPC-Ereignisse in `gateway.cjs` und `conversation.cjs`. Diese sind die Ausgangsbasis für die Anmeldung und Ereignisse einer mobilen Oberfläche. Die Job-Queue und PC-Belege liegen derzeit im Windows-Client; sie sind noch kein geräteübergreifender Serververtrag. Vor einer mobilen Implementierung braucht es eine gemeinsame Auftragszuordnung und Serialisierung, damit zwei Geräte keinen widersprüchlichen Turn in derselben Session auslösen. Die lokale Loopback-API mitsamt Token wird nicht als Handy-Endpunkt veröffentlicht.

Die mobile Verbindung soll über den bestehenden VPS laufen. Desktop-Aufträge benötigen einen erreichbaren Windows-Client und aktiven passenden Desktop; ein ausgeschalteter PC arbeitet nicht. Erklärungen und andere VPS-Aufgaben sollen auch ohne laufenden PC nutzbar sein. Android-MCP wird danach optional als Werkzeug für ausdrücklich beauftragte Telefonaktionen ergänzt. Private Netzverbindung oder authentifizierte HTTPS-Anbindung zuerst konkret am Gerät prüfen.

Für die erste Stimme sind Android-Spracherkennung und TTS ein kleiner Einstieg. Qualität, deutsche Sprache und tatsächliche Offline-Verfügbarkeit müssen am konkreten Telefon geprüft werden. Liliths vorhandene geklonte Stimme wird auf Windows erzeugt; dieselbe Klangfarbe auf dem Telefon verlangt einen zusätzlichen erreichbaren TTS-Weg oder ein geeignetes lokales Modell. Sie ist noch nicht für unterwegs nachgewiesen.

Ein dauerhaftes Wakeword kommt später: Android beschränkt Mikrofon-/Kamera-Foreground-Services und ihren Start aus dem Hintergrund. Deshalb planen wir keinen unsichtbaren Dauerhörer. Quelle: [Android Foreground-Service-Typen](https://developer.android.com/develop/background-work/services/fgs/service-types).

## Nächste Geräteprüfung

Telefonmodell/Android-Version, Anmeldung am bestehenden Gateway, Ton am Gerät, Hintergrund-/Display-aus-Verhalten, Netzwechsel WLAN/Mobilfunk und Verbindungsabbruch prüfen. Danach eine konkrete Android-MCP-Verbindung mit einer eigenen Testoberfläche statt einer privaten App erproben. APK, Push, Handybedienung und eine ortsunabhängige gemeinsame Job-Queue sind noch nicht implementiert.
