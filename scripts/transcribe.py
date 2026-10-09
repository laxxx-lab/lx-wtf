"""Send a local PCM WAV to the resident local whisper.cpp engine."""
import argparse
import io
import json
from pathlib import Path
import struct
import sys
import urllib.request
import wave

def pcm16_wav(data):
    try:
        with wave.open(io.BytesIO(data),'rb') as wav:
            if wav.getsampwidth()!=2 or wav.getnchannels()!=1:
                raise ValueError('Audio must be mono PCM16')
            rate=wav.getframerate()
            raw=wav.readframes(wav.getnframes())
    except (wave.Error,EOFError) as error:
        raise ValueError('Invalid WAV file') from error
    if not raw or len(raw)>12*1024*1024 or not 8000<=rate<=96000:
        raise ValueError('Audio is empty, too long or has an unsupported rate')
    if rate!=16000:
        samples=struct.unpack('<'+'h'*(len(raw)//2),raw)
        result=[]
        for i in range(int(len(samples)*16000/rate)):
            at=i*rate/16000;index=int(at);fraction=at-index
            result.append(round(samples[index]*(1-fraction)+samples[min(index+1,len(samples)-1)]*fraction))
        raw=struct.pack('<'+'h'*len(result),*result)
    output=io.BytesIO()
    with wave.open(output,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(raw)
    return output.getvalue()

def transcribe(data):
    audio=pcm16_wav(data)
    boundary='hermes-local-audio'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nde\r\n'
          f'--{boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n'
          f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="command.wav"\r\n'
          'Content-Type: audio/wav\r\n\r\n').encode()+audio+f'\r\n--{boundary}--\r\n'.encode()
    request=urllib.request.Request('http://127.0.0.1:8871/inference',body,
                                   {'Content-Type':f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(request,timeout=60) as response:
        result=json.load(response)
    return {'text':str(result.get('text','')).strip(),'language':'de'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True,type=Path)
    args=parser.parse_args()
    print(json.dumps(transcribe(args.input.read_bytes()),ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except (OSError,ValueError) as error:
        print(f'Local transcription failed: {error}',file=sys.stderr)
        sys.exit(1)
