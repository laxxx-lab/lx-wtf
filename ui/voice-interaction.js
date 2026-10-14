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
    // Conversation may speak complete sentences early. Mixed tasks and current-state claims stay buffered.
    if(value.split(/[.!?;:\n,]|\b(?:und|danach|anschließend)\s+/iu).some(clause=>taskAcknowledgement(clause)))return false;
    if(/(?<![\p{L}\p{N}_])(?:lies|übersetz\p{L}*|beend\p{L}*|zwischenablage|markiert\p{L}*|fenster|anwendung)(?![\p{L}\p{N}_])/iu.test(value))return false;
    if(/(?<![\p{L}\p{N}_])(?:öffne\p{L}*|start\p{L}*|(?:ab)?spiel\p{L}*|pausier\p{L}*|stopp?\p{L}*|schließ\p{L}*|lösch\p{L}*|speicher\p{L}*|verschieb\p{L}*|prüf\p{L}*|such\p{L}*|recherchier\p{L}*|installier\p{L}*|deinstallier\p{L}*|formatier\p{L}*|reparier\p{L}*|bearbeit\p{L}*|verbesser\p{L}*|erstell\p{L}*|analysier\p{L}*|lade|zeig\p{L}*|send\p{L}*|schreib\p{L}*|mach\p{L}*|setz\p{L}*|änder\p{L}*|aktivier\p{L}*|deaktivier\p{L}*|wechsel\p{L}*|wechsle|schalt\p{L}*|stell\p{L}*|verbind\p{L}*|trenn\p{L}*|koppl\p{L}*|räum\p{L}*|aufräum\p{L}*|fahr\p{L}*|herunterfahr\p{L}*|runterfahr\p{L}*|wähl\p{L}*|erledigt|bestätigt|pc|computer|rechner|gerät\p{L}*|spotify|datei\p{L}*|programm\p{L}*|app\p{L}*|kamera|bildschirm|browser|werkstatt|standby|aktuell\p{L}*|gerade|zustand|fehlermeldung|timer|wecker|lautstärke|soundbar|headset|kopfhörer)(?![\p{L}\p{N}_])/iu.test(value))return false;
    return /^(?:hallo|hi|guten\s+(?:morgen|tag|abend))(?:\s+(?:lilith|hermes|lillis))?[,!?\s]*(?:(?:bist\s+du\s+da|hörst\s+du\s+mich)[.!?\s]*)?$/i.test(value)||/^wie\s+geht\s+(?:es\s+)?dir[.!?\s]*$/i.test(value)||/^(?:bitte\s+)?(?:erklär(?:e)?|erläutere?|erzähl(?:e)?)\b/i.test(value)||/^(?:kannst|könntest)\s+du\s+(?:mir\s+)?(?:(?:bitte|kurz|ausführlich)\s+){0,3}(?:erklären|erläutern|erzählen)\b/i.test(value)||/^(?:was\s+(?:ist|sind|bedeutet|hältst\s+du\s+von|denkst\s+du\s+über)|wie\s+(?:funktioniert|entsteht|entstehen)|warum|wieso|weshalb)\b/i.test(value)||/^(?:ich\s+(?:bin|fühle\s+mich|hatte\s+(?:heute\s+)?(?:einen?|eine)|habe\s+(?:heute\s+)?(?:einen?|eine))|mir\s+geht\s+es|lass\s+uns\s+über)\b/i.test(value);
  }
  function taskAcknowledgement(text,{kind}={}){
    if(typeof text!=='string'||text.length>20000)return null;
    const value=text.split('\n')[0].trim().split(/(?<=[.!?])\s+/)[0].toLocaleLowerCase('de-DE').replace(/^(?:hey\s+)?(?:hermes|lilith|lillis)[,\s]+/,'').replace(/^bitte\s+/,'').replace(/^kannst du (?:bitte )?/,'').replace(/[.!?]+$/,'').trim();
    if(!value||isStandbyRequest(value)||/^(?:stopp?|bitte stoppe|hör auf|ruhe|not[ -]?aus|stoppe alles|alles stoppen|systemstatus)$/.test(value)||/\b(?:nicht|keine?n?|nein)\b/.test(value))return null;
    const phrases={simple:'Okay.',inspect:'Alles klar, ich schaue es mir an.',effort:'Alles klar. Dazu brauche ich einen Moment.'};
    if(!Object.hasOwn(phrases,kind)){
      if(/^(?:was (?:steht|ist|siehst du).*\b(?:screenshot|bild|foto)\b|(?:dieses|das) (?:bild|foto|screenshot) (?:analysieren|erklären))/.test(value))kind='inspect';
      else if(/^(?:wechsle|wechsele|wechsel|nutze|benutze|verwende|verbinde|trenne|kopple|koppele|bluetooth (?:an|ein|aus)|audio auf|ton auf|sound auf)\b/.test(value))kind='simple';
      else if(/^ablauf:/.test(value)||/^(?:recherchier\w*|analysier\w*|untersuch\w*|vergleich\w*|bearbeit\w*|verbesser\w*|überarbeit\w*|organisier\w*|erstelle?|schreib\w*|baue?|plane?|berechne?|räume?|such\w*|finde?|artcraft-auftrag)\b/.test(value))kind='effort';
      else if(/^(?:prüfe?|kontrollier\w*|schau\w*)\b/.test(value)||/^(?:erklär\w*|fass\w*|lies|übersetze)\b.*\b(?:fenster|anwendung|app|kopiert\w*|zwischenablage|bild|foto|bildschirm|text|markiert\w*)\b/.test(value)||/^was (?:halte ich|siehst du|ist (?:auf|in) (?:meinem|dem|diesem) (?:bildschirm|fenster))\b/.test(value))kind='inspect';
      else if(/^(?:öffne?|starte?|spiele?|pausier\w*|schließ\w*|stelle?|stell|setze?|schalte?|aktiviere?|deaktiviere?|mach\w*|ton (?:an|aus)|lautstärke)\b/.test(value)||/(?:^|\s)(?:öffnen|starten|abspielen|pausieren|schließen)$/.test(value))kind='simple';
      else return null;
    }
    return {kind,text:phrases[kind]};
  }
  function isLocalConversationRequest(text){
    if(typeof text!=='string'||text.length>1200||!canStreamVoiceAnswer(text))return false;
    // Session memory, current facts and references to prior work belong to Hermes.
    return !/(?<![\p{L}\p{N}_])(?:mein\p{L}*|unser\p{L}*|erinner\p{L}*|vorhin|vorher|zuletzt|letzt\p{L}*|heute\s+(?:passiert|geschehen|für)|uhrzeit|datum|wochentag|news|nachrichten|wetter|preis\p{L}*|kontostand|auftrag\p{L}*|fortschritt|änderung\p{L}*|das\s+ergebnis)(?![\p{L}\p{N}_])/iu.test(text);
  }
  function isBackchannel(text){
    return typeof text==='string'&&!text.includes('?')&&/^(?:mhm|hm|aha|ach\s+so|verstehe)[.!\s]*$/i.test(text.trim());
  }
  function localAnswerAllowed(text){
    if(typeof text!=='string'||!text.trim())return false;
    return !/(?:\b(?:ich|wir)\s+(?:habe[n]?|hab[e]?|haben|werde[n]?)\b[^.!?]{0,180}(?:geöffnet|gestartet|abgespielt|gelöscht|gespeichert|verschoben|verbunden|umgeschaltet|ausgeschaltet|eingeschaltet|installiert|bearbeitet|erledigt|geprüft)|\balles\s+erledigt\b|\b(?:musik|spotify|kamera)\s+(?:läuft|ist\s+(?:an|aus))\b)/iu.test(text);
  }
  function voicePrompt(text){
    const style='Antworte auf Deutsch, außer wenn ausdrücklich eine andere Sprache gewünscht ist. '+(compactVoiceRequest(text)?'Sprich höchstens ein bis zwei kurze Sätze, auch bei Korrekturen oder Problemen.':'Der Nutzer möchte eine Erklärung; gib die nötigen Details.');
    const storeHint=/\bspotify\b/i.test(String(text))?' Spotify: zuerst Skill spotify-steuerung lesen. Wenn ein App-Start beauftragt oder für die gewünschte Wiedergabe nötig ist: Store-App mit mcp__cua_driver__launch_app {"aumid":"SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"} öffnen; kein Exe-Suchlauf oder SSH-GUI-Start. Pause-, Status- und Erklärungsfragen: keine Wiedergabe starten. Ohne Titelwunsch vorhandene Wiedergabe fortsetzen. Nur für einen ausdrücklich gewünschten Titelstart: Suche mit types:["track"], limit:3 und passendem Titel/Künstler. PC-ID frisch aus spotify_devices action:list. Wenn inaktiv, Transfer mit {"action":"transfer","device_id":"<PC-ID>","play":false} abschließen, dann spotify_playback action:play mit device_id und gesuchten uris. Prüfung mit action:get_state (nicht state): gewünschte URI, PC-Gerät, is_playing und Fortschritt; playback_verified=true bestätigt den geprüften Einzeltrack-Start. Kein blindes Space und keine unbelegten Geräte-/Berechtigungsdiagnosen.':'';
    const bluetoothHint=/\bbluetooth\b/i.test(String(text))?' Bei ausdrücklich gewünschten Bluetooth-Aktionen zuerst Skill hermes-voice-control frisch lesen und dessen bluetooth-devices / bluetooth-API verwenden. Gerät eindeutig anhand aktueller Endpunkt-ID auswählen. Kein Dienst-/Treiber-Neustart, keine Kopplung entfernen, keine PIN erraten. Erfolg nur bei result.verified=true. Für reine Wissensfragen keine Geräteaktion durchführen.':'';
    return '[Hermes Voice: Diese Antwort wird laut gesprochen. Vorgabe nur für diesen Sprachauftrag, keine dauerhafte Präferenz und keine Änderung für Telegram oder andere Textchats. '+style+storeHint+bluetoothHint+' Bei einfachen Aktionen nach geprüftem Ergebnis genau eine kurze Bestätigung, etwa "Erledigt, Boss." oder "Ich habe XY auf Spotify gestartet." Erfolg nur bei bestätigter Ausführung und aktuellem Soll-Ist-Abgleich, nicht allein bei einem angenommenen Befehl. Wenn ein Programm geschlossen ist oder ein Wiedergabegerät fehlt, benutze die bereits verfügbare Windows-Anbindung selbst zum Öffnen/Aktivieren und prüfe erneut. Kurze Start-Rückmeldungen übernimmt der lokale Client; nicht wiederholen und nicht als ausgeführtes Ergebnis behandeln. Keine Planankündigungen, Ablaufberichte, Selbstrechtfertigungen oder unnötigen Zusatzangebote. Kein "Wenn du willst", wenn die Aktion schon beauftragt ist. Unsicherheit nicht als Diagnose ausgeben; bei einem echten Hindernis kurz den belegten Grund nennen. Rückfragen nur bei fehlender notwendiger Information, kurz und konkret. Wichtige Einschränkungen nicht verschweigen. '+(canStreamVoiceAnswer(text)?'Bei reinen Gesprächsantworten dürfen vollständige natürliche Sätze sofort gesprochen werden. Werkzeugergebnisse, Zustands- und Aktionsbestätigungen erst in der geprüften Abschlussantwort.':'Nur die abschließende Antwort ist zum Vorlesen bestimmt.')+']\n\n'+text;
  }
  const api={isStandbyRequest,compactVoiceRequest,canStreamVoiceAnswer,isLocalConversationRequest,isBackchannel,localAnswerAllowed,voicePrompt,taskAcknowledgement};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.VoiceInteraction=api;
})(typeof window==='object'?window:globalThis);
