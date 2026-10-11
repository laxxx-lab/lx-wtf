'use strict';
// Local routing uses the displayed user request, never the generated context or observations.
// ponytail: deterministic German intent rules; uncertain/long work gets medium, refine with real misses.
function thinkingForTask(text,{previousEffort='none'}={}){
 const value=String(text||'').split('\n')[0].normalize('NFKC').toLocaleLowerCase('de-DE').trim();
 if(/\b(?:ohne\s+(?:thinking|nachdenken)|thinking\s+(?:aus|abschalten))\b/.test(value))return {effort:'none',reason:'Explizit schnell'};
 if(/\b(?:denk\w*\s+(?:bitte\s+)?(?:gründlich|ausführlich|intensiv)|gründlich\s+nachdenken|prüfe\s+alle\s+möglichkeiten)\b/.test(value))return {effort:'high',reason:'Gründliche Prüfung'};
 if(/^(?:ja[,\s]+)?(?:weiter|mach(?:e)?(?: bitte)? weiter|mach(?:e)?(?: bitte)? das|ja[,\s]+(?:bitte|genau)|ja|okay|ok)[.!?\s]*$/.test(value)&&['medium','high'].includes(previousEffort))return {effort:previousEffort,reason:'Komplexen Auftrag fortsetzen'};
 if(/(?<![\p{L}\p{N}_])(?:analys\w*|repar\w*|debug\w*|fehl\w*|abbruch\w*|abbrich\w*|bricht\w*|warum|weshalb|ursache\w*|vergleich\w*|budget\w*|architektur\w*|plan\w*|programmier\w*|implementier\w*|quellcode|überarbeit\w*|erstell\w*|bearbeit\w*|verbesser\w*|baue?|recherchier\w*|berechn\w*|beweis\w*|argument\w*|optimier\w*|lösche?\w*|lösch\w*|aufräumen|räume?\w*|formatier\w*|deinstallier\w*|registry|registrierung|partition\w*|treiber\w*|administrat\w*)(?![\p{L}\p{N}_])/u.test(value))return {effort:'medium',reason:'Analyse, Planung oder sorgfältige Änderung'};
 if(value.length>280||/\b(?:und dann|anschließend|danach)\b/.test(value))return {effort:'medium',reason:'Mehrteiliger Auftrag'};
 return {effort:'none',reason:'Alltag oder kurzes Gespräch'};
}
module.exports={thinkingForTask};
