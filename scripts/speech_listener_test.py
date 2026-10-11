"""Real-model endpoint regression: room noise cannot hold a turn for 30 seconds."""
import base64
import json
from pathlib import Path
import time
import unittest
import wave
import numpy as np
from speech_listener import detector, SpeechListener

ROOT = Path(__file__).resolve().parent.parent


def wav_samples(file):
    with wave.open(str(file), 'rb') as wav:
        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32)/32768
    return np.interp(np.arange(0, len(samples), rate/16000), np.arange(len(samples)), samples).astype(np.float32)


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.listener = SpeechListener(detector(ROOT/'runtime/wake/silero_vad.onnx'))

    def feed(self, samples, generation=1):
        events = []
        for at in range(0, len(samples), 512):
            audio = np.clip(samples[at:at+512]*32767, -32768, 32767).astype('<i2').tobytes()
            for event in self.listener.accept({'generation': generation, 'audio': base64.b64encode(audio).decode()}):
                events.append({**event, 'at': (at+512)/16000})
        return events

    def test_room_noise_and_silence_do_not_start_speech(self):
        self.listener.accept({'generation': 1, 'reset': True})
        noise = np.random.default_rng(73).normal(0, .004, 16000*4).astype(np.float32)
        self.assertEqual(self.feed(noise), [])
        self.assertEqual(self.feed(np.zeros(16000*2, dtype=np.float32)), [])

    def test_real_speech_ends_within_one_second_despite_room_noise(self):
        reports = []
        for file in [ROOT/'voices/wake-lilith-command.wav', ROOT/'voices/imported/probe-2.wav']:
            self.listener.accept({'generation': 1, 'reset': True})
            speech = wav_samples(file)
            noise = np.random.default_rng(17).normal(0, .004, 16000*2).astype(np.float32)
            started = time.perf_counter()
            events = self.feed(np.concatenate([speech, noise]))
            self.assertEqual([e['type'] for e in events], ['vad-speech', 'vad-end'])
            self.assertLessEqual(events[-1]['at']-len(speech)/16000, 1)
            reports.append({'sample': file.name, 'end_ms_after_file': round((events[-1]['at']-len(speech)/16000)*1000), 'processing_ms': round((time.perf_counter()-started)*1000)})
        print(json.dumps(reports))

    def test_reset_discards_incomplete_audio_from_previous_capture(self):
        self.listener.accept({'generation': 1, 'reset': True})
        self.feed(wav_samples(ROOT/'voices/wake-lilith-command.wav'))
        self.listener.accept({'generation': 2, 'reset': True})
        self.assertEqual(self.feed(np.zeros(16000, dtype=np.float32), generation=1), [])
        self.assertEqual(self.feed(np.zeros(16000, dtype=np.float32), generation=2), [])


if __name__ == '__main__':
    unittest.main()
