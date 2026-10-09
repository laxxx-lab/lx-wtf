"""German Qwen3-TTS VoiceDesign adapter. No third-party Python packages."""
import argparse
import io
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime" / "voice"
MODEL = RUNTIME / "models" / "qwen-talker-1.7b-voicedesign-Q8_0.gguf"
CODEC = RUNTIME / "models" / "qwen-tokenizer-12hz-Q8_0.gguf"
PROMPTS = {
    "sovereign": "A mature adult female native German speaker. Low-pitched, warm, slightly smoky and velvety voice. Calm, confident, sovereign presence, precise articulation and natural conversational rhythm. Restrained authority, elegant warmth, unhurried but concise. Studio quality, no exaggerated acting.",
    "dark": "A mature adult female native German speaker. Deep, dark, rich contralto voice with a subtle smoky texture. Powerful, self-assured and grounded, controlled intensity and quiet authority. Clear precise German articulation, natural conversational delivery, warm undertone. Studio quality, no shouting or exaggerated acting.",
    "playful": "An adult female native German speaker. Low to mid pitch, warm, velvety, slightly husky and smoky voice. Confident, intelligent and charming with a subtle cheeky smile, dry wit and lively natural intonation. Clear relaxed German articulation, affectionate warmth, conversational delivery. Studio quality, no childish or squeaky voice.",
}


def speech_request(text, voice, seed, delivery='normal'):
    text = text.strip()
    if not text:
        raise ValueError("Text must not be empty")
    if voice not in PROMPTS:
        raise ValueError("Unknown voice")
    if delivery not in {'normal','whisper','power'}:
        raise ValueError('Unknown delivery')
    instruction=PROMPTS[voice]
    if delivery=='whisper':
        instruction+=' Whisper softly with a close, breathy, intimate delivery. Keep the words clear and the same mature female character.'
    elif delivery=='power':
        instruction=instruction.replace('no shouting or exaggerated acting','clear powerful projection')
        instruction+=' Speak with powerful, energetic, loud projection and strong emphasis. Controlled urgency, clear diction, the same mature female character.'
    return {"input": text, "voice": "", "language": "German", "instructions": instruction,
            "response_format": "wav", "seed": seed, "max_new_tokens": 1200}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--text-file", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--voice", choices=PROMPTS, default="sovereign")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument('--delivery',choices=('normal','whisper','power'),default='normal')
    parser.add_argument("--engine", choices=("auto", "cli", "http"), default="auto")
    parser.add_argument("--server", default="http://127.0.0.1:8870")
    parser.add_argument("--serve", action="store_true", help="Run resident loopback server")
    parser.add_argument("--port", type=int, default=8870)
    args = parser.parse_args()
    if args.serve:
        return subprocess.call([str(RUNTIME / "build" / "tts-server.exe"), "--model", str(MODEL),
                                "--codec", str(CODEC), "--host", "127.0.0.1", "--port", str(args.port),
                                "--lang", "German", "--alias", "qwen3-voicedesign"])
    if not args.text_file or not args.output:
        parser.error("--text-file and --output are required for synthesis")
    payload = speech_request(args.text_file.read_text(encoding="utf-8-sig"), args.voice, args.seed,args.delivery)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    engine = "cli"
    if args.engine != "cli":
        request = urllib.request.Request(args.server.rstrip("/") + "/v1/audio/speech",
                                         json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                         {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                data = response.read()
            with wave.open(io.BytesIO(data), "rb") as wav:
                if wav.getnframes() == 0:
                    raise ValueError("Server returned empty audio")
            args.output.write_bytes(data)
            engine = "http"
        except urllib.error.HTTPError:
            raise
        except urllib.error.URLError:
            if args.engine == "http":
                raise
    if engine == "cli":
        subprocess.run([str(RUNTIME / "build" / "qwen-tts.exe"), "--model", str(MODEL),
                        "--codec", str(CODEC), "--lang", "German", "--instruct", payload["instructions"],
                        "--seed", str(args.seed), "--max-new", "1200", "-o", str(args.output.resolve())],
                       input=payload["input"].encode("utf-8"), check=True)
    elapsed = time.perf_counter() - started
    with wave.open(str(args.output), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
        if not duration:
            raise ValueError("Engine returned empty audio")
        result = {"output": str(args.output.resolve()), "voice": args.voice, "engine": engine,
                  "elapsed_seconds": round(elapsed, 3), "audio_seconds": round(duration, 3),
                  "real_time_factor": round(elapsed / duration, 3), "sample_rate": wav.getframerate()}
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Voice synthesis failed: {exc}", file=sys.stderr)
        sys.exit(1)
