"""Local YuNet/SFace JSONL worker. Receives JPEGs; never opens a camera.

Only explicit enrollment writes names and normalized SFace embeddings. Frames,
landmarks, and embeddings never appear in protocol output or error messages.
"""
import argparse
import base64
import binascii
import json
import os
from pathlib import Path
import sys
import tempfile
import unicodedata

os.environ["OPENCV_LOG_LEVEL"] = "SILENT"
import cv2
import numpy as np


EMBEDDING_SIZE = 128
MATCH_THRESHOLD = .55
MATCH_MARGIN = .08
ENROLL_SIMILARITY = .70
ENROLL_REQUIRED = 3
MAX_IMAGE_CHARS = 2_000_000
MAX_LINE_CHARS = MAX_IMAGE_CHARS + 4096


def profile_name(value):
    if (not isinstance(value, str) or len(value) > 60
            or any(unicodedata.category(char).startswith("C") for char in value)):
        raise ValueError("Use a plain name of 1 to 60 characters.")
    value = value.strip()
    if not value:
        raise ValueError("Use a plain name of 1 to 60 characters.")
    return value


def normalize_embedding(value):
    try:
        feature = np.asarray(value, dtype=np.float32)
        if feature.shape not in ((EMBEDDING_SIZE,), (1, EMBEDDING_SIZE)):
            raise ValueError
        feature = feature.reshape(EMBEDDING_SIZE)
        norm = float(np.linalg.norm(feature))
        if not np.all(np.isfinite(feature)) or not np.isfinite(norm) or norm < 1e-8:
            raise ValueError
        return feature / norm
    except (TypeError, ValueError, OverflowError):
        raise ValueError("Face embedding is invalid.") from None


