"""Offline LiveKit v1-mini worker. No microphone, network, or audio file writes.

Install the Windows CPython wheel explicitly (not during app startup):
runtime/voice/venv/Scripts/python.exe -m pip install --no-deps --target
    runtime/turn/python livekit-local-inference==0.2.7
The wheel bundles the model under LiveKit's Model License. Source contracts:
https://docs.livekit.io/agents/logic/turns/turn-detector/
https://github.com/livekit/agents/blob/main/livekit-agents/livekit/agents/inference/eot/languages.py
"""
import argparse
import base64
import json
import math
import sys
import time

MAX_BYTES = 16000 * 2 * 30
MAX_LINE = ((MAX_BYTES + 2) // 3) * 4 + 1024


def emit(message):
    print(json.dumps(message, separators=(",", ":")), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--packages", required=True)
    args = parser.parse_args()
    sys.path.insert(0, args.packages)
    try:
        import numpy as np
        from livekit.local_inference import EOT, EOT_MAX_SAMPLES
        detector = EOT()
        # Front-load native inference initialization into startup, not first turn.
        detector.predict(np.zeros(EOT_MAX_SAMPLES, dtype=np.int16))
    except Exception:
        emit({"type": "unavailable", "reason": "model-unavailable"})
        return 1
    emit({"type": "ready", "model": "turn-detector-v1-mini", "threshold": 0.245})
    try:
        while True:
            line = sys.stdin.buffer.readline(MAX_LINE + 1)
            if not line:
                break
            if len(line) > MAX_LINE or not line.endswith(b"\n"):
                return 2
            request = {}
            started = time.perf_counter()
            try:
                request = json.loads(line)
                generation, request_id = request.get("generation"), request.get("id")
                if type(generation) is not int or generation < 0 or not isinstance(request_id, str) or not 0 < len(request_id) <= 128 or request.get("sampleRate") != 16000:
                    raise ValueError("invalid-request")
                audio = base64.b64decode(request["audio"], validate=True)
                if not 2 <= len(audio) <= MAX_BYTES or len(audio) % 2:
                    raise ValueError("invalid-audio")
                # v1-mini's native receptive field is exactly the last 1.2 s.
                pcm = np.frombuffer(audio, dtype="<i2")[-EOT_MAX_SAMPLES:]
                probability = float(detector.predict(pcm))
                if not math.isfinite(probability) or not 0 <= probability <= 1:
                    raise ValueError("invalid-probability")
                emit({"type": "prediction", "id": request_id, "generation": generation,
                      "probability": probability, "elapsedMs": round((time.perf_counter() - started) * 1000, 2)})
            except Exception:
                emit({"type": "prediction", "id": request.get("id") if isinstance(request, dict) else None,
                      "generation": request.get("generation") if isinstance(request, dict) else None,
                      "probability": None, "reason": "prediction-error"})
    finally:
        detector.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
