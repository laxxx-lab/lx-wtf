"""Install public CPU speech assets into a private, per-workspace venv."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import urllib.request
import venv

STT = ('none', 'base', 'small', 'existing')
TTS = ('none', 'de_DE-thorsten-medium', 'en_US-lessac-medium', 'existing')
REVISIONS = {'base': 'ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66',
             'small': '536b0662742c02347bc0e980a01041f333bce120',
             'piper': 'c10ece1aade47bb51c153c893d14e5bf8e5b7117'}
VAD_SHA = '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6'
MODEL_HASHES = json.loads(Path(__file__).with_name('portable-models.json').read_text(encoding='utf-8'))


def plan(root, stt, tts):
    if stt not in STT or tts not in TTS:
        raise ValueError('Unsupported speech choice')
    assets, requirements = [], []
    def asset(path, url, sha256=None):
        assets.append({'path': str(Path(root) / path), 'url': url, 'sha256': sha256 or MODEL_HASHES[url]})
    if stt in ('base', 'small'):
        requirements.append('requirements-portable-stt.txt')
        prefix = f'https://huggingface.co/Systran/faster-whisper-{stt}/resolve/{REVISIONS[stt]}/'
        for filename in ('config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt', 'README.md'):
            asset(f'runtime/public/models/whisper-{stt}/{filename}', prefix + filename)
        asset('runtime/wake/silero_vad.onnx',
              'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx', VAD_SHA)
        asset('runtime/public/licenses/sherpa-LICENSE',
              'https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/fa29eb91c80335fc70af869a7bb459578f90e5ad/LICENSE')
        asset('runtime/public/licenses/silero-LICENSE',
              'https://raw.githubusercontent.com/snakers4/silero-vad/1e261b036686cd0017d500ee96acd1c4ba572a9d/LICENSE')
    if tts not in ('none', 'existing'):
        requirements.append('requirements-portable-voice.txt')
        language, speaker, quality = tts.split('-')
        prefix = f'https://huggingface.co/rhasspy/piper-voices/resolve/{REVISIONS["piper"]}/{language[:2]}/{language}/{speaker}/{quality}/'
        for suffix in ('.onnx', '.onnx.json'):
            asset(f'runtime/public/models/{tts}{suffix}', prefix + tts + suffix)
        asset(f'runtime/public/licenses/{tts}-MODEL_CARD', prefix + 'MODEL_CARD')
        asset('runtime/public/licenses/piper-COPYING',
              'https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/v1.8.0/COPYING')
    return {'python': str(venv_python(root)), 'requirements': requirements, 'assets': assets}


def venv_python(root):
    return Path(root) / 'runtime/public/venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def file_digest(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        while True:
            block = source.read(1024 * 1024)
            if not block:
                return digest.hexdigest()
            digest.update(block)


def write_receipt(asset, digest):
    target = Path(asset['path'] + '.sha256.json')
    descriptor, name = tempfile.mkstemp(prefix=target.name, dir=target.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump({'url': asset['url'], 'sha256': digest}, output)
        Path(name).replace(target)
    finally:
        Path(name).unlink(missing_ok=True)


def file_ok(asset):
    path = Path(asset['path'])
    if not path.is_file() or not path.stat().st_size:
        return False
    expected = asset['sha256']
    if not expected:
        try:
            receipt = json.loads(Path(asset['path'] + '.sha256.json').read_text(encoding='utf-8'))
            if receipt['url'] != asset['url']:
                return False
            expected = receipt['sha256']
        except (OSError, ValueError, KeyError, TypeError):
            return False
    return file_digest(path) == expected


def check(root, stt, tts):
    actions = plan(root, stt, tts)
    missing = [a['path'] for a in actions['assets'] if not file_ok(a)]
    if actions['requirements']:
        python = venv_python(root)
        if not python.is_file():
            missing.append(str(python))
        else:
            packages = ['faster_whisper', 'sherpa_onnx', 'numpy'] if stt in ('base', 'small') else []
            if tts not in ('none', 'existing'):
                packages.extend(['piper', 'numpy'])
            result = subprocess.run([str(python), '-c', ';'.join('import ' + p for p in packages)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode:
                missing.append('Selected Python dependencies are missing or cannot load')
    return missing


def download(asset):
    target = Path(asset['path'])
    if file_ok(asset):
        return
    if target.exists():
        raise ValueError('Existing incomplete asset preserved; move it aside before retrying: ' + str(target))
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=target.name + '.', suffix='.download', dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as output, urllib.request.urlopen(asset['url'], timeout=60) as response:
            header = response.headers.get('Content-Length')
            if header is not None and (not header.isdigit() or int(header) <= 0):
                raise ValueError('Invalid download Content-Length')
            expected_length = int(header) if header is not None else None
            if expected_length is None and not asset['sha256']:
                raise ValueError('Download requires known checksum or Content-Length')
            digest = hashlib.sha256()
            received = 0
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                digest.update(block)
                received += len(block)
                output.write(block)
            if expected_length is not None and received != expected_length:
                raise ValueError('Downloaded asset length mismatch')
        if not temporary.stat().st_size or (asset['sha256'] and digest.hexdigest() != asset['sha256']):
            raise ValueError('Downloaded asset checksum mismatch')
        temporary.replace(target)
        write_receipt(asset, digest.hexdigest())
    finally:
        temporary.unlink(missing_ok=True)


def install(root, stt, tts):
    actions = plan(root, stt, tts)
    if not actions['requirements']:
        return
    if not (3, 10) <= sys.version_info[:2] <= (3, 12):
        raise ValueError('Install Python 3.10-3.12 and retry speech setup')
    if platform.system() not in ('Windows', 'Linux', 'Darwin') or platform.machine().lower() not in ('amd64', 'x86_64', 'arm64', 'aarch64'):
        raise ValueError('Unsupported speech platform: use existing/none or a supported 64-bit Python')
    python = venv_python(root)
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(python.parents[1])
    argv = [str(python), '-m', 'pip', 'install', '--only-binary=:all:', '--index-url', 'https://pypi.org/simple']
    for requirements in actions['requirements']:
        argv.extend(['-r', str(Path(__file__).with_name(requirements))])
    try:
        subprocess.run(argv, check=True)
    except subprocess.CalledProcessError as error:
        raise ValueError('Speech wheel installation failed; use supported 64-bit Python 3.10-3.12 and retry') from error
    for asset in actions['assets']:
        print('Installing ' + Path(asset['path']).name, flush=True)
        download(asset)
    metadata = Path(root) / 'runtime/public/licenses/sources.json'
    previous = json.loads(metadata.read_text()) if metadata.exists() else []
    combined = {a['path']: a for a in previous + actions['assets']}
    metadata.write_text(json.dumps(list(combined.values()), indent=2), encoding='utf-8')
    missing = check(root, stt, tts)
    if missing:
        raise ValueError('Speech verification failed: ' + ', '.join(missing))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--stt', choices=STT, required=True)
    parser.add_argument('--tts', choices=TTS, required=True)
    parser.add_argument('--language', choices=('de', 'en'), default='de')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--plan', action='store_true')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps(plan(args.root, args.stt, args.tts)))
    elif args.check:
        missing = check(args.root, args.stt, args.tts)
        print(json.dumps({'ready': not missing, 'missing': missing}))
        return int(bool(missing))
    else:
        install(args.root, args.stt, args.tts)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print('Speech installation failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
