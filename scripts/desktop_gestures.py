"""Local, persistent Windows mouse input. No camera, screenshots or network."""
import ctypes
from ctypes import wintypes
import json
import math
import queue
import sys
import threading
import time


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG),
                ('mouseData', wintypes.DWORD), ('dwFlags', wintypes.DWORD),
                ('time', wintypes.DWORD), ('dwExtraInfo', ctypes.c_size_t)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [('wVk', wintypes.WORD), ('wScan', wintypes.WORD),
                ('dwFlags', wintypes.DWORD), ('time', wintypes.DWORD),
                ('dwExtraInfo', ctypes.c_size_t)]


class INPUTUNION(ctypes.Union):
    _fields_ = [('mi', MOUSEINPUT), ('ki', KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [('type', wintypes.DWORD), ('data', INPUTUNION)]


class NativeInput:
    def __init__(self):
        if sys.platform != 'win32':
            raise RuntimeError('Nur unter Windows verfügbar.')
        self.api = ctypes.WinDLL('user32', use_last_error=True)
        self.api.SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
        self.api.SendInput.restype = wintypes.UINT
        self.api.OpenInputDesktop.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
        self.api.OpenInputDesktop.restype = wintypes.HANDLE
        self.api.GetUserObjectInformationW.argtypes = (wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD))
        self.api.CloseDesktop.argtypes = (wintypes.HANDLE,)
        self.api.GetAsyncKeyState.argtypes = (ctypes.c_int,)
        self.api.GetAsyncKeyState.restype = ctypes.c_short
        try:
            self.api.SetProcessDpiAwarenessContext.argtypes = (ctypes.c_void_p,)
            self.api.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        except AttributeError:
            self.api.SetProcessDPIAware()
        session = wintypes.DWORD()
        kernel = ctypes.WinDLL('kernel32')
        if not kernel.ProcessIdToSessionId(kernel.GetCurrentProcessId(), ctypes.byref(session)) or session.value == 0:
            raise RuntimeError('Eine interaktive Windows-Sitzung wird benötigt.')

    def check_desktop(self):
        handle = self.api.OpenInputDesktop(0, False, 1)
        if not handle:
            return False
        try:
            name, length = ctypes.create_unicode_buffer(128), wintypes.DWORD()
            return bool(self.api.GetUserObjectInformationW(handle, 2, name, ctypes.sizeof(name), ctypes.byref(length))) and name.value == 'Default'
        finally:
            self.api.CloseDesktop(handle)

    @staticmethod
    def mouse(flags, x=0, y=0, delta=0):
        return INPUT(type=0, data=INPUTUNION(mi=MOUSEINPUT(x, y, delta & 0xffffffff, flags, 0, 0)))

    @staticmethod
    def key(vk, up=False):
        return INPUT(type=1, data=INPUTUNION(ki=KEYBDINPUT(vk, 0, 2 if up else 0, 0, 0)))

    def send(self, events):
        inputs = (INPUT * len(events))(*events)
        if self.api.SendInput(len(events), inputs, ctypes.sizeof(INPUT)) != len(events):
            raise RuntimeError('Windows hat die Eingabe blockiert (z. B. erhöhte Anwendung).')

    def apply(self, kind, **values):
        move = lambda: self.mouse(0x0001 | 0x8000 | 0x4000,
                                 round(values['x'] * 65535), round(values['y'] * 65535))
        if kind == 'move':
            self.send([move()])
        elif kind == 'click':
            self.send([move(), self.mouse(2), self.mouse(4)])
        elif kind == 'down':
            self.send([self.mouse(2)])
        elif kind == 'up':
            self.send([self.mouse(4)])
        elif kind == 'scroll':
            self.send([self.mouse(0x0800, delta=values['delta'])])
        elif kind == 'zoom':
            ctrl_held = bool(self.api.GetAsyncKeyState(0x11) & 0x8000)
            try:
                self.send(([self.key(0x11)] if not ctrl_held else []) + [self.mouse(0x0800, delta=values['delta'])] + ([self.key(0x11, True)] if not ctrl_held else []))
            finally:
                if not ctrl_held:
                    self.send([self.key(0x11, True)])
        elif kind == 'cancel':
            # Escape cancels the native drag before releasing our mouse button.
            self.send([self.key(0x1b), self.key(0x1b, True), self.mouse(4)])


class InputController:
    def __init__(self, native, now=lambda: time.time() * 1000):
        self.native, self.now = native, now
        self.down, self.last_at, self.last_id = False, None, -1

    def cancel(self):
        try:
            if self.down:
                self.native.apply('cancel')
        finally:
            self.down = False
            self.last_at = None

    def check(self):
        if self.down and (self.last_at is None or self.now() - self.last_at > 350 or not self.native.check_desktop()):
            self.cancel()

    def handle(self, packet):
        if not isinstance(packet, dict):
            return False
        kind, at, identity = packet.get('kind'), packet.get('at'), packet.get('id')
        fields = {'move': {'x', 'y'}, 'click': {'x', 'y'}, 'down': set(), 'up': set(),
                  'scroll': {'delta'}, 'zoom': {'delta'}, 'cancel': set(), 'ping': set()}
        if kind not in fields or set(packet) != fields[kind] | {'kind', 'at', 'id'}:
            return False
        if type(identity) is not int or identity <= self.last_id:
            return False
        if type(at) not in (int, float) or not math.isfinite(at) or self.now() - at > 350 or at > self.now() + 50:
            return False
        if kind in ('move', 'click') and not all(type(packet.get(key)) in (int, float) and math.isfinite(packet[key]) and 0 <= packet[key] <= 1 for key in ('x', 'y')):
            return False
        if kind in ('scroll', 'zoom') and (type(packet.get('delta')) is not int or not 0 < abs(packet['delta']) <= 480):
            return False
        if not self.native.check_desktop():
            self.cancel()
            raise RuntimeError('Windows-Desktop ist gesperrt oder nicht interaktiv.')
        self.last_id, self.last_at = identity, at
        if kind == 'cancel':
            self.cancel()
        elif kind != 'ping':
            if kind == 'down':
                self.down = True
            self.native.apply(kind, **{key: packet[key] for key in fields[kind]})
            if kind == 'up':
                self.down = False
        return True


def output(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


def main():
    native = NativeInput()
    if not native.check_desktop():
        raise RuntimeError('Windows-Desktop ist gesperrt oder nicht interaktiv.')
    if '--probe' in sys.argv:
        point = wintypes.POINT()
        native.api.GetCursorPos(ctypes.byref(point))
        output({'ready': True, 'interactiveDesktop': True, 'inputBytes': ctypes.sizeof(INPUT),
                'virtualDesktop': dict(zip(('x', 'y', 'width', 'height'), (native.api.GetSystemMetrics(i) for i in (76, 77, 78, 79)))),
                'cursor': {'x': point.x, 'y': point.y}})
        return
    control, messages = InputController(native), queue.Queue(maxsize=32)

    def read():
        for line in sys.stdin:
            messages.put(line)
        messages.put(None)

    threading.Thread(target=read, daemon=True).start()
    output({'ready': True})
    try:
        while True:
            control.check()
            try:
                line = messages.get(timeout=.05)
            except queue.Empty:
                continue
            if line is None:
                return
            try:
                packet = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(packet, dict):
                continue
            applied = control.handle(packet)
            output({'id': packet.get('id'), 'kind': packet.get('kind'), 'applied': applied})
    finally:
        control.cancel()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        output({'error': str(error)[:180]})
        sys.exit(1)
