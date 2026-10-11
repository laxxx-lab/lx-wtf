# Lilith Workbench: Darstellung

Die Workbench ist der gemeinsame Arbeitsraum für die Hermes-Session. Eisblau zeigt laufende Arbeit; warmes Amber zeigt Rückfragen, Fehler oder ein unbekanntes Auftragsergebnis. Die Kopfzeile nennt den Auftrag, den aktuellen Schritt und ob Lilith den Arbeitsbereich präsentiert oder du ihn selbst nutzt.

Eine Agentenpräsentation öffnet ohne Aktivierung, auch beim Wiederherstellen einer
maximierten Windows-Ansicht. Eigene Tastatur-/Mauseingaben, Browserbedienung und
bewusster Fensterfokus übernehmen sie für den Nutzer. Eine spätere Agentenfreigabe
darf sie dann nicht schließen. „Stopp“ gibt eine noch eigene Darstellung sofort
frei, bevor eine ausstehende entfernte Unterbrechung bestätigt wird.

„Zur Aufgabe“ führt zu Artcraft, wenn der laufende Auftrag einer bereits laufenden Anwendung zugeordnet ist. Sonst öffnet es die Konsole. Die Navigation erfolgt auf deinen Klick; eintreffende Werkzeugereignisse wechseln keinen Bereich. Alle sieben Bereiche, das Einkreisen, Datenschutz, Not-Aus, Projektgraph, Lagekarte, Browser und die bestehenden Artcraft-Eingabe- und Lehre-Funktionen bleiben erreichbar.

Die Konsole zeigt neben dem Ereignisverlauf bis zu fünf beobachtete Werkzeugschritte. Die Anzahl beendeter Werkzeuge beschreibt die bereits beobachteten Schritte, ohne eine geschätzte Gesamtfortschrittsquote zu erfinden. Ein beendeter Agent-Turn bleibt von einem unabhängig bestätigten Ergebnis unterscheidbar.

Explizit gelesene Inhalte aus Zwischenablage oder Fenster erscheinen als eingeklappte Quellenkarte in Konsole und Lagebild. Quelle und Lesezeit stehen am Auszug. Der Renderer begrenzt den Text auf 12.000 Zeichen, setzt ihn ausschließlich als Text und kennzeichnet gekürzte Auszüge. Ein neuer Inhalt klappt die Karte wieder ein; Datenschutz leert und verbirgt sie.

Die dunklen Glasflächen verwenden lokale RGBA-Hintergründe. Die Schrift bleibt deckend. `appearance.glass` und `appearance.opacity` aus dem Snapshot steuern den Hintergrund; der Renderer begrenzt dessen Deckkraft auf 90–100 %. Bei deaktiviertem Glas, erhöhtem Kontrast oder fehlendem nativem Material gibt es einen deckenden Hintergrund. Bewegungsreduktion unterbindet CSS-Animationen und Übergänge und wird an die vorhandene Orb-Darstellung weitergegeben.

Die Fenstertitelzeile bleibt verschiebbar, ihre Schaltflächen bleiben bedienbar. Pfeiltasten sowie Home/End wechseln die Tabs, sichtbare Fokusmarkierungen und native `details` bedienen die Quellenkarten. Minimale Fenstergröße, Platzierung auf mehreren Bildschirmen und Maximierung verwaltet weiterhin der Hauptprozess. Der Browser behält seine native Geometrie: obere Chrome 152 px, Werkzeugleiste 38 px, seitlicher Abstand 22 px, Fußzeile 40 px.

Prüfung: `node --test tests/workbench.test.cjs tests/workbench-input.test.cjs tests/artcraft-view.test.cjs` und `tests/workbench-ui.electron.cjs` mit der installierten Electron-Laufzeit. Die Electron-Prüfung läuft unsichtbar mit isolierten Testdaten und zeichnet Bildschirmabbilder unter `.local/workbench-ui-qa/` auf. Sie öffnet keine echte Session, Sensoren oder native Anwendungen. Sie prüft alle sieben Bereiche, Quellen-/Datenschutzverhalten, laufende/abgeschlossene Schritte, Auftragsnavigation, Eingabelabels und Browsergeometrie bei 840×620, 1240×820 sowie 1440×1040.
