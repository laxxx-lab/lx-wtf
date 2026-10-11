"""Privacy and identity checks; never accesses a camera or a network."""
import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import cv2
import numpy as np


def vector(first=1.0, second=0.0):
    value = np.zeros(128, dtype=np.float32)
    value[:2] = first, second
    return value


class SyntheticVision:
    """Only model inference is replaced; decoding and worker policy remain real."""
    def __init__(self):
        self.faces = [np.array([80, 50, 160, 160, *([120, 110] * 5), .99])]
        self.feature = vector()

    def detect(self, image):
        return self.faces

    def embedding(self, image, face):
        return self.feature


class CameraWorkerTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("camera_worker", Path(__file__).with_name("camera_worker.py"))
        self.assertTrue(spec and spec.loader, "worker must implement the camera protocol")
        self.module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(self.module)
        except FileNotFoundError:
            self.fail("camera_worker.py must implement the camera protocol")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "profiles.json"
        self.vision = SyntheticVision()
        self.worker = self.module.FaceWorker(Path(self.temp.name), self.path, vision=self.vision)
        ok, jpeg = cv2.imencode(".jpg", np.zeros((300, 400, 3), dtype=np.uint8))
        self.assertTrue(ok)
        self.image = base64.b64encode(jpeg).decode("ascii")

    def request(self, op="analyze", **fields):
        return self.worker.handle({"op": op, "image": self.image, **fields})

    def enroll(self, name="Ada"):
        return [self.request("enroll", name=name) for _ in range(3)]

    def test_three_consistent_frames_persist_names_and_embeddings_only(self):
        results = self.enroll()
        self.assertEqual([r["enrollment"]["count"] for r in results], [1, 2, 3])
        self.assertEqual([r["enrollment"]["complete"] for r in results], [False, False, True])
        self.assertEqual(results[-1]["profileNames"], ["Ada"])
        saved = json.loads(self.path.read_text())
        self.assertEqual(set(saved), {"version", "profiles"})
        self.assertEqual(set(saved["profiles"][0]), {"name", "embeddings"})
        self.assertEqual(len(saved["profiles"][0]["embeddings"]), 3)
        self.assertNotIn(self.image, self.path.read_text())
        self.assertEqual(list(Path(self.temp.name).iterdir()), [self.path])

    def test_recognition_requires_explicit_opt_in_and_unknown_stays_unknown(self):
        self.enroll()
        self.assertIsNone(self.request()["faces"][0]["name"])
        self.assertIsNone(self.request(recognize="true")["faces"][0]["name"])
        self.assertEqual(self.request(recognize=True)["faces"][0]["name"], "Ada")
        self.vision.feature = vector(0, 1)
        result = self.request(recognize=True)["faces"][0]
        self.assertIsNone(result["name"])
        self.assertLess(result["similarity"], .55)

    def test_ambiguous_match_against_a_different_profile_stays_unknown(self):
        store = self.module.ProfileStore(self.path)
        store.put("Ada", [vector()])
        store.put("Bea", [vector(.99, .1)])
        self.worker = self.module.FaceWorker(Path(self.temp.name), self.path, vision=self.vision)
        self.assertIsNone(self.request(recognize=True)["faces"][0]["name"])

    def test_same_profile_templates_do_not_count_as_competing_people(self):
        self.enroll()
        self.assertEqual(self.request(recognize=True)["faces"][0]["name"], "Ada")

    def test_bad_quality_resets_enrollment(self):
        for bad in ([], self.vision.faces * 2,
                    [np.array([80, 50, 20, 20, *([90, 60] * 5), .99])],
                    [np.array([80, 50, 160, 160, *([120, 110] * 5), .6])],
                    [np.array([-10, 50, 160, 160, *([120, 110] * 5), .99])]):
            good = self.vision.faces
            self.request("enroll", name="Ada")
            self.vision.faces = bad
            with self.assertRaises(ValueError):
                self.request("enroll", name="Ada")
            self.vision.faces = good
            self.assertEqual(self.request("enroll", name="Ada")["enrollment"]["count"], 1)
            self.request("forget")
        self.assertFalse(self.path.exists() and json.loads(self.path.read_text())["profiles"])

    def test_name_changes_and_inconsistent_faces_reset_enrollment(self):
        self.request("enroll", name="Ada")
        self.assertEqual(self.request("enroll", name="Bea")["enrollment"]["count"], 1)
        self.vision.feature = vector(0, 1)
        with self.assertRaises(ValueError):
            self.request("enroll", name="Bea")
        self.assertEqual(self.request("enroll", name="Bea")["enrollment"]["count"], 1)
        self.assertFalse(self.path.exists())

    def test_invalid_images_reset_pending_enrollment(self):
        self.request("enroll", name="Ada")
        for image in ("not base64", base64.b64encode(b"not jpeg").decode("ascii")):
            with self.assertRaises(ValueError):
                self.request("enroll", name="Ada", image=image)
        self.assertEqual(self.request("enroll", name="Ada")["enrollment"]["count"], 1)

    def test_forget_one_and_all_survives_reload(self):
        self.enroll("Ada")
        self.vision.feature = vector(0, 1)
        self.enroll("Bea")
        self.assertEqual(self.request("forget", name="Ada")["profileNames"], ["Bea"])
        reloaded = self.module.FaceWorker(Path(self.temp.name), self.path, vision=self.vision)
        self.assertEqual(reloaded.handle({"op": "profiles"})["profileNames"], ["Bea"])
        self.assertEqual(reloaded.handle({"op": "forget"})["profileNames"], [])
        self.assertEqual(self.module.ProfileStore(self.path).names(), [])

    def test_corrupt_storage_and_invalid_embeddings_are_rejected(self):
        for embeddings in ([[1, 2]], [[float("nan")] * 128], [[float("inf")] * 128], [[0] * 128]):
            self.path.write_text(json.dumps({"version": 1, "profiles": [{"name": "Ada", "embeddings": embeddings}]}))
            with self.assertRaises(ValueError):
                self.module.ProfileStore(self.path)
        self.path.write_text("broken private content")
        with self.assertRaises(ValueError) as caught:
            self.module.ProfileStore(self.path)
        self.assertNotIn("private content", str(caught.exception))

    def test_names_reject_controls_empty_overlong_and_non_strings(self):
        for name in ("", " ", "A\nB", "A\x00B", "A\u202eB", "A" * 61, 42):
            with self.assertRaises(ValueError):
                self.request("enroll", name=name)
        self.assertEqual(self.request("enroll", name="  Jörg Müller  ")["enrollment"]["name"], "Jörg Müller")

    def test_no_embeddings_or_images_in_public_result(self):
        self.enroll()
        face = self.request(recognize=True)["faces"][0]
        self.assertEqual(set(face), {"box", "name", "similarity", "score"})
        self.assertEqual(face["box"], [80, 50, 160, 160])

    def test_jpeg_dimensions_are_bounded_before_inference(self):
        ok, jpeg = cv2.imencode(".jpg", np.zeros((721, 960, 3), dtype=np.uint8))
        self.assertTrue(ok)
        with self.assertRaises(ValueError):
            self.request(image=base64.b64encode(jpeg).decode("ascii"))

    def test_normalized_cosine_rejects_weak_similarity(self):
        store = self.module.ProfileStore(self.path)
        store.put("Ada", [vector(7, 0)])
        self.assertEqual(store.match(vector(100, 0))[0], "Ada")
        self.assertIsNone(store.match(vector(.5, .8660254))[0])

    def test_protocol_recovers_after_bad_request_without_logging_payload(self):
        secret = "private-frame-content"
        payload = "{broken json " + secret + "}\n" + json.dumps({"id": "bad", "op": "analyze", "image": secret}) + "\n"
        payload += json.dumps({"id": "good", "op": "profiles"}) + "\n"
        process = subprocess.run([sys.executable, str(Path(__file__).with_name("camera_worker.py")),
                                  "--models", self.temp.name, "--profiles", str(self.path)],
                                 input=payload, capture_output=True, text=True, encoding="utf-8", timeout=10)
        self.assertEqual(process.returncode, 0)
        self.assertNotIn(secret, process.stdout + process.stderr)
        replies = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual([r["id"] for r in replies], [None, "bad", "good"])
        self.assertIn("error", replies[0])
        self.assertIn("error", replies[1])
        self.assertEqual(replies[2]["result"]["profileNames"], [])

    def test_protocol_forget_all_recovers_corrupt_profiles(self):
        self.path.write_text("broken private storage")
        payload = json.dumps({"id": 1, "op": "profiles"}) + "\n"
        payload += json.dumps({"id": 2, "op": "forget"}) + "\n"
        payload += json.dumps({"id": 3, "op": "profiles"}) + "\n"
        process = subprocess.run([sys.executable, str(Path(__file__).with_name("camera_worker.py")),
                                  "--models", self.temp.name, "--profiles", str(self.path)],
                                 input=payload, capture_output=True, text=True, encoding="utf-8", timeout=10)
        replies = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertIn("error", replies[0])
        self.assertEqual(replies[1]["result"]["profileNames"], [])
        self.assertEqual(replies[2]["result"]["profileNames"], [])
        self.assertNotIn("private storage", process.stdout + process.stderr)

    def test_untrusted_id_cannot_echo_large_payloads(self):
        secret = "private-data-" * 100
        process = subprocess.run([sys.executable, str(Path(__file__).with_name("camera_worker.py")),
                                  "--models", self.temp.name, "--profiles", str(self.path)],
                                 input=json.dumps({"id": secret, "op": "profiles"}) + "\n",
                                 capture_output=True, text=True, encoding="utf-8", timeout=10)
        reply = json.loads(process.stdout)
        self.assertIsNone(reply["id"])
        self.assertIn("error", reply)
        self.assertNotIn(secret, process.stdout + process.stderr)


