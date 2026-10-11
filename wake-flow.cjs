'use strict';
const {matchWakePhrase}=require('./wake-phrase.cjs');
const {speechThreshold}=require('./ui/speech-activity.js');
function wakeDecision(text,enabled,bareNames=true){
  if(!enabled)return null;const match=matchWakePhrase(text,bareNames);if(!match)return null;
  return match.command?{kind:'command',text:match.command}:{kind:'greet',phrase:match.phrase};
}
module.exports={speechThreshold,wakeDecision};
