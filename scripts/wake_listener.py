"""Local Hey Hermes detector; stdin is raw 16 kHz mono signed 16-bit PCM."""
import argparse
import json
import math
from pathlib import Path
import sys
import time

PHRASES = {'HEY_HERMES': 'Hey Hermes', 'HEY_LILITH': 'Hey Lilith',
           'HEY_LILLIS': 'Hey Lillis', 'LILITH': 'Lilith', 'LILLIS': 'Lillis'}

def accepted_phrase(keyword, bare_names):
    keyword = str(keyword).strip().upper().replace(' ', '_')
    if not bare_names and keyword in {'LILITH', 'LILLIS'}:
        return None
    return PHRASES.get(keyword)

class WakeDebouncer:
    def __init__(self, threshold=.6):
        self.threshold = threshold
        self.streak = 0
        self.last_fire = -math.inf

    def observe(self, score, now):
        if now - self.last_fire < 2:
            self.streak = 0
            return False
        self.streak = self.streak + 1 if math.isfinite(score) and score >= self.threshold else 0
        if self.streak < 3:
            return False
        self.streak = 0
        self.last_fire = now
        return True

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--bare-names', action='store_true')
    parser.add_argument('--wav', type=Path, help='Check detection against a 16 kHz PCM WAV')
    args = parser.parse_args()
    from pyopen_wakeword import OpenWakeWord, OpenWakeWordFeatures
    features = OpenWakeWordFeatures.from_builtin()
    model = OpenWakeWord.from_model(str(args.model))
    gate = WakeDebouncer()
    import numpy as np
    import sherpa_onnx
    directory = args.model.parent / 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
    labels = [key for key in PHRASES if accepted_phrase(key, args.bare_names)]
    tokens = sherpa_onnx.text2token([label.replace('_', ' ') for label in labels],
                                  tokens=str(directory/'tokens.txt'), tokens_type='bpe',
                                  bpe_model=str(directory/'bpe.model'))
    keywords = args.model.parent / ('keywords-bare.txt' if args.bare_names else 'keywords-hey.txt')
    keywords.write_text('\n'.join(' '.join(token)+f" #0.35 @{label}" for token, label in zip(tokens, labels))+'\n', encoding='utf8')
    model_file = lambda name: str(next(directory.glob(name+'-*.onnx')))
    spotter = sherpa_onnx.KeywordSpotter(tokens=str(directory/'tokens.txt'),
                                      encoder=model_file('encoder'),decoder=model_file('decoder'),
                                      joiner=model_file('joiner'),keywords_file=str(keywords),num_threads=1)
    stream = spotter.create_stream()
    last_fire = -math.inf
    print(json.dumps({'type': 'ready', 'phrases': [PHRASES[label] for label in labels]}), flush=True)
    def process(frame):
        nonlocal last_fire
        phrase = None
        scores = [float(score) for embedding in features.process_streaming(frame)
                  for score in model.process_streaming(embedding)]
        now = time.monotonic()
        if gate.observe(max(scores, default=0), now):
            phrase = 'Hey Hermes'
        stream.accept_waveform(16000, np.frombuffer(frame, dtype='<i2').astype(np.float32)/32768)
        while spotter.is_ready(stream):
            spotter.decode_stream(stream)
        keyword = spotter.get_result(stream)
        if keyword:
            phrase = accepted_phrase(keyword, args.bare_names)
            spotter.reset_stream(stream)
        if phrase and now-last_fire >= 2:
            last_fire = now
            print(json.dumps({'type':'wake', 'phrase':phrase}),flush=True)
            features.reset()
            model.reset()
            return True
        return False
    if args.check:
        for _ in range(25):
            if process(bytes(2560)):
                raise RuntimeError('Silent input triggered the detector')
        return
    if args.wav:
        import wave
        with wave.open(str(args.wav),'rb') as wav:
            if (wav.getframerate(),wav.getnchannels(),wav.getsampwidth()) != (16000,1,2):
                raise ValueError('Test WAV must be 16 kHz mono PCM16')
            while frame := wav.readframes(1280):
                process(frame.ljust(2560,b'\0'))
        for _ in range(15):
            process(bytes(2560))
        return
    while True:
        frame = sys.stdin.buffer.read(2560)
        if len(frame) != 2560:
            break
        process(frame)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'type': 'error', 'message': str(error)}), flush=True)
        sys.exit(1)
