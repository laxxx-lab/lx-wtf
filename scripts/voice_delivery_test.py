import importlib.util
from pathlib import Path
import unittest

class DeliveryTests(unittest.TestCase):
    def test_delivery_does_not_conflict_with_baseline_instructions(self):
        spec=importlib.util.spec_from_file_location('voice',Path(__file__).with_name('voice_synthesize.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        normal=module.speech_request('Ich bin da.','dark',42)
        whispered=module.speech_request('Ich bin da.','dark',42,'whisper')
        power=module.speech_request('Ich bin da.','dark',42,'power')
        self.assertEqual(whispered['input'],normal['input'])
        self.assertIn('Whisper',whispered['instructions'])
        self.assertNotIn('no shouting',power['instructions'])
        self.assertIn('powerful',power['instructions'])
        with self.assertRaises(ValueError):module.speech_request('Hallo','dark',42,'unknown')

if __name__=='__main__':unittest.main()
