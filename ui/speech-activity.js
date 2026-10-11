(function(root){
  function speechThreshold(noiseFloor){return Math.max(.003,(Number.isFinite(noiseFloor)?noiseFloor:.001)*2.5);}
  if(typeof module==='object'&&module.exports)module.exports={speechThreshold};else root.speechThreshold=speechThreshold;
})(typeof window==='object'?window:globalThis);
