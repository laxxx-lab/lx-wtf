import importlib.util
import io
import json
import http.client
import hashlib
from http.server import HTTPServer
from pathlib import Path
import struct
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PortableSpeechTests(unittest.TestCase):
    def test_implementation_exists(self):
        self.assertTrue((ROOT / 'scripts/install_speech.py').is_file(), 'portable installer is missing')

    def test_offline_choices_and_assets(self):
        install = load('install_speech')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(install.plan(root, 'none', 'existing')['assets'], [])
            self.assertEqual(install.check(root, 'none', 'existing'), [])
            install.install(root, 'none', 'existing')
            self.assertFalse((root / 'runtime').exists())
            assets = install.plan(root, 'base', 'en_US-lessac-medium')['assets']
            self.assertTrue(any(a['path'].endswith('silero_vad.onnx') for a in assets))
            self.assertTrue(install.check(root, 'base', 'none'))
            with self.assertRaises(ValueError):
                install.plan(root, '../../escape', 'none')

    def test_checksum_and_existing_data_are_preserved(self):
        install = load('install_speech')
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'model'
            target.write_bytes(b'personal-data')
            asset = {'path': str(target), 'url': 'https://example.invalid/model', 'sha256': '0' * 64}
            self.assertFalse(install.file_ok(asset))
            with self.assertRaises(ValueError):
                install.download(asset)
            self.assertEqual(target.read_bytes(), b'personal-data')

    def test_nonempty_model_needs_matching_download_receipt(self):
        install = load('install_speech')
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'model.bin'
            target.write_bytes(b'x')
            asset = {'path': str(target), 'url': 'https://example.invalid/pinned/model', 'sha256': None}
            self.assertFalse(install.file_ok(asset))
            install.write_receipt(asset, install.file_digest(target))
            self.assertTrue(install.file_ok(asset))
            target.write_bytes(b'corrupt')
            self.assertFalse(install.file_ok(asset))

    def test_download_rejects_short_or_invalid_length(self):
        install = load('install_speech')
        for length in ('100000', 'not-a-length', '-1', '0'):
            with self.subTest(length=length), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'model.bin'
                response = io.BytesIO(b'ninebytes')
                response.headers = {'Content-Length': length}
                asset = {'path': str(target), 'url': 'https://example.invalid/pinned', 'sha256': None}
                with patch.object(install.urllib.request, 'urlopen', return_value=response):
                    with self.assertRaises(ValueError):
                        install.download(asset)
                self.assertFalse(target.exists())
                self.assertFalse(Path(str(target) + '.sha256.json').exists())

    def test_download_without_length_needs_known_hash(self):
        install = load('install_speech')
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'model.bin'
            asset = {'path': str(target), 'url': 'https://example.invalid/pinned', 'sha256': None}
            response = io.BytesIO(b'ninebytes')
            response.headers = {}
            with patch.object(install.urllib.request, 'urlopen', return_value=response):
                with self.assertRaises(ValueError):
                    install.download(asset)
            self.assertFalse(target.exists())

    def test_download_without_length_verifies_known_hash_before_promotion(self):
        install = load('install_speech')
        for digest, succeeds in ((hashlib.sha256(b'ninebytes').hexdigest(), True), ('0' * 64, False)):
            with self.subTest(succeeds=succeeds), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'model.bin'
                asset = {'path': str(target), 'url': 'https://example.invalid/pinned', 'sha256': digest}
                response = io.BytesIO(b'ninebytes')
                response.headers = {}
                with patch.object(install.urllib.request, 'urlopen', return_value=response):
                    if succeeds:
                        install.download(asset)
                        self.assertTrue(install.file_ok(asset))
                    else:
                        with self.assertRaises(ValueError):
                            install.download(asset)
                        self.assertFalse(target.exists())
                        self.assertFalse(Path(str(target) + '.sha256.json').exists())

    def test_silero_notice_and_all_assets_have_pinned_hashes(self):
        install = load('install_speech')
        assets = install.plan(Path('test'), 'base', 'en_US-lessac-medium')['assets']
        self.assertTrue(any(a['path'].endswith('silero-LICENSE') for a in assets))
        self.assertTrue(all(a['sha256'] and len(a['sha256']) == 64 for a in assets))

    def test_health_stays_responsive_during_serialized_inference(self):
        speech = load('portable_speech')
        started, release = threading.Event(), threading.Event()
        def synthesize(text):
            started.set()
            release.wait(3)
            return [SimpleNamespace(audio_int16_bytes=b'\0\0' * 100, sample_rate=24000)]
        server = speech.SpeechHTTPServer(('127.0.0.1', 0), speech.handler('voice', SimpleNamespace(synthesize=synthesize), 'en'))
        serving = threading.Thread(target=server.serve_forever, daemon=True)
        serving.start()
        def request_speech():
            connection = http.client.HTTPConnection(*server.server_address, timeout=5)
            connection.request('POST', '/v1/audio/speech', '{"input":"Hello"}', {'Content-Type':'application/json'})
            response = connection.getresponse()
            response.read()
            connection.close()
        inference = threading.Thread(target=request_speech)
        inference.start()
        try:
            self.assertTrue(started.wait(2))
            connection = http.client.HTTPConnection(*server.server_address, timeout=1)
            before = time.monotonic()
            connection.request('GET', '/health')
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            response.read()
            self.assertLess(time.monotonic() - before, 0.7)
            connection.request('POST', '/v1/audio/speech', '{"input":"Hello"}', {'Content-Type':'application/json'})
            response = connection.getresponse()
            self.assertEqual(response.status, 503)
            response.read()
            connection.close()
        finally:
            release.set()
            inference.join(5)
            server.shutdown()
            server.server_close()
            serving.join()

    def test_resampling_and_wav(self):
        speech = load('portable_speech')
        raw = struct.pack('<hhhh', 0, 1000, 2000, 3000)
        data = speech.pcm_wav(speech.resample_pcm16(raw, 12000), 24000)
        with wave.open(io.BytesIO(data)) as wav:
            self.assertEqual((wav.getframerate(), wav.getnchannels(), wav.getsampwidth()), (24000, 1, 2))
            self.assertEqual(wav.getnframes(), 8)

    def test_request_validation(self):
        speech = load('portable_speech')
        self.assertEqual(speech.validate_text({'input': ' Hello '},), 'Hello')
        for value in ({'input': ''}, {'input': 'x' * 4001}, {'input': []}, []):
            with self.assertRaises(ValueError):
                speech.validate_text(value)
        with self.assertRaises(ValueError):
            speech.multipart_wav('text/plain', b'invalid')

    def test_http_voice_is_raw_24k_pcm_and_rejects_bad_requests(self):
        speech = load('portable_speech')
        engine = SimpleNamespace(synthesize=lambda text: [SimpleNamespace(
            audio_int16_bytes=struct.pack('<hhhh', 0, 100, 200, 300), sample_rate=12000)])
        server = HTTPServer(('127.0.0.1', 0), speech.handler('voice', engine, 'en'))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection(*server.server_address)
            connection.request('GET', '/health')
            response = connection.getresponse()
            health = json.loads(response.read())
            self.assertEqual(health['backend'], 'hermes-voice-portable')
            self.assertEqual(health['kind'], 'voice')
            connection.request('POST', '/v1/audio/speech', json.dumps({'input': 'Hello'}), {'Content-Type': 'application/json'})
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader('Content-Type'), 'audio/pcm')
            self.assertEqual(len(response.read()), 16)
            connection.request('POST', '/v1/audio/speech', '{}', {'Content-Type': 'application/json', 'Origin': 'https://example.org'})
            response = connection.getresponse()
            self.assertEqual(response.status, 403)
            response.read()
            connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_http_stt_retains_segment_quality_fields(self):
        speech = load('portable_speech')
        segment = SimpleNamespace(text=' Hello', avg_logprob=-0.1, no_speech_prob=0.01, start=0, end=1)
        engine = SimpleNamespace(transcribe=lambda audio, **kwargs: ([segment], None))
        server = HTTPServer(('127.0.0.1', 0), speech.handler('stt', engine, 'en'))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            audio = speech.pcm_wav(b'\0\0' * 100)
            body = b'--test\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n' + audio + b'\r\n--test--\r\n'
            connection = http.client.HTTPConnection(*server.server_address)
            connection.request('POST', '/inference', body, {'Content-Type': 'multipart/form-data; boundary=test'})
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            result = json.loads(response.read())
            self.assertEqual(result['text'], 'Hello')
            self.assertEqual(result['segments'][0]['avg_logprob'], -0.1)
            self.assertEqual(result['segments'][0]['no_speech_prob'], 0.01)
            connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
