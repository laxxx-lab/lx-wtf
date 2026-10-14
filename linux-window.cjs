'use strict';
const path=require('node:path');
function linuxWindowBounds(area,expanded,anchor){
  const width=Math.min(expanded?520:190,area.width),height=Math.min(expanded?760:230,area.height);
  return {x:Math.max(area.x,Math.min(anchor?.x??area.x+area.width-width-12,area.x+area.width-width)),y:Math.max(area.y,Math.min(anchor?.y??area.y+area.height-height-12,area.y+area.height-height)),width,height};
}
function createLinuxOrbWindow({BrowserWindow,screen,root,uiSession,onPanel=()=>{}}){
  let expanded=false,anchor;
  const win=new BrowserWindow({...linuxWindowBounds(screen.getPrimaryDisplay().workArea,false),title:'Lilith · Notebook',frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,show:false,webPreferences:{session:uiSession,preload:path.join(root,'linux-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  function setPanel(value){
    const next=value===true;
    if(next&&!expanded)anchor=win.getBounds();
    const base=anchor||win.getBounds(),area=screen.getDisplayMatching(base).workArea;
    expanded=next;win.setBounds(linuxWindowBounds(area,expanded,base));
    win.setAlwaysOnTop(!expanded);win.setSkipTaskbar(!expanded);
    win.webContents.send('linux:event',{type:'panel-state',expanded});onPanel(expanded);
    if(!expanded)anchor=null;else win.focus();
    return {expanded};
  }
  const reposition=()=>{if(win.isDestroyed())return;const base=expanded?anchor:win.getBounds();win.setBounds(linuxWindowBounds(screen.getDisplayMatching(base).workArea,expanded,base));};
  for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,reposition);
  win.on('closed',()=>{for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(event,reposition);});
  return {win,setPanel};
}
module.exports={linuxWindowBounds,createLinuxOrbWindow};
