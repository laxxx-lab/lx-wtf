"""Stdlib contract checks; run with the isolated voice Python."""
import importlib.util
from pathlib import Path
import unittest


class VoiceContract(unittest.TestCase):
    def test_request_preserves_german_and_selects_prompt(self):
        spec = importlib.util.spec_from_file_location("voice", Path(__file__).with_name("voice_synthesize.py"))
        self.assertTrue(Path(spec.origin).exists(), "voice adapter has not been implemented")
        voice = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(voice)
        request = voice.speech_request("  Grüße, Patrick!  ", "dark", 42)
        self.assertEqual(request["input"], "Grüße, Patrick!")
        self.assertEqual(request["language"], "German")
        self.assertEqual(request["response_format"], "wav")
        self.assertEqual(request["seed"], 42)
        self.assertIn("female", request["instructions"])
        self.assertNotEqual(request["instructions"], voice.speech_request("Hallo", "playful", 42)["instructions"])
        for text, name in [("  ", "dark"), ("Hallo", "unknown")]:
            with self.assertRaises(ValueError):
                voice.speech_request(text, name, 42)


if __name__ == "__main__":
    unittest.main()
