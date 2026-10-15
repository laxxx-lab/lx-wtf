import importlib.util
import pathlib
import unittest

source = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'desktop_gestures.py'
spec = importlib.util.spec_from_file_location('desktop_gestures', source)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FakeNative:
    def __init__(self):
        self.calls = []
        self.available = True

    def check_desktop(self):
        return self.available

    def apply(self, kind, **values):
        self.calls.append((kind, values))


class InputTests(unittest.TestCase):
    def test_stale_or_untyped_packets_cannot_move_or_click(self):
        native = FakeNative()
        control = worker.InputController(native, now=lambda: 1000)
        for packet in [{'kind': 'click', 'x': .5, 'y': .5, 'at': 1},
                       {'kind': 'move', 'x': float('nan'), 'y': .5, 'at': 1000},
                       {'kind': 'shell', 'at': 1000}]:
            self.assertFalse(control.handle(packet))
        self.assertEqual(native.calls, [])

    def test_watchdog_and_desktop_loss_release_a_drag_without_a_click(self):
        native = FakeNative()
        now = [1000]
        control = worker.InputController(native, now=lambda: now[0])
        self.assertTrue(control.handle({'kind': 'down', 'id': 1, 'at': 1000}))
        now[0] = 1400
        control.check()
        self.assertEqual(native.calls[-1], ('cancel', {}))
        self.assertFalse(control.down)
        self.assertTrue(control.handle({'kind': 'down', 'id': 2, 'at': 1400}))
        native.available = False
        control.check()
        self.assertFalse(control.down)
        self.assertNotIn('click', [kind for kind, _ in native.calls])


if __name__ == '__main__':
    unittest.main()
