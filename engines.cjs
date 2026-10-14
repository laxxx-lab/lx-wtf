const path=require('node:path'),fs=require('node:fs');
function liveEngineSpec(root){
  const cwd=path.join(root,'runtime/live/llama-b11565'),model=path.join(root,'runtime/live/models/Qwen3.5-4B-Q4_K_M.gguf');
  return {name:'live',port:8874,health:'/health',cwd,exe:path.join(cwd,'llama-server.exe'),args:['--model',model,'--host','127.0.0.1','--port','8874','--alias','lilith-live','--device','Vulkan0','--gpu-layers','999','--ctx-size','4096','--parallel','1','--flash-attn','on','--reasoning-budget','0']};
}
function engineSpecs(root){
  const voice=path.join(root,'runtime/voice'),stt=path.join(root,'runtime/stt');
  return [
    {name:'voice',port:8870,health:'/health',cwd:voice,exe:path.join(voice,'build/tts-server.exe'),args:['--model',path.join(voice,'models/qwen-talker-1.7b-base-Q8_0.gguf'),'--codec',path.join(voice,'models/qwen-tokenizer-12hz-Q8_0.gguf'),'--host','127.0.0.1','--port','8870','--lang','German']},
    {name:'stt',port:8871,health:'/',cwd:stt,exe:path.join(stt,'build/bin/whisper-server.exe'),args:['--model',path.join(stt,'models/ggml-large-v3-turbo.bin'),'--host','127.0.0.1','--port','8871','--language','de','--no-language-probabilities','--max-context','0','--flash-attn','--threads','6','--vad','--vad-model',path.join(stt,'models/ggml-silero-v6.2.0.bin')]},
    ...(()=>{const live=liveEngineSpec(root);return fs.existsSync(live.exe)&&fs.existsSync(live.args[1])?[live]:[];})()
  ];
}
module.exports={engineSpecs,liveEngineSpec};
