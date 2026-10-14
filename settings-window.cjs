'use strict';
function clampBounds(bounds,area){
 const width=Math.min(bounds.width,area.width),height=Math.min(bounds.height,area.height);
 return {x:Math.round(Math.max(area.x,Math.min(bounds.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))),width,height};
}
// Resize the existing audio owner. No reload, new renderer or microphone.
function createSettingsWindowView(win,screen,onChange=()=>{},{getSkipTaskbar=()=>true}={}){
 let remembered=null;
 function reposition(){if(!remembered)return;const area=screen.getDisplayMatching(win.getBounds()).workArea;
  win.setBounds(clampBounds({x:area.x+(area.width-1000)/2,y:area.y+(area.height-780)/2,width:1000,height:780},area));
 }
 function set(open){
  if(open===Boolean(remembered))return {open};
  if(open){remembered={bounds:win.getBounds(),top:win.isAlwaysOnTop?.()===true,skip:getSkipTaskbar()===true};reposition();win.setAlwaysOnTop(false);win.setSkipTaskbar(false);}
  else{const saved=remembered;remembered=null;win.setBounds(clampBounds(saved.bounds,screen.getDisplayMatching(saved.bounds).workArea));win.setAlwaysOnTop(saved.top);win.setSkipTaskbar(saved.skip);}
  onChange(open);return {open};
 }
 return {set,reposition,get active(){return Boolean(remembered);}};
}
module.exports={createSettingsWindowView};
