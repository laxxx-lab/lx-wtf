'use strict';
function normalizeIdleStandbyMinutes(value=15){
 if(!Number.isInteger(value)||value<0||value>1440)throw Error('Standby-Zeit muss 0 (aus) oder 1 bis 1440 Minuten sein.');
 return value;
}
function createIdleStandby({now=Date.now}={}){
 let last=now(),revision=0;
 return {get revision(){return revision;},get lastActivity(){return last;},activity(){last=now();revision++;},due(minutes,{eligible=true,busy=false}={}){
  minutes=normalizeIdleStandbyMinutes(minutes);
  if(!eligible||busy){last=now();return false;}
  return minutes>0&&now()-last>=minutes*60000;
 }};
}
module.exports={normalizeIdleStandbyMinutes,createIdleStandby};
