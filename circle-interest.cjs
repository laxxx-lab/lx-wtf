'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
function selectionPixels(region,size){
 const keys=['x','y','width','height'];
 if(!region||Array.isArray(region)||Object.keys(region).length!==4||keys.some(key=>!Number.isFinite(region[key]))||region.x<0||region.y<0||region.width<=0||region.height<=0||region.x+region.width>1.000001||region.y+region.height>1.000001)throw Error('Bitte einen Bereich innerhalb des Bildschirms markieren.');
 const x=Math.floor(region.x*size.width),y=Math.floor(region.y*size.height),right=Math.min(size.width,Math.ceil((region.x+region.width)*size.width-1e-9)),bottom=Math.min(size.height,Math.ceil((region.y+region.height)*size.height-1e-9));
 if(right-x<8||bottom-y<8)throw Error('Der markierte Bereich ist zu klein.');return {x,y,width:right-x,height:bottom-y};
}
function createCircleInterest({electron,root,allowed,context,onQuestion}){
 const {BrowserWindow,screen,desktopCapturer,ipcMain}=electron,file=path.join(root,'ui/circle.html'),url=pathToFileURL(file).href;
 let win=null,image=null,source=null,sessionId=null,capturedAt=null,generation=0,disposed=false,submitting=false,preview=null,selectionSequence=0;
 function clear(){generation++;const previous=win;win=null;image=null;source=null;sessionId=null;preview=null;if(previous&&!previous.isDestroyed())previous.destroy();}
 const valid=ticket=>!disposed&&ticket===generation&&allowed()&&sessionId===context();
 function access(){if(!allowed()){clear();throw Error('Bildschirmblick ist aus oder Datenschutz ist aktiv.');}}
 async function show(){
  if(disposed)throw Error('Bereichsauswahl wurde beendet.');access();clear();sessionId=context();if(!sessionId)throw Error('Bitte eine verbundene Lilith-Session auswählen.');const ticket=generation;
  const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width=Math.round(display.bounds.width*display.scaleFactor),height=Math.round(display.bounds.height*display.scaleFactor),scale=Math.min(1,7680/Math.max(width,height));
  const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(width*scale),height:Math.round(height*scale)},fetchWindowIcons:false});
  if(!valid(ticket))throw Error('Bereichsauswahl wurde abgebrochen.');source=sources.find(value=>value.display_id===String(display.id));image=source?.thumbnail;capturedAt=new Date().toISOString();if(!image||image.isEmpty())throw Error('Dieser Monitor liefert kein Bild.');
  const window=new BrowserWindow({...display.bounds,title:'Lilith · Circle of Interest',frame:false,show:false,alwaysOnTop:true,skipTaskbar:true,resizable:true,movable:false,backgroundColor:'#07111a',webPreferences:{preload:path.join(root,'circle-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});win=window;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.on('closed',()=>{if(win===window)clear();});
  try{await window.loadFile(file);if(!valid(ticket))throw Error('Bereichsauswahl wurde abgebrochen.');window.setMenu?.(null);window.webContents.send('circle:event',{image:image.toDataURL(),source:source.name,capturedAt});window.show();window.setFullScreen?.(true);window.focus();return {ok:true};}catch(error){if(ticket===generation)clear();throw error;}
 }
 ipcMain.handle('circle:invoke',async(event,method,value)=>{
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame?.url!==url)throw Error('Bereichsauswahl-Zugriff verweigert.');
  if(method==='cancel'){clear();return {ok:true};}access();
  if(sessionId!==context()||submitting)throw Error('Die Session oder Auswahl hat sich geändert.');
  if(method==='preview'){
   preview=null;if(!value||Array.isArray(value)||Object.keys(value).length!==1)throw Error('Ungültige Bereichsauswahl.');
   const region=selectionPixels(value.region,image.getSize()),cropped=image.crop(region),size=cropped.getSize(),scale=Math.min(1,1600/size.width,1200/size.height),prepared=scale<1?cropped.resize({width:Math.round(size.width*scale),height:Math.round(size.height*scale)}):cropped;
   preview={selectionId:String(++selectionSequence),image:prepared.toJPEG(92).toString('base64'),region,width:prepared.getSize().width,height:prepared.getSize().height};
   return {selectionId:preview.selectionId,image:'data:image/jpeg;base64,'+preview.image,width:preview.width,height:preview.height};
  }
  if(method!=='ask'||!value||Array.isArray(value)||Object.keys(value).length!==2||typeof value.question!=='string'||!value.question.trim()||value.question.length>500||!preview||value.selectionId!==preview.selectionId)throw Error('Bitte den aktuellen Ausschnitt prüfen und eine kurze Frage stellen.');
  const payload={image:preview.image,region:preview.region,question:value.question.trim(),sessionId,source:{id:source.id,name:source.name+' · markierter Bereich'},capturedAt};
  submitting=true;clear();try{await onQuestion(payload);return {ok:true};}finally{submitting=false;}
 });
 for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,clear);
 return {show,clear,dispose(){disposed=true;clear();ipcMain.removeHandler('circle:invoke');for(const name of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(name,clear);}};
}
module.exports={selectionPixels,createCircleInterest};
