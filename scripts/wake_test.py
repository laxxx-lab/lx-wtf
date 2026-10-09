import importlib.util
from pathlib import Path
import unittest

class WakeTests(unittest.TestCase):
    def test_aliases_match_only_requested_names_and_can_disable_bare_names(self):
        spec = importlib.util.spec_from_file_location('wake', Path(__file__).with_name('wake_listener.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.accepted_phrase('HEY_LILITH', True), 'Hey Lilith')
        self.assertEqual(module.accepted_phrase('LILLIS', True), 'Lillis')
        self.assertIsNone(module.accepted_phrase('LILITH', False))
        self.assertIsNone(module.accepted_phrase('HELLO', True))

    def test_spikes_do_not_fire_and_detection_has_cooldown(self):
        spec = importlib.util.spec_from_file_location('wake', Path(__file__).with_name('wake_listener.py'))
        self.assertTrue(Path(spec.origin).exists(), 'wake listener missing')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        gate = module.WakeDebouncer()
        self.assertFalse(gate.observe(.8, 0))
        self.assertFalse(gate.observe(.1, .08))
        self.assertFalse(gate.observe(.8, .16))
        self.assertFalse(gate.observe(.8, .24))
        self.assertTrue(gate.observe(.8, .32))
        for time in [.4, .48, .56, .64, .72]:
            self.assertFalse(gate.observe(.9, time))
        self.assertFalse(gate.observe(.8, 3))
        self.assertFalse(gate.observe(.8, 3.08))
        self.assertTrue(gate.observe(.8, 3.16))

if __name__ == '__main__':
    unittest.main()