class PublicFixtureTests(unittest.TestCase):
    """Optional model integration; fixtures are OpenCV samples, never a webcam."""
    def test_real_models_enroll_one_person_and_leave_other_person_unknown(self):
        root = Path(__file__).resolve().parents[1]
        models = root / "runtime" / "vision" / "models"
        fixtures = root / "runtime" / "vision" / "fixtures"
        required = [models / "face_detection_yunet_2023mar.onnx",
                    models / "face_recognition_sface_2021dec.onnx",
                    fixtures / "lena.jpg", fixtures / "messi5.jpg"]
        if not all(path.is_file() for path in required):
            self.skipTest("Install local face models and OpenCV public fixtures to run integration.")
        local = root / ".local"
        local.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="camera-fixture-test-", dir=local) as directory:
            profile = Path(directory) / "profiles.json"
            lena = base64.b64encode((fixtures / "lena.jpg").read_bytes()).decode("ascii")
            messi = base64.b64encode((fixtures / "messi5.jpg").read_bytes()).decode("ascii")
            requests = [{"id": "detect", "op": "analyze", "image": lena}]
            requests += [{"id": i, "op": "enroll", "name": "Public fixture", "image": lena} for i in range(3)]
            requests += [{"id": "known", "op": "analyze", "recognize": True, "image": lena},
                         {"id": "unknown", "op": "analyze", "recognize": True, "image": messi},
                         {"id": "forget", "op": "forget"}]
            process = subprocess.run([sys.executable, str(root / "scripts" / "camera_worker.py"),
                                      "--models", str(models), "--profiles", str(profile)],
                                     input="".join(json.dumps(request) + "\n" for request in requests),
                                     capture_output=True, text=True, encoding="utf-8", timeout=30)
            self.assertEqual(process.returncode, 0, process.stderr)
            replies = [json.loads(line) for line in process.stdout.splitlines()]
            self.assertEqual(len(replies), 7)
            self.assertTrue(all("result" in reply for reply in replies), replies)
            self.assertEqual(len(replies[0]["result"]["faces"]), 1)
            self.assertIsNone(replies[0]["result"]["faces"][0]["name"])
            self.assertTrue(replies[3]["result"]["enrollment"]["complete"])
            self.assertEqual(replies[4]["result"]["faces"][0]["name"], "Public fixture")
            self.assertGreaterEqual(len(replies[5]["result"]["faces"]), 1)
            self.assertTrue(all(face["name"] is None for face in replies[5]["result"]["faces"]))
            self.assertEqual(replies[6]["result"]["profileNames"], [])


if __name__ == "__main__":
    unittest.main()
