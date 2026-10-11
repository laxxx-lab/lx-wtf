'use strict';
const NAME='Hermes.Voice.Windows';
function startupSnapshot(app,root){
  const state=app.isReady()?app.getLoginItemSettings({path:process.execPath,args:[root]}):{};
  const item=state.launchItems?.find(value=>value.name===NAME&&value.path===process.execPath&&value.args?.length===1&&value.args[0]===root);
  return {name:NAME,openAtLogin:state.openAtLogin===true,registered:!!item,enabled:state.openAtLogin===true&&item?.enabled===true,executableWillLaunchAtLogin:state.executableWillLaunchAtLogin===true};
}
function syncStartup(app,{root,enabled,smoke}){
  if(smoke||!app.isReady())return null;
  app.setLoginItemSettings({name:NAME,path:process.execPath,args:[root],openAtLogin:enabled===true,enabled:enabled===true});
  return startupSnapshot(app,root);
}
module.exports={syncStartup,startupSnapshot};
