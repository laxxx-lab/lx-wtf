(function(root){
  'use strict';
  function isStandbyRequest(text){
    const clean=String(text||'').toLowerCase().replace(/^[\s,.]*(?:hey\s+)?(?:hermes|lilith|lillis)[\s,.:!-]+/,'').replace(/[.!]+$/,'').trim();
    return /^(?:bitte\s+)?(?:standby|stand-by|geh(?:e)?\s+(?:bitte\s+)?(?:in\s+(?:den\s+)?stand-?by|schlafen)|(?:schalte|stell(?:e)?)\s+(?:bitte\s+)?(?:den\s+)?live(?:-|\s)?modus\s+aus)(?:\s+bitte)?$/.test(clean);
  }
  function compactVoiceRequest(text){
    const value=String(text||'').split('\n')[0].trim();if(!value)return false;
    const positive=value.replace(/\b(?:nicht|kein(?:e)?)\s+(?:(?:lange?|nur|zu)\s+)?(?:schritt\s+für\s+schritt|im\s+detail|erklär\w*|erläuter\w*|ausführlich|kurz|knapp|details)\b/gi,'');
    if(/\b(?:ausführlich|im\s+detail|schritt\s+für\s+schritt)\b/i.test(positive))return false;
    if(/\b(?:erklär(?:e)?|erläutere?|antworte|sage?|fasse|halte)\b(?:\s+(?:mir|das|es|bitte|nur|ganz)){0,4}\s+(?:kurz|knapp)\b(?!-)|\b(?:nur|ganz|bitte)\s+(?:kurz|knapp)\b(?!-)|^(?:kurz|knapp)[.!]?$/i.test(positive))return true;
    return !/\b(?:erklär(?:e|en)?|erläutere?|erläutern|wie\s+funktioniert)\b/i.test(positive);
  }
  function canStreamVoiceAnswer(text){
    const value=String(text||'').trim().replace(/^(?:hey\s+)?(?:hermes|lilith|lillis)[,\s]+/i,'');
    // Streaming is opt-in for conversation. Work and claims about current state wait for completion.
    if(/\b(?:öffne|start\w*|spiele?|pausier\w*|stopp?\w*|schließ\w*|lösch\w*|speicher\w*|verschieb\w*|prüf\w*|such\w*|recherchier\w*|installier\w*|lade|zeig\w*|send\w*|schreib\w*|mach\w*|setze?|ändere?|aktiviere?|deaktiviere?|erledigt|bestätigt|pc|computer|gerät\w*|spotify|datei\w*|programm\w*|kamera|bildschirm|browser|werkstatt|standby|aktuell\w*|gerade|zustand)\b/i.test(value))return false;
    return /^(?:hallo|hi|guten\s+(?:morgen|tag|abend))(?:\s+(?:lilith|hermes|lillis))?[.!?\s]*$/i.test(value)||/^wie\s+geht\s+(?:es\s+)?dir[.!?\s]*$/i.test(value)||/^(?:bitte\s+)?(?:erklär(?:e)?|erläutere?)\b/i.test(value)||/^(?:was\s+(?:ist|sind|bedeutet)|wie\s+(?:funktioniert|entsteht|entstehen))\b/i.test(value);
  }
  function taskAcknowledgement(text,{kind}={}){
    if(typeof text!=='string'||text.length>20000)return null;
    const value=text.split('\n')[0].trim().split(/(?<=[.!?])\s+/)[0].toLocaleLowerCase('de-DE').replace(/^(?:hey\s+)?(?:hermes|lilith|lillis)[,\s]+/,'').replace(/^bitte\s+/,'').replace(/^kannst du (?:bitte )?/,'').replace(/[.!?]+$/,'').trim();
    if(!value||isStandbyRequest(value)||/^(?:stopp?|bitte stoppe|hör auf|ruhe|not[ -]?aus|stoppe alles|alles stoppen|systemstatus)$/.test(value)||/\b(?:nicht|keine?n?|nein)\b/.test(value))return null;
    const phrases={simple:'Okay.',inspect:'Alles klar, ich schaue es mir an.',effort:'Alles klar. Dazu brauche ich einen Moment.'};
    if(!Object.hasOwn(phrases,kind)){
      if(/^ablauf:/.test(value)||/^(?:recherchier\w*|analysier\w*|untersuch\w*|vergleich\w*|bearbeit\w*|verbesser\w*|überarbeit\w*|organisier\w*|erstelle?|schreib\w*|baue?|plane?|berechne?|räume?|such\w*|finde?|artcraft-auftrag)\b/.test(value))kind='effort';
      else if(/^(?:prüfe?|kontrollier\w*|schau\w*)\b/.test(value)||/^(?:erklär\w*|fass\w*|lies|übersetze)\b.*\b(?:fenster|anwendung|app|kopiert\w*|zwischenablage|bild|foto|bildschirm|text|markiert\w*)\b/.test(value)||/^was (?:halte ich|siehst du|ist (?:auf|in) (?:meinem|dem|diesem) (?:bildschirm|fenster))\b/.test(value))kind='inspect';
      else if(/^(?:öffne?|starte?|spiele?|pausier\w*|schließ\w*|stelle?|stell|setze?|schalte?|aktiviere?|deaktiviere?|mach\w*|ton (?:an|aus)|lautstärke)\b/.test(value)||/(?:^|\s)(?:öffnen|starten|abspielen|pausieren|schließen)$/.test(value))kind='simple';
      else return null;
    }
    return {kind,text:phrases[kind]};
  }
  function voicePrompt(text){
    const style='Antworte auf Deutsch, außer wenn ausdrücklich eine andere Sprache gewünscht ist. '+(compactVoiceRequest(text)?'Sprich höchstens ein bis zwei kurze Sätze, auch bei Korrekturen oder Problemen.':'Der Nutzer möchte eine Erklärung; gib die nötigen Details.');
    const storeHint=/\bspotify\b/i.test(String(text))?' Spotify: zuerst Skill spotify-steuerung lesen. Wenn ein App-Start beauftragt oder für die gewünschte Wiedergabe nötig ist: Store-App mit mcp__cua_driver__launch_app {"aumid":"SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"} öffnen; kein Exe-Suchlauf oder SSH-GUI-Start. Pause-, Status- und Erklärungsfragen: keine Wiedergabe starten. Ohne Titelwunsch vorhandene Wiedergabe fortsetzen. Nur für einen ausdrücklich gewünschten Titelstart: Suche mit types:["track"], limit:3 und passendem Titel/Künstler. PC-ID frisch aus spotify_devices action:list. Wenn inaktiv, Transfer mit {"action":"transfer","device_id":"<PC-ID>","play":false} abschließen, dann spotify_playback action:play mit device_id und gesuchten uris. Prüfung mit action:get_state (nicht state): gewünschte URI, PC-Gerät, is_playing und Fortschritt; playback_verified=true bestätigt den geprüften Einzeltrack-Start. Kein blindes Space und keine unbelegten Geräte-/Berechtigungsdiagnosen.':'';
    return '[Hermes Voice: Diese Antwort wird laut gesprochen. Vorgabe nur für diesen Sprachauftrag, keine dauerhafte Präferenz und keine Änderung für Telegram oder andere Textchats. '+style+storeHint+' Bei einfachen Aktionen nach geprüftem Ergebnis genau eine kurze Bestätigung, etwa "Erledigt, Boss." oder "Ich habe XY auf Spotify gestartet." Erfolg nur bei bestätigter Ausführung und aktuellem Soll-Ist-Abgleich, nicht allein bei einem angenommenen Befehl. Wenn ein Programm geschlossen ist oder ein Wiedergabegerät fehlt, benutze die bereits verfügbare Windows-Anbindung selbst zum Öffnen/Aktivieren und prüfe erneut. Kurze Start-Rückmeldungen übernimmt der lokale Client; nicht wiederholen und nicht als ausgeführtes Ergebnis behandeln. Keine Planankündigungen, Ablaufberichte, Selbstrechtfertigungen oder unnötigen Zusatzangebote. Kein "Wenn du willst", wenn die Aktion schon beauftragt ist. Unsicherheit nicht als Diagnose ausgeben; bei einem echten Hindernis kurz den belegten Grund nennen. Rückfragen nur bei fehlender notwendiger Information, kurz und konkret. Wichtige Einschränkungen nicht verschweigen. '+(canStreamVoiceAnswer(text)?'Bei reinen Gesprächsantworten dürfen vollständige natürliche Sätze sofort gesprochen werden. Werkzeugergebnisse, Zustands- und Aktionsbestätigungen erst in der geprüften Abschlussantwort.':'Nur die abschließende Antwort ist zum Vorlesen bestimmt.')+']\n\n'+text;
  }
  const api={isStandbyRequest,compactVoiceRequest,canStreamVoiceAnswer,voicePrompt,taskAcknowledgement};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.VoiceInteraction=api;
})(typeof window==='object'?window:globalThis);
