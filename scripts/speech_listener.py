"""Resident local Silero endpoint detector. JSON lines contain PCM16/16k audio."""
import argparse
import base64
import json
import sys


def detector(model, min_silence=.5):
    import sherpa_onnx
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = str(model)
    config.silero_vad.threshold = .5
    config.silero_vad.min_silence_duration = min_silence
    config.silero_vad.min_speech_duration = .12
    config.silero_vad.max_speech_duration = 28
    config.sample_rate = 16000
    config.num_threads = 1
    return sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=35)


class SpeechListener:
    def __init__(self, vad):
        self.vad = vad
        self.generation = None
        self.started = False
        self.pending = b''

    def accept(self, packet):
        import numpy as np
        generation = packet['generation']
        if type(generation) is not int or generation < 0:
            raise ValueError('Invalid generation')
        if packet.get('reset') is True:
            self.vad.reset()
            self.generation = generation
            self.started = False
            self.pending = b''
            return []
        if generation != self.generation:
            return []
        audio = base64.b64decode(packet['audio'], validate=True)
        if len(audio) > 8192 or len(audio) % 2:
            raise ValueError('Invalid PCM chunk')
        self.pending += audio
        events = []
        while len(self.pending) >= 1024:
            frame, self.pending = self.pending[:1024], self.pending[1024:]
            self.vad.accept_waveform(np.frombuffer(frame, dtype='<i2').astype(np.float32)/32768)
            if self.vad.is_speech_detected() and not self.started:
                self.started = True
                events.append({'type': 'vad-speech', 'generation': generation})
            if not self.vad.empty():
                self.vad.pop()
                if self.started:
                    events.append({'type': 'vad-end', 'generation': generation})
                    self.generation = None
                    self.pending = b''
                    break
        return events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True)
    parser.add_argument('--min-silence', type=float, default=.5)
    args = parser.parse_args()
    if not .25 <= args.min_silence <= 1:
        raise ValueError('Invalid silence duration')
    listener = SpeechListener(detector(args.model, args.min_silence))
    print(json.dumps({'type': 'vad-ready', 'ready': True}), flush=True)
    for line in sys.stdin:
        for event in listener.accept(json.loads(line)):
            print(json.dumps(event), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'type': 'vad-ready', 'ready': False}), flush=True)
        sys.exit(1)