class ProfileStore:
    def __init__(self, path):
        self.path = Path(path)
        self.profiles = {}
        if not self.path.exists():
            return
        try:
            if self.path.stat().st_size > 1_000_000:
                raise ValueError
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if (set(data) != {"version", "profiles"} or data["version"] != 1
                    or not isinstance(data["profiles"], list) or len(data["profiles"]) > 100):
                raise ValueError
            for item in data["profiles"]:
                if set(item) != {"name", "embeddings"}:
                    raise ValueError
                name = profile_name(item["name"])
                embeddings = item["embeddings"]
                if name in self.profiles or not isinstance(embeddings, list) or not 1 <= len(embeddings) <= 3:
                    raise ValueError
                self.profiles[name] = [normalize_embedding(feature) for feature in embeddings]
        except (OSError, TypeError, ValueError, KeyError):
            raise ValueError("Local face profiles are invalid. Delete all profiles to reset.") from None

    def names(self):
        return sorted(self.profiles)

    def save(self, profiles):
        data = {"version": 1, "profiles": [
            {"name": name, "embeddings": [feature.tolist() for feature in profiles[name]]}
            for name in sorted(profiles)]}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent,
                                             prefix=".face-profiles-", delete=False) as file:
                temporary = Path(file.name)
                json.dump(data, file, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
            self.profiles = profiles
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def put(self, name, embeddings):
        name = profile_name(name)
        if not 1 <= len(embeddings) <= ENROLL_REQUIRED:
            raise ValueError("Face references are invalid.")
        profiles = dict(self.profiles)
        if name not in profiles and len(profiles) >= 100:
            raise ValueError("The local profile limit has been reached.")
        profiles[name] = [normalize_embedding(feature) for feature in embeddings]
        self.save(profiles)

    def forget(self, name=None):
        profiles = dict(self.profiles) if name is not None else {}
        if name is not None:
            profiles.pop(profile_name(name), None)
        self.save(profiles)

    def match(self, feature):
        feature = normalize_embedding(feature)
        scores = sorted(((max(float(np.dot(feature, ref)) for ref in refs), name)
                         for name, refs in self.profiles.items()), reverse=True)
        if not scores:
            return None, None
        best, name = scores[0]
        best = max(-1.0, min(1.0, best))
        runner_up = scores[1][0] if len(scores) > 1 else -1.0
        accepted = best >= MATCH_THRESHOLD and best - runner_up >= MATCH_MARGIN
        return name if accepted else None, best


def decode_image(value):
    if not isinstance(value, str) or not 1 <= len(value) <= MAX_IMAGE_CHARS:
        raise ValueError("Provide a JPEG frame no larger than 960 by 720.")
    try:
        data = base64.b64decode(value, validate=True)
        if not data.startswith(b"\xff\xd8"):
            raise ValueError
        # Read dimensions before decoding so a tiny compressed image cannot
        # allocate an arbitrarily large raster in OpenCV.
        offset = 2
        dimensions = None
        while offset < len(data):
            if data[offset] != 255:
                raise ValueError
            while offset < len(data) and data[offset] == 255:
                offset += 1
            marker = data[offset]
            offset += 1
            if marker in (0xD9, 0xDA):
                break
            if marker == 0x01 or 0xD0 <= marker <= 0xD7:
                continue
            size = int.from_bytes(data[offset:offset + 2], "big")
            if size < 2 or offset + size > len(data):
                raise ValueError
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if size < 8:
                    raise ValueError
                height = int.from_bytes(data[offset + 3:offset + 5], "big")
                width = int.from_bytes(data[offset + 5:offset + 7], "big")
                dimensions = width, height
                break
            offset += size
        if dimensions is None or not 1 <= dimensions[0] <= 960 or not 1 <= dimensions[1] <= 720:
            raise ValueError
        image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.shape[:2] != (dimensions[1], dimensions[0]):
            raise ValueError
        return image
    except (ValueError, binascii.Error, IndexError, cv2.error):
        raise ValueError("Provide a valid JPEG frame no larger than 960 by 720.") from None


class VisionModels:
    def __init__(self, models):
        models = Path(models)
        detector = models / "face_detection_yunet_2023mar.onnx"
        recognizer = models / "face_recognition_sface_2021dec.onnx"
        if not detector.is_file() or not recognizer.is_file():
            raise ValueError("Local face models are missing.")
        try:
            cv2.setNumThreads(2)
            self.detector = cv2.FaceDetectorYN.create(str(detector), "", (320, 320), .75, .3, 5000)
            self.recognizer = cv2.FaceRecognizerSF.create(str(recognizer), "")
        except cv2.error:
            raise ValueError("Local face models could not be loaded.") from None

    def detect(self, image):
        self.detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = self.detector.detect(image)
        return [] if faces is None else list(faces)

    def embedding(self, image, face):
        aligned = self.recognizer.alignCrop(image, np.asarray(face, dtype=np.float32))
        return normalize_embedding(self.recognizer.feature(aligned))


class FaceWorker:
    def __init__(self, models, profiles, vision=None):
        self.models = Path(models)
        self.store = ProfileStore(profiles)
        self.vision = vision
        self.pending_name = None
        self.pending = []

    def reset_enrollment(self):
        self.pending_name = None
        self.pending = []

    def handle(self, request):
        try:
            return self._handle(request)
        except Exception:
            self.reset_enrollment()
            raise

    def _handle(self, request):
        if not isinstance(request, dict):
            raise ValueError("Provide a camera request object.")
        op = request.get("op")
        if op == "profiles":
            return {"faces": [], "profileNames": self.store.names()}
        if op == "forget":
            self.reset_enrollment()
            self.store.forget(request.get("name"))
            return {"faces": [], "profileNames": self.store.names()}
        if op not in ("analyze", "enroll"):
            raise ValueError("Unsupported camera operation.")
        name = profile_name(request.get("name")) if op == "enroll" else None
        image = decode_image(request.get("image"))
        if self.vision is None:
            self.vision = VisionModels(self.models)
        detections = self.vision.detect(image)
        faces = []
        recognize = request.get("recognize") is True and op == "analyze"
        for face in detections:
            if len(face) != 15 or not np.all(np.isfinite(face)):
                raise ValueError("Face detection could not be completed.")
            matched, similarity = None, None
            if recognize:
                matched, similarity = self.store.match(self.vision.embedding(image, face))
            faces.append({"box": [round(float(v)) for v in face[:4]], "name": matched,
                          "similarity": similarity, "score": float(face[14])})
        result = {"faces": faces, "profileNames": self.store.names()}
        if op == "enroll":
            if len(detections) != 1:
                raise ValueError("Enrollment needs exactly one visible face.")
            face = detections[0]
            x, y, width, height = (float(v) for v in face[:4])
            frame_height, frame_width = image.shape[:2]
            if (face[14] < .90 or min(width, height) < 80
                    or width * height < .04 * frame_width * frame_height
                    or x < 0 or y < 0 or x + width > frame_width or y + height > frame_height):
                raise ValueError("Move closer and keep one well-lit face fully visible.")
            feature = normalize_embedding(self.vision.embedding(image, face))
            if name != self.pending_name:
                self.reset_enrollment()
                self.pending_name = name
            if any(float(np.dot(feature, prior)) < ENROLL_SIMILARITY for prior in self.pending):
                raise ValueError("Face references did not match. Start enrollment again.")
            self.pending.append(feature.copy())
            count = len(self.pending)
            complete = count == ENROLL_REQUIRED
            if complete:
                self.store.put(name, self.pending)
                self.reset_enrollment()
                result["profileNames"] = self.store.names()
            result["enrollment"] = {"name": name, "count": count,
                                    "required": ENROLL_REQUIRED, "complete": complete}
        return result


def main():
    parser = argparse.ArgumentParser(description="Local face analysis over JSON lines")
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--profiles", required=True, type=Path)
    args = parser.parse_args()
    # Explicit encoding is needed on Windows for local names such as Jörg.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    worker = None
    while True:
        line = sys.stdin.readline(MAX_LINE_CHARS + 1)
        if not line:
            break
        request_id = None
        try:
            if len(line) > MAX_LINE_CHARS:
                while line and not line.endswith("\n"):
                    line = sys.stdin.readline(MAX_LINE_CHARS + 1)
                raise ValueError("Camera request is too large.")
            try:
                request = json.loads(line)
            except (ValueError, RecursionError):
                raise ValueError("Camera request is invalid JSON.") from None
            if not isinstance(request, dict):
                raise ValueError("Provide a camera request object.")
            request_id = request.get("id")
            if (not isinstance(request_id, (str, int, type(None))) or isinstance(request_id, bool)
                    or isinstance(request_id, str) and (len(request_id) > 128 or not request_id.isprintable())):
                request_id = None
                raise ValueError("Camera request ID is invalid.")
            if worker is None:
                # Forget-all also recovers from a corrupt profile file.
                if request.get("op") == "forget" and request.get("name") is None:
                    args.profiles.unlink(missing_ok=True)
                worker = FaceWorker(args.models, args.profiles)
            result = worker.handle(request)
            response = {"id": request_id, "result": result}
        except Exception as error:
            if worker is not None:
                worker.reset_enrollment()
            message = str(error) if isinstance(error, ValueError) else "Local face analysis failed."
            response = {"id": request_id, "error": message}
        print(json.dumps(response, ensure_ascii=False, allow_nan=False, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
