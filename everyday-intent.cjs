'use strict';
function everydayIntent(text,{now=Date.now()}={}){
 const numberWords={ein:1,eine:1,einen:1,eins:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwölf:12,fünfzehn:15,zwanzig:20,dreißig:30};
 const v=String(text||'').normalize('NFKC').trim().replace(/^(?:hey\s+)?(?:hermes|lilith|lillis)[,\s]+/i,'').replace(/^bitte /i,'').replace(/[.!]$/,'').replace(/\b(ein|eine|einen|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|fünfzehn|zwanzig|dreißig) (?=sekunden?|minuten?|stunden?)/gi,(all,n)=>numberWords[n.toLocaleLowerCase('de-DE')]+' ');
 if(/\b(?:nicht|niemals|vielleicht)\b/i.test(v))return null;
 const seconds=(n,unit)=>Number(n)*(/sekund/i.test(unit)?1:/minut/i.test(unit)?60:3600);
 let m=/^(?:erinnere mich|erinner mich) in (\d{1,4}) (sekunden?|minuten?|stunden?) (?:an|daran[, ]*) (.+)$/i.exec(v);
 if(m){const delay=seconds(m[1],m[2]);return delay>0&&delay<=86400&&m[3].length<=500?{type:'reminder',command:{action:'create',kind:'reminder',text:m[3],at:new Date(now+delay*1000).toISOString()}}:null;}
 m=/^(?:stelle|stell|starte) (?:einen |den )?(?:timer|wecker) (?:auf|für|in) (\d{1,4}) (sekunden?|minuten?|stunden?)$/i.exec(v);
 if(m){const delay=seconds(m[1],m[2]);return delay>0&&delay<=86400?{type:'reminder',command:{action:'create',kind:'alarm',text:'Timer ist abgelaufen.',at:new Date(now+delay*1000).toISOString()}}:null;}
 m=/^(?:fahre|fahr) (?:den |meinen )?(?:pc|computer|rechner) in (\d{1,4}) (sekunden?|minuten?|stunden?) herunter$/i.exec(v);
 const restart=/^(?:starte|start) (?:den |meinen )?(?:pc|computer|rechner) in (\d{1,4}) (sekunden?|minuten?|stunden?) neu$/i.exec(v);
 if(m||restart){const a=m||restart,delay=seconds(a[1],a[2]);return delay>=30&&delay<=86400?{type:'power',command:{action:m?'shutdown':'restart',delaySeconds:delay}}:null;}
 if(/^(?:brich|breche) (?:das |den )?(?:herunterfahren|neustart|power.?timer) ab$/i.test(v))return {type:'power',command:{action:'cancel'}};
 m=/^(?:wechsle|wechsel|schalte) (?:zum|auf(?: das| den)?) (.+(?:mikrofon|microphone|headset))$/i.exec(v);
 if(m)return {type:'microphone',target:m[1]};
 return null;
}
module.exports={everydayIntent};
