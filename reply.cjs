'use strict';
class ReplyAccumulator {
  constructor(){this.segments=[];this.current='';}
  get text(){return [...this.segments,this.current].filter(Boolean).join('\n\n');}
  delta(text){this.current+=text||'';}
  interim(data){
    const text=data.already_streamed?this.current:String(data.text||'');
    if(text)this.segments.push(text);this.current='';
  }
  complete(data){
    if(data.response_previewed||data.response_reused)return {newText:''};
    const text=typeof data.text==='string'?data.text:'';
    const newText=!this.current?text:'';
    if(text)this.current=text;
    return {newText};
  }
}
module.exports={ReplyAccumulator};
