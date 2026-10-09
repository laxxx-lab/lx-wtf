'use strict';
function matchWakePhrase(text,bareNames=true){
  if(typeof text!=='string')return null;
  const tokens=[...text.matchAll(/[\p{L}]+/gu)];if(!tokens.length)return null;
  let index=0,hey=false;
  if(tokens[0][0].toLowerCase()==='hey'){hey=true;index=1;}
  if(!tokens[index]||(!hey&&!bareNames))return null;
  const word=tokens[index][0].toLowerCase();
  // Observed German Whisper spellings of the requested spoken name "Lillis".
  const name=word==='hermes'?'Hermes':['lilith','lillith','liliths'].includes(word)?'Lilith':['lillis','lilis','lilies','lelys'].includes(word)?'Lillis':null;
  if(!name||(!hey&&name==='Hermes'))return null;
  const end=tokens[index].index+tokens[index][0].length;
  return {phrase:(hey?'Hey ':'')+name,command:text.slice(end).replace(/^[\s,.!?:;–—-]+/,'').trim()};
}
function isWakeRequestCurrent(request,current){return current.enabled===true&&current.connected===true&&!current.busy&&!current.speaking&&request.generation===current.generation&&request.sessionId===current.sessionId;}
module.exports={matchWakePhrase,isWakeRequestCurrent};
