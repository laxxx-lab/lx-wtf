const path=require('node:path');
function engineSpecs(root){
  const voice=path.join(root,'runtime/voice'),stt=path.join(root,'runtime/stt');
  return [
    {name:'voice',port:8870,health:'/health',cwd:voice,exe:path.join(voice,'build/tts-server.exe'),args:['--model',path.join(voice,'models/qwen-talker-1.7b-base-Q8_0.gguf'),'--codec',path.join(voice,'models/qwen-tokenizer-12hz-Q8_0.gguf'),'--host','127.0.0.1','--port','8870','--lang','German']},
    {name:'stt',port:8871,health:'/',cwd:stt,exe:path.join(stt,'build/bin/whisper-server.exe'),args:['--model',path.join(stt,'models/ggml-large-v3-turbo.bin'),'--host','127.0.0.1','--port','8871','--language','de','--no-language-probabilities','--max-context','0','--flash-attn','--threads','6','--vad','--vad-model',path.join(stt,'models/ggml-silero-v6.2.0.bin')]}
  ];
}
module.exports={engineSpecs};
