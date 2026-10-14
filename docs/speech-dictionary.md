# Bearbeitbares Erkennungswörterbuch

Das Wörterbuch korrigiert fest eingetragene Fehlerformen nach der Spracherkennung.
Es trainiert kein Modell, ergänzt keine geratenen Wörter und erzeugt keine
Befehle. Die Standardliste ist leer.

## Benutzung

1. In den Einstellungen unter **Erkennungswörterbuch** einen Begriff hinzufügen.
2. Die gewünschte Schreibweise und nur tatsächlich beobachtete Fehlerformen
   eintragen. Mehrere Formen durch Komma oder Zeilenumbruch trennen.
3. Einen erkannten Satz in der lokalen Vorschau prüfen. Darunter stehen der
   korrigierte Satz und die einzelnen Ersetzungen. Der Vorschautext wird nicht
   an Hermes oder einen Sprachdienst gesendet.
4. Die allgemeinen Einstellungen speichern. Die Einträge gelten für neue
   Spracherkennungsergebnisse; frühere Gesprächszeilen bleiben erhalten.

Bis zu 100 Begriffe sind erlaubt, jeweils mit bis zu 10 Fehlerformen und
höchstens 80 Zeichen pro Begriff oder Form. Ein Begriff ohne Fehlerformen
löst keine Korrektur aus. Leere, unvollständige Zeilen müssen ausgefüllt oder
entfernt werden, bevor gespeichert werden kann.

Enthält eine Fehlerform selbst ein Komma, wird sie in doppelte
Anführungszeichen gesetzt. Doppelte Anführungszeichen innerhalb einer solchen
Form werden verdoppelt. Beim Laden übernimmt der Editor diese Darstellung
automatisch. Nicht geschlossene Anführungszeichen werden als Fehler angezeigt.

## Korrekturregeln

- Nur explizit gespeicherte Formen passen. Groß-/Kleinschreibung wird beim
  Vergleich ignoriert; als Ersatz erscheint die gewünschte Schreibweise.
  Eine ausdrücklich eingetragene Form wie „lightcraft“ kann dadurch auch die
  Schreibweise „LightCraft“ herstellen. Bereits korrekt geschriebene Treffer
  zählen nicht als Änderung.
- Buchstaben einschließlich Umlauten und ß, Zahlen, Unterstriche und
  kombinierende Unicode-Zeichen bilden Wortgrenzen. Ein Eintrag ersetzt daher
  keinen Ausschnitt innerhalb eines anderen Wortes. Bindestriche und übrige
  Satzzeichen begrenzen Wörter; Satzzeichen außerhalb eines Treffers bleiben
  erhalten.
- Wortgruppen passen wörtlich, einschließlich ihrer inneren Leerzeichen und
  Satzzeichen. Es gibt keine unscharfe Suche, Aussprachevermutung oder
  automatische Gleichsetzung von ß und ss.
- An derselben Stelle gewinnt die längste passende Form. Der Text wird einmal
  von links nach rechts verarbeitet. Bereits eingefügter Text wird nicht
  erneut korrigiert.
- Dieselbe Fehlerform für verschiedene Begriffe, doppelte Begriffe und Regeln,
  die einen Zielbegriff erneut verändern könnten, werden beim Speichern
  abgelehnt. Steuerzeichen und unsichtbare Formatierungszeichen sind ungültig.
- Das ursprüngliche Erkennungsergebnis und die angewendeten Ersetzungen bleiben
  für die sichtbare Korrektur erhalten. Texteingaben und bestehende
  Wake-Aliase verwenden ihren bisherigen Ablauf.

## Technische Schnittstelle

`speech-dictionary.cjs` hat keine externen Abhängigkeiten. Es exportiert unter
Node.js und als klassisches Browserskript dieselbe API:

```js
normalizeSpeechDictionary(values = [])
// -> [{ word: 'Gewünschte Schreibweise', heardAs: ['beobachtete Form'] }]
// Ungültige Eingaben werfen einen Fehler; bestehende Werte werden nicht verändert.

applySpeechDictionary(text, entries = [])
// -> { text: 'korrigierter Text', changes: [{ from: 'Form', to: 'Begriff' }] }
// Die Übergabe des Rohtexts bleibt unverändert und muss vom Aufrufer aufbewahrt werden.
```

Beim Laden werden die Einträge in NFC normalisiert, außen beschnitten und
innere Leerraumfolgen auf ein Leerzeichen reduziert. Das Rohtranskript wird
nicht pauschal normalisiert. Gleichwertige doppelte Fehlerformen innerhalb
eines Begriffs werden entfernt.

Im Renderer wird zuerst `../speech-dictionary.cjs`, dann
`speech-dictionary.js` geladen. `speech-dictionary.css` gestaltet den Editor.

```js
const editor = window.SpeechDictionaryEditor.mount(container, { onChange() {} });
editor.set(entries);       // Prüft und lädt gespeicherte Werte.
editor.value();            // Prüft den aktuellen Entwurf; Fehler erscheinen im Editor.
editor.destroy();          // Entfernt die Darstellung bei Bedarf.
```

`onChange()` meldet Änderungen an den Wörterbuchzeilen; die Vorschau allein
verändert keine Einstellung. Die Prüfung erfolgt im Editor und erneut an der
Speichergrenze. Wörter und Vorschautexte werden ausschließlich über
`textContent` beziehungsweise Feldwerte dargestellt.

## Prüfung

```powershell
node --test tests/speech-dictionary.test.cjs tests/speech-dictionary-editor.test.cjs
```

Die Verhaltenstests prüfen Grenzen, Mehrdeutigkeit, Kaskaden, längere
Treffer, wörtliche Regex-/HTML-Zeichen und die unveränderte Rohtextübergabe.
Ein zusätzlicher Test öffnet einen verborgenen, getrennten Electron-Renderer
mit eigenem temporären Profil. Er prüft echte DOM-Felder, Hinzufügen und
Entfernen, sichtbare Fehler, die Vorschau, Kommas/Anführungszeichen und die
Breite der Einstellungsspalte. Netzwerkzugriffe und Berechtigungen sind in
diesem Test gesperrt; die laufende Lilith-App wird nicht verändert. Ohne die
vorhandene lokale Electron-Testlaufzeit wird nur dieser Renderer-Test
übersprungen.

## Englische Aussprache in der Ausgabe · 13.10.2026

Wakeword/Wake-Word und Wakewords/Wake-Words bekommen erst an der gemeinsamen TTS-Anfrage die phonetischen Formen „Weik Wörd“ bzw. „Weik Wörds“. Das approximiert die englische Aussprache mit dem deutschen Sprachmodell. Angezeigter Text, Erkennungswörterbuch, Aktivierungswörter und Referenzstimme bleiben unverändert. Die Anfrage ist mit einer Regression geprüft; korrekter Höreindruck braucht zusätzlich echte Wiedergabe.
