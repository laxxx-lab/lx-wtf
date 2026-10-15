"""Bounded, loopback-only public CPU speech protocol adapter (no audio logs)."""
import argparse
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import struct
import sys
import threading
import wave

MAX_REQUEST = 12 * 1024 * 1024
MAX_TEXT = 4000


class SpeechHTTPServer(ThreadingHTTPServer):
    """Keep health responsive while bounding all active request handlers."""
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.settimeout(1)
                request.sendall(b'HTTP/1.0 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def resample_pcm16(raw, rate, target=24000):
    if not raw or len(raw) % 2 or not 8000 <= rate <= 96000:
        raise ValueError('Invalid PCM audio')
    if rate == target:
        return raw
    samples = struct.unpack('<' + 'h' * (len(raw) // 2), raw)
    result = []
    for i in range(int(len(samples) * target / rate)):
        position = i * rate / target
        index = int(position)
        fraction = position - index
        result.append(round(samples[index] * (1 - fraction) + samples[min(index + 1, len(samples) - 1)] * fraction))
    return struct.pack('<' + 'h' * len(result), *result)


def pcm_wav(raw, rate=24000):
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(raw)
    return output.getvalue()


def validate_wav(data):
    with wave.open(io.BytesIO(data)) as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or not 8000 <= wav.getframerate() <= 96000:
            raise ValueError('Expected mono PCM16 WAV')
        if not 0 < wav.getnframes() <= wav.getframerate() * 120:
            raise ValueError('Expected up to 120 seconds of audio')
        if len(wav.readframes(wav.getnframes())) != wav.getnframes() * 2:
            raise ValueError('Truncated WAV')
    return data


def multipart_wav(content_type, body):
    if len(body) > MAX_REQUEST or not content_type.startswith('multipart/form-data') or len(content_type) > 200:
        raise ValueError('Expected bounded multipart WAV')
    message = BytesParser(policy=policy.default).parsebytes(
        ('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + body)
    if not message.is_multipart():
        raise ValueError('Invalid multipart boundary')
    files = [p.get_payload(decode=True) for p in message.iter_parts()
             if p.get_param('name', header='content-disposition') == 'file']
    if len(files) != 1:
        raise ValueError('Expected one WAV file')
    return validate_wav(files[0])


def validate_text(payload):
    text = payload.get('input') if isinstance(payload, dict) else None
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT or '\x00' in text:
        raise ValueError('Expected 1-4000 text characters')
    return text.strip()


def load_engine(kind, model):
    model = Path(model).resolve()
    if kind == 'stt':
        for filename in ('model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'):
            if not (model / filename).is_file():
                raise ValueError('Local Whisper model is incomplete')
        from faster_whisper import WhisperModel
        return WhisperModel(str(model), device='cpu', compute_type='int8', local_files_only=True)
    if not model.is_file() or not Path(str(model) + '.json').is_file():
        raise ValueError('Local Piper model/config is missing')
    from piper import PiperVoice
    return PiperVoice.load(str(model), use_cuda=False)


def handler(kind, engine, language):
    inference_lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def log_message(self, *_):
            pass

        def reply(self, status, data, content_type='application/json'):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path in ('/health', '/'):
                self.reply(200, json.dumps({'status': 'ok', 'ready': True,
                                           'backend': 'hermes-voice-portable', 'kind': kind}).encode())
            else:
                self.reply(404, b'{"error":"Not found"}')

        def do_POST(self):
            # Browser pages cannot use these unauthenticated local inference endpoints.
            if self.headers.get('Origin') or self.headers.get('Transfer-Encoding'):
                self.reply(403, b'{"error":"Forbidden"}')
                return
            if self.path != ('/inference' if kind == 'stt' else '/v1/audio/speech'):
                self.reply(404, b'{"error":"Not found"}')
                return
            if not inference_lock.acquire(blocking=False):
                self.reply(503, b'{"error":"Speech inference busy"}')
                return
            try:
                self.inference_request()
            finally:
                inference_lock.release()

        def inference_request(self):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                limit = MAX_REQUEST if kind == 'stt' else 32768
                if not 0 < length <= limit:
                    raise ValueError('Invalid request size')
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError('Incomplete request')
                content_type = self.headers.get('Content-Type', '')
                if kind == 'stt':
                    audio = multipart_wav(content_type, body)
                else:
                    if content_type.split(';')[0] != 'application/json':
                        raise ValueError('Expected JSON')
                    text = validate_text(json.loads(body))
            except (ValueError, EOFError, wave.Error, OSError):
                self.reply(400, b'{"error":"Invalid speech request"}')
                return
            try:
                if kind == 'stt':
                    segments, _ = engine.transcribe(io.BytesIO(audio), language=language, beam_size=5)
                    items = [{'text': s.text, 'avg_logprob': s.avg_logprob, 'no_speech_prob': s.no_speech_prob,
                              'start': s.start, 'end': s.end} for s in segments]
                    result = {'text': ''.join(s['text'] for s in items).strip(), 'segments': items, 'language': language}
                    self.reply(200, json.dumps(result).encode())
                else:
                    parts, size = [], 0
                    for chunk in engine.synthesize(text):
                        raw = resample_pcm16(chunk.audio_int16_bytes, chunk.sample_rate)
                        size += len(raw)
                        if size > 24000 * 2 * 300:
                            raise ValueError('Speech output too long')
                        parts.append(raw)
                    self.reply(200, b''.join(parts), 'audio/pcm')
            except Exception:
                self.reply(500, b'{"error":"Speech inference failed"}')
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=('stt', 'voice'), required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--port', type=int, choices=(8870, 8871), required=True)
    parser.add_argument('--language', choices=('de', 'en'), default='de')
    args = parser.parse_args()
    if args.port != (8871 if args.kind == 'stt' else 8870):
        parser.error('STT uses 8871; voice uses 8870')
    engine = load_engine(args.kind, args.model)
    with SpeechHTTPServer(('127.0.0.1', args.port), handler(args.kind, engine, args.language)) as server:
        server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ImportError):
        print('Portable speech unavailable: verify local model and selected Python dependencies', file=sys.stderr)
        sys.exit(1)
